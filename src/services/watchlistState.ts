import type { StockMeta } from '@/types/market';
import type { WatchEntry, WatchGroup, WatchlistExportPayload, WatchlistImportReport, WatchlistImportRow, WatchlistOrganization } from '@/types/watchlist';

const GROUP_COLORS = ['#d7a642', '#4ea1d3', '#d96f6f', '#62a77b', '#aa7ac3', '#7f8b99'];

export function defaultWatchGroups(now = Date.now()): WatchGroup[] {
  return [
    { id: 'short', name: '短线', color: '#d96f6f', order: 0, createdAt: now },
    { id: 'trend', name: '趋势', color: '#4ea1d3', order: 1, createdAt: now },
    { id: 'observe', name: '观察', color: '#d7a642', order: 2, createdAt: now },
    { id: 'position', name: '持仓', color: '#62a77b', order: 3, createdAt: now }
  ];
}

export function normalizeWatchlistOrganization(raw: unknown, metas: StockMeta[], now = Date.now()): WatchlistOrganization {
  const source = raw && typeof raw === 'object' ? raw as Partial<WatchlistOrganization> : {};
  const groups = normalizeGroups(source.groups, now);
  const fallbackGroupId = groups.find((group) => group.id === 'observe')?.id ?? groups[0].id;
  const validCodes = new Set(metas.map((meta) => meta.code));
  const seen = new Set<string>();
  const storedEntries = Array.isArray(source.entries) ? source.entries : [];
  const entries = storedEntries.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const entry = value as Partial<WatchEntry>;
    const code = String(entry.code ?? '');
    if (!validCodes.has(code) || seen.has(code)) return [];
    seen.add(code);
    return [{
      code,
      groupId: groups.some((group) => group.id === entry.groupId) ? String(entry.groupId) : fallbackGroupId,
      tags: normalizeTags(entry.tags),
      order: finiteNumber(entry.order, seen.size - 1),
      addedAt: finiteNumber(entry.addedAt, now)
    }];
  });

  metas.forEach((meta, index) => {
    if (seen.has(meta.code)) return;
    entries.push({ code: meta.code, groupId: fallbackGroupId, tags: [], order: entries.length + index, addedAt: now });
  });

  return { version: 2, groups, entries: normalizeEntryOrder(entries) };
}

export function createWatchGroup(groups: WatchGroup[], name: string, now = Date.now()) {
  const normalizedName = name.trim().slice(0, 12);
  if (!normalizedName || groups.some((group) => group.name === normalizedName)) return groups;
  const idBase = normalizedName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || 'group';
  let id = idBase;
  let suffix = 2;
  while (groups.some((group) => group.id === id)) id = `${idBase}-${suffix++}`;
  return [...groups, { id, name: normalizedName, color: GROUP_COLORS[groups.length % GROUP_COLORS.length], order: groups.length, createdAt: now }];
}

export function updateWatchGroup(groups: WatchGroup[], id: string, patch: Partial<Pick<WatchGroup, 'name' | 'color'>>) {
  const name = patch.name?.trim().slice(0, 12);
  if (name !== undefined && (!name || groups.some((group) => group.id !== id && group.name === name))) return groups;
  const color = patch.color && /^#[0-9a-f]{6}$/i.test(patch.color) ? patch.color : undefined;
  return groups.map((group) => group.id === id ? { ...group, ...(name ? { name } : {}), ...(color ? { color } : {}) } : group);
}

export function reorderWatchGroups(groups: WatchGroup[], sourceId: string, targetId: string) {
  const ordered = [...groups].sort((a, b) => a.order - b.order);
  const sourceIndex = ordered.findIndex((group) => group.id === sourceId);
  const targetIndex = ordered.findIndex((group) => group.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return groups;
  const [source] = ordered.splice(sourceIndex, 1);
  ordered.splice(targetIndex, 0, source);
  return ordered.map((group, order) => ({ ...group, order }));
}

export function removeWatchGroup(state: WatchlistOrganization, groupId: string): WatchlistOrganization {
  if (state.groups.length <= 1) return state;
  const groups = state.groups.filter((group) => group.id !== groupId).map((group, order) => ({ ...group, order }));
  const fallbackGroupId = groups.find((group) => group.id === 'observe')?.id ?? groups[0].id;
  const entries = state.entries.map((entry) => entry.groupId === groupId ? { ...entry, groupId: fallbackGroupId } : entry);
  return { ...state, groups, entries };
}

export function upsertWatchEntry(state: WatchlistOrganization, code: string, groupId?: string, now = Date.now()) {
  if (state.entries.some((entry) => entry.code === code)) return state;
  const targetGroup = state.groups.some((group) => group.id === groupId) ? String(groupId) : state.groups.find((group) => group.id === 'observe')?.id ?? state.groups[0].id;
  return { ...state, entries: [...state.entries, { code, groupId: targetGroup, tags: [], order: state.entries.length, addedAt: now }] };
}

export function updateWatchEntry(state: WatchlistOrganization, code: string, patch: Partial<Pick<WatchEntry, 'groupId' | 'tags'>>) {
  return {
    ...state,
    entries: state.entries.map((entry) => entry.code === code ? {
      ...entry,
      groupId: patch.groupId && state.groups.some((group) => group.id === patch.groupId) ? patch.groupId : entry.groupId,
      tags: patch.tags ? normalizeTags(patch.tags) : entry.tags
    } : entry)
  };
}

export function reorderWatchEntries(state: WatchlistOrganization, sourceCode: string, targetCode: string) {
  const ordered = [...state.entries].sort((a, b) => a.order - b.order);
  const sourceIndex = ordered.findIndex((entry) => entry.code === sourceCode);
  const targetIndex = ordered.findIndex((entry) => entry.code === targetCode);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state;
  const [source] = ordered.splice(sourceIndex, 1);
  ordered.splice(targetIndex, 0, source);
  return { ...state, entries: ordered.map((entry, order) => ({ ...entry, order })) };
}

export function exportWatchlistJson(metas: StockMeta[], state: WatchlistOrganization) {
  const metaMap = new Map(metas.map((meta) => [meta.code, meta]));
  const payload: WatchlistExportPayload = {
    version: 2,
    exportedAt: Date.now(),
    groups: state.groups,
    items: state.entries.flatMap((entry) => {
      const meta = metaMap.get(entry.code);
      return meta ? [{ meta, groupId: entry.groupId, tags: entry.tags, order: entry.order }] : [];
    })
  };
  return JSON.stringify(payload, null, 2);
}

export function exportWatchlistCsv(metas: StockMeta[], state: WatchlistOrganization) {
  const metaMap = new Map(metas.map((meta) => [meta.code, meta]));
  const groupMap = new Map(state.groups.map((group) => [group.id, group.name]));
  const rows = [['code', 'name', 'market', 'sector', 'group', 'tags']];
  [...state.entries].sort((a, b) => a.order - b.order).forEach((entry) => {
    const meta = metaMap.get(entry.code);
    if (meta) rows.push([meta.code, meta.name, meta.market, meta.sector, groupMap.get(entry.groupId) ?? '', entry.tags.join('|')]);
  });
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function parseWatchlistImport(text: string): WatchlistImportRow[] {
  return parseWatchlistImportReport(text).rows;
}

export function parseWatchlistImportReport(text: string): WatchlistImportReport {
  const value = text.trim();
  if (!value) return { rows: [], rejected: 0 };
  if (value.startsWith('{')) return parseJsonImport(value);
  return parseDelimitedImport(value);
}

function parseJsonImport(text: string): WatchlistImportReport {
  const payload = JSON.parse(text) as Partial<WatchlistExportPayload>;
  const groups = new Map((payload.groups ?? []).map((group) => [group.id, group.name]));
  const items = Array.isArray(payload.items) ? payload.items : [];
  const rows = items.flatMap((item) => isStockMeta(item?.meta) ? [{ meta: item.meta, groupName: groups.get(item.groupId) ?? '观察', tags: normalizeTags(item.tags) }] : []);
  return { rows, rejected: items.length - rows.length };
}

function parseDelimitedImport(text: string): WatchlistImportReport {
  const rows = parseCsv(text);
  if (!rows.length) return { rows: [], rejected: 0 };
  const first = rows[0].map((cell) => cell.trim().toLowerCase());
  const hasHeader = first.includes('code') || first.includes('代码');
  const header = hasHeader ? first : ['code', 'name', 'market', 'sector', 'group', 'tags'];
  const indexOf = (...names: string[]) => names.map((name) => header.indexOf(name)).find((index) => index >= 0) ?? -1;
  const codeIndex = indexOf('code', '代码');
  const nameIndex = indexOf('name', '名称');
  const marketIndex = indexOf('market', '市场');
  const sectorIndex = indexOf('sector', '行业');
  const groupIndex = indexOf('group', '分组');
  const tagsIndex = indexOf('tags', '标签');
  const dataRows = rows.slice(hasHeader ? 1 : 0).filter((row) => row.some((cell) => cell.trim()));
  const imported = dataRows.flatMap((row) => {
    const code = String(row[codeIndex] ?? '').trim().replace(/^(sh|sz|bj)/i, '');
    if (!/^\d{6}$/.test(code)) return [];
    const market = normalizeMarket(row[marketIndex], code);
    return [{
      meta: {
        code,
        name: String(row[nameIndex] ?? code).trim() || code,
        market,
        sector: String(row[sectorIndex] ?? '待同步').trim() || '待同步',
        basePrice: 0,
        floatMarketCap: 0,
        pe: 0,
        beta: 1,
        style: 'core' as const
      },
      groupName: String(row[groupIndex] ?? '观察').trim() || '观察',
      tags: normalizeTags(String(row[tagsIndex] ?? '').split(/[|；;]/))
    }];
  });
  return { rows: imported, rejected: dataRows.length - imported.length };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (char !== '\r') cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.length) || !rows.length) rows.push(row);
  return rows;
}

function normalizeGroups(value: unknown, now: number) {
  if (!Array.isArray(value)) return defaultWatchGroups(now);
  const seen = new Set<string>();
  const groups = value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const group = item as Partial<WatchGroup>;
    const id = String(group.id ?? '').trim();
    const name = String(group.name ?? '').trim().slice(0, 12);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, color: /^#[0-9a-f]{6}$/i.test(String(group.color)) ? String(group.color) : GROUP_COLORS[index % GROUP_COLORS.length], order: index, createdAt: finiteNumber(group.createdAt, now) }];
  });
  return groups.length ? groups : defaultWatchGroups(now);
}

function normalizeEntryOrder(entries: WatchEntry[]) {
  return [...entries].sort((a, b) => a.order - b.order).map((entry, order) => ({ ...entry, order }));
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].slice(0, 6).map((item) => item.slice(0, 10));
}

function normalizeMarket(value: unknown, code: string): StockMeta['market'] {
  const market = String(value ?? '').toUpperCase();
  if (market === 'SH' || market === 'SZ' || market === 'BJ') return market;
  if (code.startsWith('6') || code.startsWith('9')) return 'SH';
  if (code.startsWith('8') || code.startsWith('4') || code.startsWith('920')) return 'BJ';
  return 'SZ';
}

function isStockMeta(value: unknown): value is StockMeta {
  if (!value || typeof value !== 'object') return false;
  const meta = value as Partial<StockMeta>;
  return /^\d{6}$/.test(String(meta.code ?? '')) && Boolean(meta.name) && (meta.market === 'SH' || meta.market === 'SZ' || meta.market === 'BJ');
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function finiteNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
