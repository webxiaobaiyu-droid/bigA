import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });

try {
  const history = await server.ssrLoadModule('/src/services/marketHistory.ts');
  const baseTime = 1_700_000_000_000;
  const sentiment = (updatedAt, score = 60) => ({
    tradeDate: '2026-07-10', updatedAt, total: 5_000, up: 3_000, down: 1_900, flat: 100,
    limitUp: 60, limitDown: 10, brokenLimit: 20, sealRate: 75, maxStreak: 4, score, label: '活跃',
    indices: [{ code: '000001', name: '上证指数', price: 3_500, changePct: 1, amount: 1 }], leaders: []
  });
  let sentimentPoints = history.appendSentimentHistory([], sentiment(baseTime));
  sentimentPoints = history.appendSentimentHistory(sentimentPoints, sentiment(baseTime + 60_000, 64));
  assert.equal(sentimentPoints.length, 1, '同一五分钟桶更新而不是追加');
  assert.equal(sentimentPoints[0].score, 64, '同一桶保留最新快照');
  sentimentPoints = history.appendSentimentHistory(sentimentPoints, sentiment(baseTime + 6 * 60_000, 66));
  assert.equal(sentimentPoints.length, 2, '跨五分钟桶追加快照');

  const sector = (code, name, netAmount, netRatio = 1) => ({ code, name, changePct: netAmount > 0 ? 1 : -1, netAmount, netRatio });
  const point = (id, tradeDate, updatedAt, sectors) => ({ id, tradeDate, updatedAt, sectors });
  const flowPoints = [
    point('d1', '2026-07-08', baseTime, [sector('a', '半导体', 100), sector('b', '银行', -80)]),
    point('d2a', '2026-07-09', baseTime + 86_400_000, [sector('a', '半导体', 120), sector('b', '银行', -60)]),
    point('d2b', '2026-07-09', baseTime + 86_700_000, [sector('a', '半导体', 150), sector('b', '银行', -50)])
  ];
  const current = { tradeDate: '2026-07-10', updatedAt: baseTime + 2 * 86_400_000, sectors: [sector('a', '半导体', 220), sector('b', '银行', -30)], stocks: [] };
  const rows = history.analyzeSectorRotation(flowPoints, current);
  const chip = rows.find((row) => row.code === 'a');
  const bank = rows.find((row) => row.code === 'b');
  assert.equal(chip.inflowStreakDays, 3, '盘中多个快照只按一个交易日计算');
  assert.equal(bank.outflowStreakDays, 3, '连续流出按交易日计算');
  assert.equal(chip.momentum, 70, '加速度使用相邻快照净额差');
  assert.equal(chip.state, 'strengthening', '净流入加速识别为增强');
  console.log('Market history validation passed: bucket dedupe, daily streaks, momentum and rotation state.');
} finally {
  await server.close();
}
