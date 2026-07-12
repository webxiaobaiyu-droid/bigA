import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });

try {
  const transport = await server.ssrLoadModule('/src/services/marketTransport.ts');
  const first = transport.mergeMarketTransportDailyMetric(undefined, {
    date: '2026-07-12', host: 'push2.eastmoney.com', success: true, latencyMs: 120, retries: 1
  });
  const second = transport.mergeMarketTransportDailyMetric(first, {
    date: '2026-07-12', host: 'push2.eastmoney.com', success: false, latencyMs: 400, retries: 1
  });
  const third = transport.mergeMarketTransportDailyMetric(second, {
    date: '2026-07-12', host: 'push2.eastmoney.com', success: true, latencyMs: 80, retries: 0
  });
  assert.deepEqual({ requests: third.requests, successes: third.successes, failures: third.failures, retries: third.retries, totalLatencyMs: third.totalLatencyMs }, {
    requests: 3, successes: 2, failures: 1, retries: 2, totalLatencyMs: 200
  }, '日质量聚合应只将成功请求计入平均延迟');
  assert.deepEqual(transport.getMarketTransportHistory(), [], '无浏览器存储的 SSR 校验不制造历史状态');
  console.log('Transport validation passed: daily success/failure, retry and latency aggregation.');
} finally {
  await server.close();
}
