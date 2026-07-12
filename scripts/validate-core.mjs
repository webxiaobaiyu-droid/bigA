import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });

try {
  const { getAshareMarketPhase, isAshareTradingDate } = await server.ssrLoadModule('/src/services/marketCalendar.ts');
  const { assessMarketDataHealth } = await server.ssrLoadModule('/src/services/dataHealth.ts');
  const { adjustmentQueryValue, candleVariantKey } = await server.ssrLoadModule('/src/services/adjustment.ts');
  const { applySinaAdjustmentFactors } = await server.ssrLoadModule('/src/services/historicalCandles.ts');
  const watchlist = await server.ssrLoadModule('/src/services/watchlistState.ts');

  const shanghaiTime = (value) => new Date(`${value}+08:00`);
  assert.equal(getAshareMarketPhase(shanghaiTime('2026-07-12T10:00:00')).type, 'closed', '周末应休市');
  assert.equal(getAshareMarketPhase(shanghaiTime('2026-02-16T10:00:00')).reason, '春节休市', '配置节假日应休市');
  assert.equal(isAshareTradingDate('2026-07-13'), true, '普通工作日应开市');
  assert.equal(getAshareMarketPhase(shanghaiTime('2026-07-13T09:14:00')).type, 'preopen');
  assert.equal(getAshareMarketPhase(shanghaiTime('2026-07-13T09:20:00')).type, 'auction');
  assert.equal(getAshareMarketPhase(shanghaiTime('2026-07-13T09:27:00')).type, 'preopen');
  assert.equal(getAshareMarketPhase(shanghaiTime('2026-07-13T09:30:00')).type, 'trading');
  assert.equal(getAshareMarketPhase(shanghaiTime('2026-07-13T11:30:00')).type, 'noon');
  assert.equal(getAshareMarketPhase(shanghaiTime('2026-07-13T13:00:00')).type, 'trading');
  assert.equal(getAshareMarketPhase(shanghaiTime('2026-07-13T14:58:00')).type, 'auction');
  assert.equal(getAshareMarketPhase(shanghaiTime('2026-07-13T15:00:00')).type, 'closed');

  assert.equal(adjustmentQueryValue('none'), '0');
  assert.equal(adjustmentQueryValue('forward'), '1');
  assert.equal(adjustmentQueryValue('backward'), '2');
  assert.equal(candleVariantKey('fs', 'backward'), 'fs:forward', '分时不应产生复权变体');
  assert.equal(candleVariantKey('1d', 'backward'), '1d:backward');
  const rawCandles = [{ time: shanghaiTime('2025-06-12T15:00:00').getTime() / 1000, open: 10, high: 11, low: 9, close: 10, volume: 100 }];
  const factors = [{ d: '2026-06-12', f: '1' }, { d: '2025-06-13', f: '1.25' }, { d: '2024-06-19', f: '2' }];
  assert.equal(applySinaAdjustmentFactors(rawCandles, factors, 'forward')[0].close, 5, '前复权应除以对应因子');
  assert.equal(applySinaAdjustmentFactors(rawCandles, factors, 'backward')[0].close, 20, '后复权应乘以对应因子');

  const now = shanghaiTime('2026-07-13T10:00:00').getTime();
  const tradingPhase = getAshareMarketPhase(new Date(now));
  const closedPhase = getAshareMarketPhase(shanghaiTime('2026-07-12T10:00:00'));
  const rowsAt = (updatedAt) => [{ quote: { updatedAt } }];
  assert.equal(assessMarketDataHealth(rowsAt(now - 5_000), '东方财富实时', tradingPhase, now).state, 'live');
  assert.equal(assessMarketDataHealth(rowsAt(now - 30_000), '东方财富实时', tradingPhase, now).state, 'delayed');
  assert.equal(assessMarketDataHealth(rowsAt(now - 90_000), '东方财富实时', tradingPhase, now).state, 'stale');
  assert.equal(assessMarketDataHealth(rowsAt(now - 90_000), '新浪兜底', tradingPhase, now).state, 'fallback');
  assert.equal(assessMarketDataHealth(rowsAt(now - 86_400_000), '东方财富实时', closedPhase, now).state, 'closed');
  assert.equal(assessMarketDataHealth([], '行情请求失败', tradingPhase, now).state, 'error');

  const metas = [
    { code: '600519', name: '贵州茅台', market: 'SH', sector: '白酒', basePrice: 1, floatMarketCap: 0, pe: 0, beta: 1, style: 'core' },
    { code: '000001', name: '平安,银行', market: 'SZ', sector: '银行', basePrice: 1, floatMarketCap: 0, pe: 0, beta: 1, style: 'core' }
  ];
  let organization = watchlist.normalizeWatchlistOrganization(null, metas, now);
  assert.equal(organization.groups.length, 4, '首次使用应创建默认分组');
  assert.deepEqual(organization.entries.map((entry) => entry.code), ['600519', '000001']);
  organization = { ...organization, groups: watchlist.createWatchGroup(organization.groups, '波段', now) };
  const waveGroup = organization.groups.find((group) => group.name === '波段');
  organization = watchlist.updateWatchEntry(organization, '600519', { groupId: waveGroup.id, tags: ['核心', '消费', '核心'] });
  assert.deepEqual(organization.entries.find((entry) => entry.code === '600519').tags, ['核心', '消费'], '标签应去重');
  organization = watchlist.reorderWatchEntries(organization, '000001', '600519');
  assert.equal(organization.entries[0].code, '000001', '拖动排序应稳定更新 order');
  const csv = watchlist.exportWatchlistCsv(metas, organization);
  const imported = watchlist.parseWatchlistImport(csv);
  assert.equal(imported.length, 2, 'CSV 应完整往返');
  assert.equal(imported.find((row) => row.meta.code === '000001').meta.name, '平安,银行', 'CSV 引号字段应保留逗号');
  organization = watchlist.removeWatchGroup(organization, waveGroup.id);
  assert.equal(organization.entries.find((entry) => entry.code === '600519').groupId, 'observe', '删除分组应迁移到观察组');

  console.log('Core validation passed: calendar, data health, adjustment and watchlist semantics.');
} finally {
  await server.close();
}
