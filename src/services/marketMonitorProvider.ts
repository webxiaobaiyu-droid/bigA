import { fetchMarketText } from '@/services/marketTransport';
import type {
  CapitalFlowSector,
  CapitalFlowStock,
  DragonTigerRow,
  DragonTigerSeatHistory,
  DragonTigerSeatRow,
  DragonTigerSeatType,
  IntradayTradeTick,
  DragonTigerSnapshot,
  LimitPoolStock,
  MarketFundFlowSnapshot,
  MarketIndexSnapshot,
  MarketSentimentSnapshot
} from '@/types/marketMonitor';

type JsonRow = Record<string, unknown>;

interface SinaBreadthRow {
  changepercent?: number | string;
}

interface SinaLimitRow extends SinaBreadthRow {
  code?: string;
  name?: string;
  trade?: number | string;
  settlement?: number | string;
  high?: number | string;
  low?: number | string;
  amount?: number | string;
  turnoverratio?: number | string;
}

interface LimitPoolResponse {
  data?: {
    qdate?: number;
    tc?: number;
    pool?: JsonRow[];
  };
}

const SINA_MARKET_API = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php';
const EASTMONEY_TOKEN = '7eea3edcaed734bea9cbfc24409ed989';
const INDEX_TARGETS = [
  { code: '000001', secid: '1.000001', name: '上证指数' },
  { code: '399001', secid: '0.399001', name: '深证成指' },
  { code: '399006', secid: '0.399006', name: '创业板指' }
] as const;
const DRAGON_SEAT_CACHE_TTL_MS = 5 * 60_000;
const dragonSeatCache = new Map<string, { expiresAt: number; request: Promise<DragonTigerSeatHistory> }>();
const intradayTradeCache = new Map<string, { expiresAt: number; request: Promise<IntradayTradeTick[]> }>();
const KNOWN_HOT_MONEY_SEATS: Array<{ label: string; keywords: string[] }> = [
  { label: '章盟主', keywords: ['上海江苏路证券营业部'] },
  { label: '赵老哥', keywords: ['绍兴解放北路证券营业部', '绍兴人民中路证券营业部'] },
  { label: '炒股养家', keywords: ['上海宛平南路证券营业部'] },
  { label: '作手新一', keywords: ['南京太平南路证券营业部'] },
  { label: '呼家楼', keywords: ['北京东城分公司', '北京朝阳门内大街证券营业部'] },
  { label: '陈小群', keywords: ['大连黄河路证券营业部'] },
  { label: '宁波桑田路', keywords: ['宁波桑田路证券营业部'] },
  { label: '上塘路', keywords: ['杭州上塘路证券营业部'] },
  { label: '佛山系', keywords: ['佛山绿景路证券营业部', '佛山季华六路证券营业部'] }
];

export async function fetchMarketSentiment(): Promise<MarketSentimentSnapshot> {
  const [breadth, limitPools, indices] = await Promise.all([
    fetchMarketBreadth(),
    fetchLatestLimitPools(),
    fetchMarketIndices()
  ]);
  const sealRate = limitPools.limitUp + limitPools.brokenLimit > 0
    ? (limitPools.limitUp / (limitPools.limitUp + limitPools.brokenLimit)) * 100
    : 0;
  const breadthRatio = breadth.total > 0 ? (breadth.up / breadth.total) * 100 : 50;
  const limitBalance = limitPools.limitUp + limitPools.limitDown > 0
    ? 50 + ((limitPools.limitUp - limitPools.limitDown) / (limitPools.limitUp + limitPools.limitDown)) * 35
    : 50;
  const averageIndexChange = indices.length
    ? indices.reduce((sum, row) => sum + row.changePct, 0) / indices.length
    : 0;
  const indexScore = clamp(50 + averageIndexChange * 12, 0, 100);
  const score = Math.round(clamp(breadthRatio * 0.4 + sealRate * 0.25 + limitBalance * 0.2 + indexScore * 0.15, 0, 100));

  return {
    tradeDate: limitPools.tradeDate,
    updatedAt: Date.now(),
    ...breadth,
    limitUp: limitPools.limitUp,
    limitDown: limitPools.limitDown,
    brokenLimit: limitPools.brokenLimit,
    sealRate,
    maxStreak: limitPools.maxStreak,
    score,
    label: sentimentLabel(score),
    indices,
    leaders: limitPools.leaders
  };
}

export async function fetchDragonTigerList(): Promise<DragonTigerSnapshot> {
  const latestUrl = buildDragonTigerUrl(1);
  const latest = await fetchJson<{ result?: { data?: JsonRow[] } }>(latestUrl);
  const tradeDate = String(latest.result?.data?.[0]?.TRADE_DATE ?? '').slice(0, 10);
  if (!tradeDate) {
    return { tradeDate: '', updatedAt: Date.now(), rows: [] };
  }

  const data = await fetchJson<{ result?: { data?: JsonRow[] } }>(buildDragonTigerUrl(300, tradeDate));
  const byCode = new Map<string, DragonTigerRow>();
  for (const raw of data.result?.data ?? []) {
    const row = normalizeDragonTigerRow(raw);
    if (!row) continue;

    const current = byCode.get(row.code);
    if (!current || Math.abs(row.netAmount) > Math.abs(current.netAmount)) {
      byCode.set(row.code, row);
    } else if (row.reason && !current.reason.includes(row.reason)) {
      current.reason = `${current.reason}；${row.reason}`;
    }
  }

  return {
    tradeDate,
    updatedAt: Date.now(),
    rows: [...byCode.values()].sort((a, b) => b.netAmount - a.netAmount)
  };
}

export function fetchDragonTigerSeatHistory(code: string): Promise<DragonTigerSeatHistory> {
  const cached = dragonSeatCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.request;

  const request = loadDragonTigerSeatHistory(code).catch((error) => {
    dragonSeatCache.delete(code);
    throw error;
  });
  dragonSeatCache.set(code, { expiresAt: Date.now() + DRAGON_SEAT_CACHE_TTL_MS, request });
  return request;
}

export function fetchIntradayTradeTicks(code: string, tradeDate: string): Promise<IntradayTradeTick[]> {
  const key = `${code}:${tradeDate}`;
  const cached = intradayTradeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.request;

  const request = loadIntradayTradeTicks(code, tradeDate).catch((error) => {
    intradayTradeCache.delete(key);
    throw error;
  });
  intradayTradeCache.set(key, { expiresAt: Date.now() + 30_000, request });
  return request;
}

async function loadIntradayTradeTicks(code: string, tradeDate: string) {
  try {
    const tencentRows = await fetchTencentIntradayTrades(code, tradeDate);
    if (tencentRows.length) return tencentRows;
  } catch {
    // Fall through to Eastmoney's all-in-one transaction endpoint.
  }

  for (const secid of eastmoneySecidCandidates(code)) {
    const url = new URL('https://push2.eastmoney.com/api/qt/stock/details/get');
    url.searchParams.set('secid', secid);
    url.searchParams.set('pos', '-5000');
    url.searchParams.set('fields1', 'f1,f2,f3,f4,f5');
    url.searchParams.set('fields2', 'f51,f52,f53,f54,f55');
    try {
      const payload = await fetchJson<{ data?: { details?: string[] } }>(url.toString());
      const rows = (payload.data?.details ?? [])
        .map((value) => normalizeIntradayTrade(value, tradeDate))
        .filter((row): row is IntradayTradeTick => Boolean(row));
      if (rows.length) return rows;
    } catch {
      // Try the alternate market prefix.
    }
  }
  return [];
}

async function fetchTencentIntradayTrades(code: string, tradeDate: string) {
  const symbol = tencentSymbol(code);
  const base = 'https://stock.gtimg.cn/data/index.php';
  const summaryUrl = new URL(base);
  summaryUrl.searchParams.set('appn', 'detail');
  summaryUrl.searchParams.set('action', 'alldata');
  summaryUrl.searchParams.set('c', symbol);
  const summary = await fetchMarketText(summaryUrl.toString(), 'utf-8');
  const match = summary.match(/=\[(\d+),"([^"]*)"\]/);
  if (!match || match[1] !== tradeDate.replace(/-/g, '')) return [];
  const pageCount = match[2].split('|').filter(Boolean).length;
  const rows: IntradayTradeTick[] = [];

  for (let start = 0; start < pageCount; start += 10) {
    const pages = Array.from({ length: Math.min(10, pageCount - start) }, (_, index) => start + index);
    const responses = await Promise.all(pages.map(async (page) => {
      const url = new URL(base);
      url.searchParams.set('appn', 'detail');
      url.searchParams.set('action', 'data');
      url.searchParams.set('c', symbol);
      url.searchParams.set('p', String(page));
      return fetchMarketText(url.toString(), 'utf-8');
    }));
    responses.forEach((response) => rows.push(...parseTencentTradePage(response, tradeDate)));
  }
  return rows;
}

function parseTencentTradePage(text: string, tradeDate: string) {
  const payload = text.match(/=\[\d+,"([^"]*)"\]/)?.[1] ?? '';
  return payload.split('|').flatMap((value): IntradayTradeTick[] => {
    const parts = value.split('/');
    const timeText = parts[1] ?? '';
    const price = Number(parts[2]);
    const volume = Number(parts[4]);
    const amount = Number(parts[5]);
    const sideText = parts[6];
    const time = Math.floor(new Date(`${tradeDate.replace(/-/g, '/')} ${timeText}`).getTime() / 1000);
    const minute = timeText.slice(0, 5);
    const inTradingPeriod = (minute >= '09:30' && minute <= '11:30') || (minute >= '13:00' && minute <= '15:00');
    if (!time || !inTradingPeriod || !Number.isFinite(price) || !Number.isFinite(volume)) return [];
    return [{
      time,
      price,
      volume,
      amount: Number.isFinite(amount) ? amount : price * volume,
      tradeCount: 0,
      side: sideText === 'B' ? 'buy' : sideText === 'S' ? 'sell' : 'neutral'
    }];
  });
}

async function loadDragonTigerSeatHistory(code: string): Promise<DragonTigerSeatHistory> {
  const fromDate = dateBeforeMonths(12);
  const [buyers, sellers] = await Promise.all([
    fetchDragonTigerSeats('RPT_BILLBOARD_DAILYDETAILSBUY', code, fromDate, 'BUY'),
    fetchDragonTigerSeats('RPT_BILLBOARD_DAILYDETAILSSELL', code, fromDate, 'SELL')
  ]);
  const bySeatAndDate = new Map<string, DragonTigerSeatRow>();
  const seenRows = new Set<string>();

  for (const raw of [...buyers, ...sellers]) {
    const row = normalizeDragonTigerSeat(raw);
    if (!row) continue;
    const identity = row.seatCode || normalizeSeatIdentity(row.seatName);
    const signature = `${row.tradeDate}:${identity}:${row.buyAmount}:${row.sellAmount}`;
    if (seenRows.has(signature)) continue;
    seenRows.add(signature);

    const key = `${row.tradeDate}:${identity}`;
    const current = bySeatAndDate.get(key);
    if (!current) {
      bySeatAndDate.set(key, { ...row, netAmount: row.buyAmount - row.sellAmount });
      continue;
    }

    current.buyAmount += row.buyAmount;
    current.sellAmount += row.sellAmount;
    current.netAmount = current.buyAmount - current.sellAmount;
    current.marketAmount = Math.max(current.marketAmount, row.marketAmount);
    current.successRate ??= row.successRate;
    current.recentTimes = Math.max(current.recentTimes ?? 0, row.recentTimes ?? 0) || null;
    if (row.reason && row.reason !== '--' && !current.reason.includes(row.reason)) {
      current.reason = current.reason === '--' ? row.reason : `${current.reason}；${row.reason}`;
    }
  }

  return {
    code,
    updatedAt: Date.now(),
    rows: [...bySeatAndDate.values()].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || Math.abs(b.netAmount) - Math.abs(a.netAmount))
  };
}

function normalizeSeatIdentity(name: string) {
  return name.replace(/[\s（）()]/g, '').replace(/有限责任公司|股份有限公司|证券营业部/g, '');
}

async function fetchDragonTigerSeats(reportName: string, code: string, fromDate: string, amountField: 'BUY' | 'SELL') {
  const url = new URL('https://datacenter-web.eastmoney.com/api/data/v1/get');
  url.searchParams.set('reportName', reportName);
  url.searchParams.set('columns', 'ALL');
  url.searchParams.set('filter', `(TRADE_DATE>='${fromDate}')(SECURITY_CODE="${code}")`);
  url.searchParams.set('sortColumns', `TRADE_DATE,${amountField}`);
  url.searchParams.set('sortTypes', '-1,-1');
  url.searchParams.set('pageNumber', '1');
  url.searchParams.set('pageSize', '500');
  url.searchParams.set('source', 'WEB');
  url.searchParams.set('client', 'WEB');
  const payload = await fetchJson<{ result?: { data?: JsonRow[] } }>(url.toString());
  return payload.result?.data ?? [];
}

export async function fetchMarketFundFlow(): Promise<MarketFundFlowSnapshot> {
  const [sectors, inflowStocks, outflowStocks] = await Promise.all([
    fetchSinaCapitalSectors(),
    fetchSinaCapitalStocks(false),
    fetchSinaCapitalStocks(true)
  ]);
  const stockMap = new Map([...inflowStocks, ...outflowStocks].map((row) => [row.code, row]));
  return { tradeDate: shanghaiDateKey(), updatedAt: Date.now(), sectors, stocks: [...stockMap.values()] };
}

function shanghaiDateKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function fetchSinaCapitalSectors(): Promise<CapitalFlowSector[]> {
  const url = new URL('https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssl_bkzj_bk');
  url.searchParams.set('page', '1');
  url.searchParams.set('num', '100');
  url.searchParams.set('sort', 'netamount');
  url.searchParams.set('asc', '0');
  url.searchParams.set('fenlei', '0');
  const rows = await fetchJson<JsonRow[]>(url.toString());
  return rows.flatMap((row) => {
    const code = `${stringValue(row.cate_type, '0')}/${stringValue(row.category, '')}`;
    const name = stringValue(row.name, '');
    if (!name) return [];
    return [{
      code,
      name,
      changePct: numberValue(row.avg_changeratio, 0) * 100,
      inflow: numberValue(row.inamount, 0),
      outflow: numberValue(row.outamount, 0),
      netAmount: numberValue(row.netamount, 0),
      netRatio: numberValue(row.ratioamount, 0) * 100,
      leaderCode: stringValue(row.ts_symbol, '').replace(/^(sh|sz|bj)/, ''),
      leaderName: stringValue(row.ts_name, '--')
    }];
  });
}

async function fetchSinaCapitalStocks(asc: boolean): Promise<CapitalFlowStock[]> {
  const url = new URL('https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssl_bkzj_ssggzj');
  url.searchParams.set('page', '1');
  url.searchParams.set('num', '50');
  url.searchParams.set('sort', 'r0_net');
  url.searchParams.set('asc', asc ? '1' : '0');
  const rows = await fetchJson<JsonRow[]>(url.toString());
  return rows.flatMap((row) => {
    const code = stringValue(row.symbol, '').replace(/^(sh|sz|bj)/, '');
    const name = stringValue(row.name, '');
    if (!code || !name) return [];
    return [{
      code,
      name,
      price: numberValue(row.trade, 0),
      changePct: numberValue(row.changeratio, 0) * 100,
      turnoverRate: numberValue(row.turnover, 0) / 100,
      amount: numberValue(row.amount, 0),
      inflow: numberValue(row.r0_in, numberValue(row.inamount, 0)),
      outflow: numberValue(row.r0_out, numberValue(row.outamount, 0)),
      netAmount: numberValue(row.r0_net, numberValue(row.netamount, 0)),
      netRatio: numberValue(row.r0_ratio, numberValue(row.ratioamount, 0)) * 100
    }];
  });
}

async function fetchMarketBreadth() {
  const countText = await fetchMarketText(`${SINA_MARKET_API}/Market_Center.getHQNodeStockCount?node=hs_a`);
  const total = Number(parseJsonValue(countText)) || 0;
  if (!total) {
    return { total: 0, up: 0, down: 0, flat: 0 };
  }

  const pageSize = 100;
  const maxPage = Math.ceil(total / pageSize);
  const pageCache = new Map<number, SinaBreadthRow[]>();
  const readPage = async (page: number) => {
    const cached = pageCache.get(page);
    if (cached) return cached;

    const url = new URL(`${SINA_MARKET_API}/Market_Center.getHQNodeData`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('num', String(pageSize));
    url.searchParams.set('sort', 'changepercent');
    url.searchParams.set('asc', '0');
    url.searchParams.set('node', 'hs_a');
    url.searchParams.set('symbol', '');
    url.searchParams.set('_s_r_a', 'page');
    const rows = await fetchJson<SinaBreadthRow[]>(url.toString());
    pageCache.set(page, rows);
    return rows;
  };

  const firstNonPositive = await findFirstSortedIndex(total, maxPage, pageSize, readPage, (value) => value <= 0);
  const firstNegative = await findFirstSortedIndex(total, maxPage, pageSize, readPage, (value) => value < 0);

  return {
    total,
    up: firstNonPositive,
    flat: Math.max(0, firstNegative - firstNonPositive),
    down: Math.max(0, total - firstNegative)
  };
}

async function findFirstSortedIndex(
  total: number,
  maxPage: number,
  pageSize: number,
  readPage: (page: number) => Promise<SinaBreadthRow[]>,
  predicate: (value: number) => boolean
) {
  let low = 1;
  let high = maxPage;
  let candidatePage = maxPage;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const rows = await readPage(middle);
    const lastValue = numberValue(rows[rows.length - 1]?.changepercent, 0);
    if (predicate(lastValue)) {
      candidatePage = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  const rows = await readPage(candidatePage);
  const localIndex = rows.findIndex((row) => predicate(numberValue(row.changepercent, 0)));
  return localIndex >= 0 ? Math.min(total, (candidatePage - 1) * pageSize + localIndex) : total;
}

async function fetchLatestLimitPools() {
  const date = recentDateCandidates(1)[0] ?? '';
  try {
    const up = await withTimeout(fetchLimitPool('getTopicZTPool', date), 2_000);
    if (up.data?.qdate) {
    const [down, broken] = await Promise.all([
        withTimeout(fetchLimitPool('getTopicDTPool', date), 2_000),
        withTimeout(fetchLimitPool('getTopicZBPool', date), 2_000)
    ]);
    const upRows = up.data.pool ?? [];
    const leaders = upRows
      .map(normalizeLimitPoolStock)
      .filter((row): row is LimitPoolStock => Boolean(row))
      .sort((a, b) => b.streak - a.streak || b.amount - a.amount)
      .slice(0, 16);

    return {
      tradeDate: formatTradeDate(up.data.qdate),
      limitUp: numberValue(up.data.tc, upRows.length),
      limitDown: numberValue(down.data?.tc, down.data?.pool?.length ?? 0),
      brokenLimit: numberValue(broken.data?.tc, broken.data?.pool?.length ?? 0),
      maxStreak: Math.max(0, ...leaders.map((row) => row.streak)),
      leaders
    };
    }
  } catch {
    // Sina's sorted market snapshots provide a stable fallback for limit statistics.
  }

  return fetchSinaLimitSnapshot();
}

async function fetchSinaLimitSnapshot() {
  const [topPages, bottomPages] = await Promise.all([
    Promise.all(Array.from({ length: 5 }, (_, index) => fetchSinaLimitPage(index + 1, false))),
    Promise.all(Array.from({ length: 2 }, (_, index) => fetchSinaLimitPage(index + 1, true)))
  ]);
  const rows = [...topPages.flat(), ...bottomPages.flat()];
  const byCode = new Map(rows.filter((row) => row.code).map((row) => [String(row.code), row]));
  const limitUpRows: SinaLimitRow[] = [];
  let limitDown = 0;
  let brokenLimit = 0;

  for (const row of byCode.values()) {
    const code = stringValue(row.code, '');
    const name = stringValue(row.name, '');
    const limitPct = stockLimitPct(code, name);
    if (limitPct === null) continue;
    const changePct = numberValue(row.changepercent, 0);
    const prevClose = numberValue(row.settlement, 0);
    const high = numberValue(row.high, 0);
    const highPct = prevClose > 0 ? ((high - prevClose) / prevClose) * 100 : changePct;
    if (changePct >= limitPct - 0.18) limitUpRows.push(row);
    if (changePct <= -limitPct + 0.18) limitDown += 1;
    if (highPct >= limitPct - 0.18 && changePct < limitPct - 0.18) brokenLimit += 1;
  }

  const leaders = limitUpRows
    .sort((a, b) => numberValue(b.amount, 0) - numberValue(a.amount, 0))
    .slice(0, 16)
    .map((row): LimitPoolStock => ({
      code: stringValue(row.code, ''),
      name: stringValue(row.name, ''),
      changePct: numberValue(row.changepercent, 0),
      amount: numberValue(row.amount, 0),
      turnoverRate: numberValue(row.turnoverratio, 0),
      sector: '--',
      streak: 1,
      firstLimitTime: '--',
      brokenCount: 0
    }));

  return {
    tradeDate: formatDate(new Date()),
    limitUp: limitUpRows.length,
    limitDown,
    brokenLimit,
    maxStreak: leaders.length ? 1 : 0,
    leaders
  };
}

async function fetchSinaLimitPage(page: number, asc: boolean) {
  const url = new URL(`${SINA_MARKET_API}/Market_Center.getHQNodeData`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('num', '100');
  url.searchParams.set('sort', 'changepercent');
  url.searchParams.set('asc', asc ? '1' : '0');
  url.searchParams.set('node', 'hs_a');
  url.searchParams.set('symbol', '');
  url.searchParams.set('_s_r_a', 'page');
  return fetchJson<SinaLimitRow[]>(url.toString());
}

async function fetchLimitPool(endpoint: string, date: string): Promise<LimitPoolResponse> {
  const url = new URL(`https://push2ex.eastmoney.com/${endpoint}`);
  url.searchParams.set('ut', EASTMONEY_TOKEN);
  url.searchParams.set('dpt', 'wz.ztzt');
  url.searchParams.set('Pageindex', '0');
  url.searchParams.set('pagesize', '200');
  url.searchParams.set('sort', endpoint === 'getTopicDTPool' ? 'fund:asc' : 'fbt:asc');
  url.searchParams.set('date', date);
  return fetchJson<LimitPoolResponse>(url.toString());
}

async function fetchMarketIndices(): Promise<MarketIndexSnapshot[]> {
  const text = await fetchMarketText('https://hq.sinajs.cn/list=s_sh000001,s_sz399001,s_sz399006', 'gb18030');
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.flatMap((line, index) => {
    const payload = line.match(/="([^"]*)"/)?.[1];
    const parts = payload?.split(',') ?? [];
    const target = INDEX_TARGETS[index];
    if (!target || parts.length < 6) return [];
    return [{
      code: target.code,
      name: parts[0] || target.name,
      price: numberValue(parts[1], 0),
      changePct: numberValue(parts[3], 0),
      amount: numberValue(parts[5], 0) * 10_000
    }];
  });
}

function buildDragonTigerUrl(pageSize: number, tradeDate = '') {
  const url = new URL('https://datacenter-web.eastmoney.com/api/data/v1/get');
  url.searchParams.set('reportName', 'RPT_DAILYBILLBOARD_DETAILSNEW');
  url.searchParams.set('columns', 'ALL');
  if (tradeDate) url.searchParams.set('filter', `(TRADE_DATE='${tradeDate}')`);
  url.searchParams.set('sortColumns', tradeDate ? 'BILLBOARD_NET_AMT' : 'TRADE_DATE,SECURITY_CODE');
  url.searchParams.set('sortTypes', tradeDate ? '-1' : '-1,1');
  url.searchParams.set('pageNumber', '1');
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('source', 'WEB');
  url.searchParams.set('client', 'WEB');
  return url.toString();
}

function normalizeDragonTigerRow(row: JsonRow): DragonTigerRow | null {
  const code = stringValue(row.SECURITY_CODE, '');
  const name = stringValue(row.SECURITY_NAME_ABBR, '');
  if (!code || !name) return null;

  return {
    code,
    name,
    tradeDate: stringValue(row.TRADE_DATE, '').slice(0, 10),
    price: numberValue(row.CLOSE_PRICE, 0),
    changePct: numberValue(row.CHANGE_RATE, 0),
    turnoverRate: numberValue(row.TURNOVERRATE, 0),
    buyAmount: numberValue(row.BILLBOARD_BUY_AMT, 0),
    sellAmount: numberValue(row.BILLBOARD_SELL_AMT, 0),
    netAmount: numberValue(row.BILLBOARD_NET_AMT, numberValue(row.NET_BS_AMT, 0)),
    dealAmount: numberValue(row.BILLBOARD_DEAL_AMT, 0),
    dealRatio: numberValue(row.DEAL_AMOUNT_RATIO, 0),
    reason: stringValue(row.EXPLANATION, '--'),
    seatInsight: stringValue(row.EXPLAIN, '--')
  };
}

function normalizeDragonTigerSeat(row: JsonRow): DragonTigerSeatRow | null {
  const code = stringValue(row.SECURITY_CODE, '');
  const seatName = stringValue(row.OPERATEDEPT_NAME, '');
  const tradeDate = stringValue(row.TRADE_DATE, '').slice(0, 10);
  if (!code || !seatName || !tradeDate) return null;

  const classification = classifyDragonSeat(seatName);
  return {
    code,
    tradeDate,
    seatCode: stringValue(row.OPERATEDEPT_CODE, ''),
    seatName,
    seatType: classification.type,
    seatLabel: classification.label,
    buyAmount: numberValue(row.BUY, 0),
    sellAmount: numberValue(row.SELL, 0),
    netAmount: numberValue(row.NET, 0),
    marketAmount: numberValue(row.ACCUM_AMOUNT, 0),
    reason: stringValue(row.EXPLANATION, '--'),
    successRate: nullableNumber(row.RISE_PROBABILITY_3DAY),
    recentTimes: nullableNumber(row.TOTAL_BUYER_SALESTIMES_3DAY)
  };
}

function normalizeIntradayTrade(value: string, tradeDate: string): IntradayTradeTick | null {
  const parts = value.split(',');
  const timeText = parts[0] ?? '';
  const price = Number(parts[1]);
  const volume = Number(parts[2]);
  const tradeCount = Number(parts[3]);
  const sideCode = Number(parts[4]);
  const time = Math.floor(new Date(`${tradeDate.replace(/-/g, '/')} ${timeText}`).getTime() / 1000);
  const minute = timeText.slice(0, 5);
  const inTradingPeriod = (minute >= '09:30' && minute <= '11:30') || (minute >= '13:00' && minute <= '15:00');
  if (!time || !inTradingPeriod || !Number.isFinite(price) || !Number.isFinite(volume)) return null;
  return {
    time,
    price,
    volume,
    amount: price * volume,
    tradeCount: Number.isFinite(tradeCount) ? tradeCount : 0,
    side: sideCode === 2 ? 'buy' : sideCode === 1 ? 'sell' : 'neutral'
  };
}

function classifyDragonSeat(name: string): { type: DragonTigerSeatType; label: string } {
  if (name.includes('机构专用')) return { type: 'institution', label: '机构' };
  if (name.includes('沪股通专用') || name.includes('深股通专用')) return { type: 'northbound', label: '股通' };
  const known = KNOWN_HOT_MONEY_SEATS.find((seat) => seat.keywords.some((keyword) => name.includes(keyword)));
  if (known) return { type: 'hotMoney', label: known.label };
  return { type: 'branch', label: '营业部' };
}

function normalizeLimitPoolStock(row: JsonRow): LimitPoolStock | null {
  const code = stringValue(row.c, '');
  const name = stringValue(row.n, '');
  if (!code || !name) return null;
  return {
    code,
    name,
    changePct: numberValue(row.zdp, 0),
    amount: numberValue(row.amount, 0),
    turnoverRate: numberValue(row.hs, 0),
    sector: stringValue(row.hybk, '--'),
    streak: numberValue(row.lbc, numberValue((row.zttj as JsonRow | undefined)?.ct, 1)),
    firstLimitTime: formatPoolTime(numberValue(row.fbt, 0)),
    brokenCount: numberValue(row.zbc, 0)
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const text = await fetchMarketText(url, 'utf-8');
  if (!text) throw new Error('Empty market monitor response');
  return JSON.parse(text) as T;
}

function parseJsonValue(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function recentDateCandidates(days: number) {
  const values: string[] = [];
  const date = new Date();
  for (let offset = 0; values.length < days && offset < days + 8; offset += 1) {
    const candidate = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
    if (candidate.getDay() === 0 || candidate.getDay() === 6) continue;
    values.push(`${candidate.getFullYear()}${String(candidate.getMonth() + 1).padStart(2, '0')}${String(candidate.getDate()).padStart(2, '0')}`);
  }
  return values;
}

function formatTradeDate(value: number) {
  const text = String(value);
  return text.length === 8 ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateBeforeMonths(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return formatDate(date);
}

function formatPoolTime(value: number) {
  const text = String(Math.round(value)).padStart(6, '0');
  return value ? `${text.slice(0, 2)}:${text.slice(2, 4)}` : '--';
}

function sentimentLabel(score: number) {
  if (score < 25) return '冰点';
  if (score < 40) return '偏冷';
  if (score < 60) return '平衡';
  if (score < 75) return '活跃';
  return '过热';
}

function stockLimitPct(code: string, name: string) {
  const normalizedName = name.toUpperCase();
  if (normalizedName.startsWith('N') || normalizedName.startsWith('C')) return null;
  if (normalizedName.includes('ST')) return 5;
  if (code.startsWith('8') || code.startsWith('4') || code.startsWith('920')) return 30;
  if (code.startsWith('300') || code.startsWith('301') || code.startsWith('302') || code.startsWith('688') || code.startsWith('689')) return 20;
  return 10;
}

function eastmoneySecidCandidates(code: string) {
  const primaryMarket = code.startsWith('6') || code.startsWith('9') ? 1 : 0;
  return [`${primaryMarket}.${code}`, `${primaryMarket === 1 ? 0 : 1}.${code}`];
}

function tencentSymbol(code: string) {
  if (code.startsWith('8') || code.startsWith('4') || code.startsWith('920')) return `bj${code}`;
  if (code.startsWith('6') || code.startsWith('9')) return `sh${code}`;
  return `sz${code}`;
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('Market request timed out')), milliseconds))
  ]);
}

function numberValue(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
