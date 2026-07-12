import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });

try {
  const state = await server.ssrLoadModule('/src/services/watchlistState.ts');
  const now = 1_700_000_000_000;
  const groups = state.defaultWatchGroups(now);
  assert.equal(groups.length, 4, '默认创建四个交易分组');

  const csvReport = state.parseWatchlistImportReport([
    'code,name,market,sector,group,tags',
    '600519,"贵州,茅台",SH,白酒,趋势,核心|消费',
    'not-a-code,无效,SZ,测试,观察,',
    '300750,宁德时代,,,短线,新能源'
  ].join('\n'));
  assert.equal(csvReport.rows.length, 2, 'CSV 有效行导入');
  assert.equal(csvReport.rejected, 1, 'CSV 无效代码统计');
  assert.equal(csvReport.rows[0].meta.name, '贵州,茅台', 'CSV 引号与逗号保留');
  assert.equal(csvReport.rows[1].meta.market, 'SZ', '空市场按代码推断');

  const jsonReport = state.parseWatchlistImportReport(JSON.stringify({
    version: 2,
    groups: [{ id: 'trend', name: '趋势' }],
    items: [{ meta: csvReport.rows[0].meta, groupId: 'trend', tags: ['核心'] }, { meta: { code: 'bad' }, groupId: 'trend', tags: [] }]
  }));
  assert.equal(jsonReport.rows.length, 1, 'BigA JSON 有效条目导入');
  assert.equal(jsonReport.rejected, 1, 'BigA JSON 无效条目统计');

  const updatedGroups = state.updateWatchGroup(groups, 'trend', { name: '趋势交易', color: '#123456' });
  assert.equal(updatedGroups.find((group) => group.id === 'trend').name, '趋势交易', '分组名称更新');
  assert.equal(updatedGroups.find((group) => group.id === 'trend').color, '#123456', '分组颜色更新');
  const reordered = state.reorderWatchGroups(updatedGroups, 'position', 'short');
  assert.equal(reordered[0].id, 'position', '分组顺序更新');

  let organization = state.normalizeWatchlistOrganization(null, [csvReport.rows[0].meta], now);
  organization = state.upsertWatchEntry(organization, csvReport.rows[0].meta.code, 'trend', now);
  organization = state.updateWatchEntry(organization, csvReport.rows[0].meta.code, { tags: ['核心', '消费'] });
  const exported = state.exportWatchlistCsv([csvReport.rows[0].meta], organization);
  assert.match(exported, /"贵州,茅台"/, '导出 CSV 转义逗号');
  assert.match(exported, /核心\|消费/, '导出保留标签');
  console.log('Watchlist validation passed: import reports, groups, ordering, metadata and CSV export.');
} finally {
  await server.close();
}
