import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });

try {
  const { createAlertRuntime, evaluateAlerts, getAsharePriceLimitPct } = await server.ssrLoadModule('/src/services/alertEngine.ts');
  const now = 1_700_000_000_000;
  const rule = (type, threshold, extra = {}) => ({ id: type, name: type, type, enabled: true, threshold, cooldownMs: 60_000, ...extra });
  const state = (overrides = {}) => {
    const quote = {
      code: '600000', name: '浦发银行', market: 'SH', sector: '银行', price: 10, prevClose: 10,
      open: 10, high: 10, low: 10, change: 0, changePct: 0, volume: 100, amount: 1_000,
      turnoverRate: 1, amplitude: 0, speed: 0, bid: [], ask: [], updatedAt: now,
      ...overrides.quote
    };
    const meta = {
      code: quote.code, name: quote.name, market: quote.market, sector: quote.sector, basePrice: 10,
      floatMarketCap: 100, pe: 10, beta: 1, style: 'core', ...overrides.meta
    };
    return {
      meta, quote,
      candles: { fs: [], '1d': [], '1w': [], '1mo': [], ...overrides.candles },
      indicators: { ma5: null, ma10: null, ma20: null, rsi6: null, dif: null, dea: null, macd: null, volumeRatio: null, trendLabel: '震荡', ...overrides.indicators },
      signals: []
    };
  };

  const priceRule = rule('priceAbove', 10);
  const below = state({ quote: { price: 9 } });
  const above = state({ quote: { price: 11 } });
  let result = evaluateAlerts({ instruments: [below], rules: [priceRule], runtime: createAlertRuntime(), now });
  assert.equal(result.events.length, 0, '阈值以下不触发');
  result = evaluateAlerts({ instruments: [above], rules: [priceRule], runtime: result.runtime, now: now + 1_000 });
  assert.equal(result.events.length, 1, 'false -> true 边沿触发');
  const triggeredRuntime = result.runtime;
  result = evaluateAlerts({ instruments: [above], rules: [priceRule], runtime: triggeredRuntime, now: now + 120_000 });
  assert.equal(result.events.length, 0, '持续命中即使过冷却也不重复');
  result = evaluateAlerts({ instruments: [below], rules: [priceRule], runtime: result.runtime, now: now + 121_000 });
  result = evaluateAlerts({ instruments: [above], rules: [priceRule], runtime: result.runtime, now: now + 122_000 });
  assert.equal(result.events.length, 1, '退出后再次进入且冷却结束可重触发');

  let cooldown = evaluateAlerts({ instruments: [above], rules: [priceRule], runtime: createAlertRuntime(), now });
  cooldown = evaluateAlerts({ instruments: [below], rules: [priceRule], runtime: cooldown.runtime, now: now + 1_000 });
  cooldown = evaluateAlerts({ instruments: [above], rules: [priceRule], runtime: cooldown.runtime, now: now + 2_000 });
  assert.equal(cooldown.events.length, 0, '冷却期内的新边沿被抑制');

  const missing = state({ quote: { price: Number.NaN } });
  const missingResult = evaluateAlerts({ instruments: [missing], rules: [priceRule], runtime: triggeredRuntime, now: now + 1_000 });
  assert.deepEqual(missingResult.runtime, triggeredRuntime, '缺失数据不触发且不改变边沿状态');
  assert.equal(evaluateAlerts({ instruments: [above], rules: [{ ...priceRule, enabled: false }], runtime: createAlertRuntime(), now }).events.length, 0, '禁用规则跳过');
  assert.equal(Object.keys(evaluateAlerts({ instruments: [above], rules: [{ ...priceRule, enabled: false }], runtime: createAlertRuntime(), now }).runtime.entries).length, 0);

  const metricRules = [
    rule('changePctAbove', 2), rule('changePctBelow', -2), rule('volumeRatioAbove', 1.5),
    rule('amountAbove', 5_000), rule('turnoverAbove', 3), rule('sectorChangeAbove', 1)
  ];
  const metricState = state({ quote: { changePct: 3, amount: 10_000, turnoverRate: 4 }, indicators: { volumeRatio: 2 } });
  assert.equal(evaluateAlerts({ instruments: [metricState], rules: metricRules, runtime: createAlertRuntime(), sectorChanges: { 银行: 2 }, now }).events.length, 5);
  assert.equal(evaluateAlerts({ instruments: [metricState], rules: [rule('sectorChangeAbove', 1)], runtime: createAlertRuntime(), now }).events.length, 0, '板块上下文缺失不误触发');
  const groupRule = { ...rule('priceAbove', 2), id: 'group', groupIds: ['trend'] };
  assert.equal(evaluateAlerts({ instruments: [metricState], rules: [groupRule], runtime: createAlertRuntime(), groupIdsByInstrument: { '600000': 'trend' }, now }).events.length, 1, '当前分组匹配时触发');
  assert.equal(evaluateAlerts({ instruments: [metricState], rules: [groupRule], runtime: createAlertRuntime(), groupIdsByInstrument: { '600000': 'observe' }, now }).events.length, 0, '当前分组不匹配时不触发');

  const volumes = [100, 100, 100, 100, 100, 210].map((volume, index) => ({ time: index, open: 10, high: 10, low: 10, close: 10, volume }));
  assert.equal(evaluateAlerts({ instruments: [state({ candles: { '1d': volumes } })], rules: [rule('volumeSurge', 2)], runtime: createAlertRuntime(), now }).events.length, 1);
  assert.equal(evaluateAlerts({ instruments: [state({ candles: { '1d': volumes.slice(0, 3) } })], rules: [rule('volumeSurge', 2)], runtime: createAlertRuntime(), now }).events.length, 0, '量能历史不足不触发');

  const crossUpCloses = [10, 10, 10, 10, 10, 10, 10, 10, 9, 12];
  const crossUpCandles = crossUpCloses.map((close, time) => ({ time, open: close, high: close, low: close, close, volume: 100 }));
  const maRule = { id: 'ma', name: '金叉', type: 'maCrossUp', enabled: true, fastPeriod: 2, slowPeriod: 3 };
  assert.equal(evaluateAlerts({ instruments: [state({ candles: { '1d': crossUpCandles } })], rules: [maRule], runtime: createAlertRuntime(), now }).events.length, 1, '相邻时点均线金叉触发');

  const limitCases = [
    [state({ quote: { name: 'ST样本' } }), 5],
    [state({ quote: { name: 'S*ST样本' } }), 5],
    [state(), 10],
    [state({ quote: { code: '300001', market: 'SZ' }, meta: { code: '300001', market: 'SZ' } }), 20],
    [state({ quote: { code: '688001' }, meta: { code: '688001' } }), 20],
    [state({ quote: { code: '430001', market: 'BJ' }, meta: { code: '430001', market: 'BJ' } }), 30]
  ];
  for (const [instrument, expected] of limitCases) assert.equal(getAsharePriceLimitPct(instrument), expected);
  assert.equal(getAsharePriceLimitPct(state({ quote: { name: 'N样本' } })), null, 'N/C 新股无开板规则');

  const opened = state({ quote: { prevClose: 10, high: 11, price: 10.8 } });
  const sealed = state({ quote: { prevClose: 10, high: 11, price: 11 } });
  const limitRule = { id: 'limit', name: '开板', type: 'limitOpen', enabled: true };
  assert.equal(evaluateAlerts({ instruments: [opened], rules: [limitRule], runtime: createAlertRuntime(), now }).events.length, 1, '触及涨停后回落触发开板');
  assert.equal(evaluateAlerts({ instruments: [sealed], rules: [limitRule], runtime: createAlertRuntime(), now }).events.length, 0, '仍封板不触发');
  assert.equal(evaluateAlerts({ instruments: [state({ quote: { name: 'C样本', prevClose: 10, high: 20, price: 12 } })], rules: [limitRule], runtime: createAlertRuntime(), now }).events.length, 0);

  assert.equal(evaluateAlerts({ instruments: [above], rules: [rule('priceBelow', 12)], runtime: createAlertRuntime(), now }).events.length, 1);
  assert.equal(evaluateAlerts([above], [priceRule], createAlertRuntime(), undefined, now).events.length, 1, '位置参数调用契约可用');
  console.log('Alert validation passed: edges, cooldown, missing data, metrics, MA, volume, sector and A-share limits.');
} finally {
  await server.close();
}
