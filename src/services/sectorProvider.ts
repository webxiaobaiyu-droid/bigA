import { adjustmentQueryValue } from '@/services/adjustment';
import { fetchMarketText } from '@/services/marketTransport';
import { aggregateHistoricalCandles, fetchSinaAdjustedDailyCandles, fetchSinaDailyCandles } from '@/services/historicalCandles';
import type { HotStockRow, HotStockSortKey, SectorMode, SectorRow, SectorSortKey } from '@/types/sector';
import type { AdjustmentMode, Candle, Timeframe } from '@/types/market';

type EastmoneySectorRow = Record<string, number | string | undefined>;
type EastmoneyHotStockRow = Record<string, number | string | undefined>;
type SinaHotStockRow = Record<string, number | string | undefined>;

interface SinaIntradayRow {
  m?: string;
  p?: string;
  avg_p?: string;
  v?: string;
  tot_v?: string;
}

const EASTMONEY_SECTOR_FIELDS = [
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f8',
  'f12',
  'f14',
  'f20',
  'f22',
  'f62',
  'f184',
  'f104',
  'f105',
  'f128',
  'f136',
  'f140',
  'f207',
  'f208',
  'f124'
].join(',');

const EASTMONEY_HOT_STOCK_FIELDS = [
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f12',
  'f14',
  'f15',
  'f16',
  'f17',
  'f18',
  'f20',
  'f21',
  'f22',
  'f62',
  'f184',
  'f124'
].join(',');

const SECTOR_MODE_FS: Record<SectorMode, string> = {
  industry: 'm:90+t:2',
  concept: 'm:90+t:3'
};

const SECTOR_SORT_FIELD: Record<SectorSortKey, string> = {
  change: 'f3',
  money: 'f62',
  breadth: 'f104'
};

const HOT_STOCK_SORT_FIELD: Record<HotStockSortKey, string> = {
  hot: 'f6',
  change: 'f3',
  amount: 'f6',
  turnover: 'f8'
};

const SINA_HOT_STOCK_SORT_FIELD: Record<HotStockSortKey, string> = {
  hot: 'amount',
  change: 'changepercent',
  amount: 'amount',
  turnover: 'turnoverratio'
};

const A_SHARE_FS = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048';
const EASTMONEY_TRENDS_FIELDS = 'f51,f52,f53,f54,f55,f56,f57,f58';
const EASTMONEY_KLINE_FIELDS = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';

export async function fetchSectorRows(mode: SectorMode, sortKey: SectorSortKey) {
  const url = new URL('https://push2.eastmoney.com/api/qt/clist/get');
  url.searchParams.set('pn', '1');
  url.searchParams.set('pz', '80');
  url.searchParams.set('po', '1');
  url.searchParams.set('np', '1');
  url.searchParams.set('fltt', '2');
  url.searchParams.set('invt', '2');
  url.searchParams.set('fid', SECTOR_SORT_FIELD[sortKey]);
  url.searchParams.set('fs', SECTOR_MODE_FS[mode]);
  url.searchParams.set('fields', EASTMONEY_SECTOR_FIELDS);

  try {
    const data = await fetchMarketJson<{ data?: { diff?: EastmoneySectorRow[] } }>(url.toString());
    const rows = (data.data?.diff ?? []).map((row) => normalizeSectorRow(row, mode)).filter((row): row is SectorRow => Boolean(row));
    if (rows.length) {
      if (sortKey === 'breadth') {
        return rows.sort((a, b) => breadthScore(b) - breadthScore(a)).slice(0, 80);
      }
      return rows;
    }
  } catch {
    // Fall through to Sina's industry/concept board snapshots.
  }

  return fetchSinaSectorRows(mode, sortKey);
}

export async function fetchHotStockRows(sortKey: HotStockSortKey) {
  const url = new URL('https://push2.eastmoney.com/api/qt/clist/get');
  url.searchParams.set('pn', '1');
  url.searchParams.set('pz', '80');
  url.searchParams.set('po', '1');
  url.searchParams.set('np', '1');
  url.searchParams.set('fltt', '2');
  url.searchParams.set('invt', '2');
  url.searchParams.set('fid', HOT_STOCK_SORT_FIELD[sortKey]);
  url.searchParams.set('fs', A_SHARE_FS);
  url.searchParams.set('fields', EASTMONEY_HOT_STOCK_FIELDS);

  try {
    const data = await fetchMarketJson<{ data?: { diff?: EastmoneyHotStockRow[] } }>(url.toString());
    const rows = (data.data?.diff ?? []).map(normalizeHotStockRow).filter((row): row is HotStockRow => Boolean(row)).filter(isEligibleHotStock);
    if (rows.length) {
      return sortKey === 'hot' ? rows.sort((a, b) => hotStockScore(b) - hotStockScore(a)) : rows;
    }
  } catch {
    // Fall back to Sina's A-share quote ranking when Eastmoney drops the connection.
  }

  return fetchSinaHotStockRows(sortKey);
}

export async function fetchHotStockQuote(code: string): Promise<HotStockRow | null> {
  for (const secid of toEastmoneySecidCandidates(code)) {
    const url = new URL('https://push2.eastmoney.com/api/qt/stock/get');
    url.searchParams.set('secid', secid);
    url.searchParams.set('fltt', '2');
    url.searchParams.set('invt', '2');
    url.searchParams.set('fields', 'f43,f44,f45,f46,f47,f48,f50,f57,f58,f60,f116,f117,f162,f168,f169,f170,f171,f22,f62,f184,f124');

    try {
      const response = await fetchMarketJson<{ data?: EastmoneyHotStockRow }>(url.toString());
      const row = response.data;
      if (!row || !stringField(row.f57, '')) continue;
      return normalizeHotStockRow({
        f2: row.f43,
        f3: row.f170,
        f4: row.f169,
        f5: row.f47,
        f6: row.f48,
        f7: row.f171,
        f8: row.f168,
        f9: row.f162,
        f10: row.f50,
        f12: row.f57,
        f14: row.f58,
        f15: row.f44,
        f16: row.f45,
        f17: row.f46,
        f18: row.f60,
        f20: row.f116,
        f21: row.f117,
        f22: row.f22,
        f62: row.f62,
        f184: row.f184,
        f124: row.f124
      });
    } catch {
      // Try the alternate market prefix before using the monitor snapshot.
    }
  }

  return null;
}

export async function fetchSectorConstituents(sector: SectorRow): Promise<HotStockRow[]> {
  if (sector.source === 'eastmoney') {
    const url = new URL('https://push2.eastmoney.com/api/qt/clist/get');
    url.searchParams.set('pn', '1');
    url.searchParams.set('pz', '40');
    url.searchParams.set('po', '1');
    url.searchParams.set('np', '1');
    url.searchParams.set('fltt', '2');
    url.searchParams.set('invt', '2');
    url.searchParams.set('fid', 'f3');
    url.searchParams.set('fs', `b:${sector.code}`);
    url.searchParams.set('fields', EASTMONEY_HOT_STOCK_FIELDS);

    try {
      const data = await fetchMarketJson<{ data?: { diff?: EastmoneyHotStockRow[] } }>(url.toString());
      const rows = (data.data?.diff ?? []).map(normalizeHotStockRow).filter((row): row is HotStockRow => Boolean(row));
      if (rows.length) {
        return rows;
      }
    } catch {
      // Resolve the matching Sina board by name below.
    }
  }

  const node = sector.source === 'sina'
    ? sector.code
    : (await fetchSinaSectorRows(sector.mode, 'change')).find((item) => item.name === sector.name)?.code;
  return node ? fetchSinaStockRows('change', node, 40) : [];
}

export async function fetchHotStockIntraday(code: string): Promise<Candle[]> {
  for (const secid of toEastmoneySecidCandidates(code)) {
    const url = new URL('https://push2his.eastmoney.com/api/qt/stock/trends2/get');
    url.searchParams.set('secid', secid);
    url.searchParams.set('fields1', 'f1,f2,f3,f4,f5,f6,f7,f8');
    url.searchParams.set('fields2', EASTMONEY_TRENDS_FIELDS);
    url.searchParams.set('iscr', '0');
    url.searchParams.set('iscca', '0');
    url.searchParams.set('ndays', '1');

    try {
      const data = await fetchMarketJson<{ data?: { trends?: string[] } }>(url.toString());
      const rows = (data.data?.trends ?? []).map(parseTrendLine).filter((item): item is Candle => Boolean(item));
      if (rows.length) {
        return rows;
      }
    } catch {
      // Try the next market prefix candidate.
    }
  }

  return fetchSinaIntraday(code);
}

export async function fetchStockCandles(code: string, timeframe: Timeframe, adjustment: AdjustmentMode = 'forward'): Promise<Candle[]> {
  if (timeframe === 'fs') {
    return fetchHotStockIntraday(code);
  }

  const klt = timeframe === '1d' ? 101 : timeframe === '1w' ? 102 : 103;
  const begin = timeframe === '1d' ? dateTokenDaysAgo(540) : timeframe === '1w' ? dateTokenDaysAgo(2_600) : dateTokenDaysAgo(4_800);
  const limit = timeframe === '1d' ? 180 : timeframe === '1w' ? 160 : 120;

  for (const secid of toEastmoneySecidCandidates(code)) {
    const url = new URL('https://push2his.eastmoney.com/api/qt/stock/kline/get');
    url.searchParams.set('secid', secid);
    url.searchParams.set('fields1', 'f1,f2,f3,f4,f5,f6');
    url.searchParams.set('fields2', EASTMONEY_KLINE_FIELDS);
    url.searchParams.set('klt', String(klt));
    url.searchParams.set('fqt', adjustmentQueryValue(adjustment));
    url.searchParams.set('beg', begin);
    url.searchParams.set('end', '20500101');

    try {
      const data = await fetchMarketJson<{ data?: { klines?: string[] } }>(url.toString());
      const rows = (data.data?.klines ?? []).slice(-limit).map(parseKline).filter((item): item is Candle => Boolean(item));
      if (rows.length) {
        return rows;
      }
    } catch {
      // Try the alternate market prefix used by a small set of cross-market codes.
    }
  }

  try {
    const daily = adjustment === 'none'
      ? await fetchSinaDailyCandles(code)
      : await fetchSinaAdjustedDailyCandles(code, adjustment);
    if (timeframe === '1d') {
      return daily.slice(-limit);
    }
    const aggregatePeriod = timeframe === '1w' ? 'week' : 'month';
    return aggregateHistoricalCandles(daily, aggregatePeriod).slice(-limit);
  } catch {
    return [];
  }
}

async function fetchSinaIntraday(code: string): Promise<Candle[]> {
  const url = new URL('https://quotes.sina.cn/cn/api/openapi.php/CN_MinlineService.getMinlineData');
  url.searchParams.set('symbol', toSinaSymbol(code));
  url.searchParams.set('dpc', '1');

  try {
    const data = await fetchMarketJson<{ result?: { data?: SinaIntradayRow[] } }>(url.toString());
    return (data.result?.data ?? []).map(parseSinaTrendRow).filter((item): item is Candle => Boolean(item));
  } catch {
    return [];
  }
}

async function fetchSinaHotStockRows(sortKey: HotStockSortKey): Promise<HotStockRow[]> {
  const rows = (await fetchSinaStockRows(sortKey, 'hs_a', 120)).filter(isEligibleHotStock).slice(0, 100);
  return sortKey === 'hot' ? rows.sort((a, b) => hotStockScore(b) - hotStockScore(a)) : rows;
}

async function fetchSinaStockRows(sortKey: HotStockSortKey, node: string, limit: number): Promise<HotStockRow[]> {
  const url = new URL('https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData');
  url.searchParams.set('page', '1');
  url.searchParams.set('num', String(limit));
  url.searchParams.set('sort', SINA_HOT_STOCK_SORT_FIELD[sortKey]);
  url.searchParams.set('asc', '0');
  url.searchParams.set('node', node);
  url.searchParams.set('symbol', '');
  url.searchParams.set('_s_r_a', 'page');

  try {
    const data = await fetchMarketJson<SinaHotStockRow[]>(url.toString());
    return data.map(normalizeSinaHotStockRow).filter((row): row is HotStockRow => Boolean(row));
  } catch {
    return [];
  }
}

async function fetchSinaSectorRows(mode: SectorMode, sortKey: SectorSortKey): Promise<SectorRow[]> {
  const url = mode === 'industry'
    ? 'https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php'
    : 'https://vip.stock.finance.sina.com.cn/q/view/newFLJK.php?param=class';

  try {
    const text = await fetchMarketText(url, 'gb18030');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return [];
    }
    const payload = JSON.parse(text.slice(start, end + 1)) as Record<string, string>;
    const rows = Object.values(payload)
      .map((value) => normalizeSinaSectorRow(value, mode))
      .filter((row): row is SectorRow => Boolean(row));

    return rows.sort((a, b) => {
      if (sortKey === 'money') {
        return b.amount - a.amount;
      }
      if (sortKey === 'breadth') {
        return b.changePct - a.changePct;
      }
      return b.changePct - a.changePct;
    }).slice(0, 100);
  } catch {
    return [];
  }
}

function normalizeSectorRow(row: EastmoneySectorRow, mode: SectorMode): SectorRow | null {
  const code = stringField(row.f12, '');
  const name = stringField(row.f14, '');
  if (!code || !name) {
    return null;
  }

  const upCount = numberField(row.f104, 0);
  const downCount = numberField(row.f105, 0);

  return {
    code,
    name,
    mode,
    source: 'eastmoney',
    price: numberField(row.f2, 0),
    changePct: numberField(row.f3, 0),
    change: numberField(row.f4, 0),
    volume: numberField(row.f5, 0),
    amount: numberField(row.f6, 0),
    turnoverRate: numberField(row.f8, 0),
    marketCap: numberField(row.f20, 0),
    mainNetInflow: numberField(row.f62, 0),
    mainNetInflowPct: numberField(row.f184, 0),
    speed: numberField(row.f22, 0),
    upCount,
    downCount,
    flatCount: Math.max(0, 0),
    leaderName: stringField(row.f128, '--'),
    leaderCode: stringField(row.f140, ''),
    leaderChangePct: numberField(row.f136, 0),
    secondLeaderName: stringField(row.f207, '--'),
    secondLeaderCode: stringField(row.f208, ''),
    updatedAt: providerTimestamp(row.f124),
    fetchedAt: Date.now()
  };
}

function normalizeSinaSectorRow(value: string, mode: SectorMode): SectorRow | null {
  const parts = value.split(',');
  const code = parts[0]?.trim();
  const name = parts[1]?.trim();
  if (!code || !name) {
    return null;
  }

  const leaderSymbol = parts[8]?.trim() ?? '';
  return {
    code,
    name,
    mode,
    source: 'sina',
    price: numberField(parts[3], 0),
    change: numberField(parts[4], 0),
    changePct: numberField(parts[5], 0),
    volume: numberField(parts[6], 0),
    amount: numberField(parts[7], 0),
    turnoverRate: 0,
    marketCap: 0,
    mainNetInflow: 0,
    mainNetInflowPct: 0,
    speed: 0,
    upCount: 0,
    downCount: 0,
    flatCount: numberField(parts[2], 0),
    leaderName: parts[12]?.trim() || '--',
    leaderCode: leaderSymbol.replace(/^(sh|sz|bj)/, ''),
    leaderChangePct: numberField(parts[9], 0),
    secondLeaderName: '--',
    secondLeaderCode: '',
    updatedAt: 0,
    fetchedAt: Date.now()
  };
}

function normalizeHotStockRow(row: EastmoneyHotStockRow): HotStockRow | null {
  const code = stringField(row.f12, '');
  const name = stringField(row.f14, '');
  if (!code || !name) {
    return null;
  }

  return {
    code,
    name,
    price: numberField(row.f2, 0),
    prevClose: numberField(row.f18, 0),
    open: numberField(row.f17, 0),
    high: numberField(row.f15, 0),
    low: numberField(row.f16, 0),
    changePct: numberField(row.f3, 0),
    change: numberField(row.f4, 0),
    amplitude: numberField(row.f7, 0),
    volume: numberField(row.f5, 0),
    amount: numberField(row.f6, 0),
    turnoverRate: numberField(row.f8, 0),
    pe: numberField(row.f9, 0),
    volumeRatio: numberField(row.f10, 0),
    marketCap: numberField(row.f20, 0),
    floatMarketCap: numberField(row.f21, 0),
    mainNetInflow: numberField(row.f62, 0),
    mainNetInflowPct: numberField(row.f184, 0),
    speed: numberField(row.f22, 0),
    updatedAt: providerTimestamp(row.f124),
    fetchedAt: Date.now()
  };
}

function normalizeSinaHotStockRow(row: SinaHotStockRow): HotStockRow | null {
  const code = stringField(row.code, '');
  const name = stringField(row.name, '');
  if (!code || !name) {
    return null;
  }

  const price = numberField(row.trade, 0);
  const prevClose = numberField(row.settlement, 0);
  const open = numberField(row.open, 0);
  const high = numberField(row.high, 0);
  const low = numberField(row.low, 0);
  const changePct = numberField(row.changepercent, 0);
  const amplitude = prevClose > 0 ? ((high - low) / prevClose) * 100 : 0;

  return {
    code,
    name,
    price,
    prevClose,
    open,
    high,
    low,
    changePct,
    change: numberField(row.pricechange, price - prevClose),
    amplitude,
    volume: numberField(row.volume, 0),
    amount: numberField(row.amount, 0),
    turnoverRate: numberField(row.turnoverratio, 0),
    pe: numberField(row.per, 0),
    volumeRatio: 0,
    marketCap: numberField(row.mktcap, 0) * 10_000,
    floatMarketCap: numberField(row.nmc, 0) * 10_000,
    mainNetInflow: 0,
    mainNetInflowPct: 0,
    speed: 0,
    updatedAt: 0,
    fetchedAt: Date.now()
  };
}

function breadthScore(row: SectorRow) {
  const total = row.upCount + row.downCount + row.flatCount;
  return total ? (row.upCount - row.downCount) / total : row.upCount - row.downCount;
}

function hotStockScore(row: HotStockRow) {
  return Math.max(0, row.changePct) * 7 + Math.min(row.turnoverRate, 30) * 1.8 + Math.log10(Math.max(row.amount, 1)) * 3 + Math.min(row.volumeRatio, 5) * 4;
}

function isEligibleHotStock(row: HotStockRow) {
  const name = row.name.trim().toUpperCase();
  return row.price > 0 && row.prevClose > 0 && !name.startsWith('N') && !name.startsWith('C') && Math.abs(row.changePct) <= 35;
}

function parseTrendLine(line: string): Candle | null {
  const parts = line.split(',');
  const time = parseMarketTime(parts[0]);
  const price = Number(parts[1]);
  const average = Number(parts[2] || parts[7]);
  const volume = Number(parts[5]);

  if (!time || !Number.isFinite(price)) {
    return null;
  }

  return {
    time,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: Number.isFinite(volume) ? volume : 0,
    average: Number.isFinite(average) ? average : price
  };
}

function parseKline(line: string): Candle | null {
  const parts = line.split(',');
  const time = parseMarketTime(parts[0]);
  const open = Number(parts[1]);
  const close = Number(parts[2]);
  const high = Number(parts[3]);
  const low = Number(parts[4]);
  const volume = Number(parts[5]);
  const amount = Number(parts[6]);
  const amplitude = Number(parts[7]);
  const changePct = Number(parts[8]);
  const change = Number(parts[9]);
  const turnoverRate = Number(parts[10]);

  if (!time || ![open, close, high, low].every(Number.isFinite)) {
    return null;
  }

  return {
    time,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0,
    amount: Number.isFinite(amount) ? amount : undefined,
    amplitude: Number.isFinite(amplitude) ? amplitude : undefined,
    changePct: Number.isFinite(changePct) ? changePct : undefined,
    change: Number.isFinite(change) ? change : undefined,
    turnoverRate: Number.isFinite(turnoverRate) ? turnoverRate : undefined
  };
}

function parseSinaTrendRow(row: SinaIntradayRow): Candle | null {
  const time = parseSinaMarketTime(row.m ?? '');
  const price = Number(row.p);
  const average = Number(row.avg_p);
  const volume = Number(row.v);

  if (!time || !Number.isFinite(price)) {
    return null;
  }

  return {
    time,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: Number.isFinite(volume) ? volume : 0,
    average: Number.isFinite(average) ? average : price
  };
}

function parseMarketTime(value: string) {
  if (!value) {
    return 0;
  }

  const normalized = value.includes(' ') ? value : `${value} 15:00`;
  return Math.floor(new Date(normalized.replace(/-/g, '/')).getTime() / 1000);
}

function parseSinaMarketTime(value: string) {
  if (!value) {
    return 0;
  }

  const now = new Date();
  const date = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
  return Math.floor(new Date(`${date} ${value}`).getTime() / 1000);
}

function dateTokenDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function toEastmoneySecidCandidates(code: string) {
  const primaryMarket = code.startsWith('6') || code.startsWith('9') ? 1 : 0;
  const secondaryMarket = primaryMarket === 1 ? 0 : 1;
  return [`${primaryMarket}.${code}`, `${secondaryMarket}.${code}`];
}

function toSinaSymbol(code: string) {
  if (code.startsWith('8') || code.startsWith('4') || code.startsWith('920')) {
    return `bj${code}`;
  }

  if (code.startsWith('6') || code.startsWith('9')) {
    return `sh${code}`;
  }

  return `sz${code}`;
}

async function fetchMarketJson<T>(url: string): Promise<T> {
  const text = await fetchMarketText(url, 'utf-8');
  if (!text) {
    throw new Error('Empty sector response');
  }

  return JSON.parse(text) as T;
}

function numberField(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) && next !== -1 ? next : fallback;
}

function providerTimestamp(value: unknown) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

function stringField(value: unknown, fallback: string) {
  return typeof value === 'string' && value ? value : fallback;
}
