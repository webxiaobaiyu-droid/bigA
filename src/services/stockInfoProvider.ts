import { fetchMarketText } from '@/services/marketTransport';
import type { StockMeta } from '@/types/market';
import type { NewsItem } from '@/types/news';
import type { StockAnnouncement, StockCompanyProfile, StockFinancialReport } from '@/types/stockInfo';

interface EastmoneyStockNewsRow {
  code?: string;
  title?: string;
  content?: string;
  mediaName?: string;
  date?: string;
  url?: string;
}

interface EastmoneyFinanceRow {
  REPORT_DATE?: string;
  REPORT_DATE_NAME?: string;
  REPORT_TYPE?: string;
  TOTALOPERATEREVE?: number;
  TOTALOPERATEREVETZ?: number;
  PARENTNETPROFIT?: number;
  PARENTNETPROFITTZ?: number;
  EPSJB?: number;
  BPS?: number;
  ROEJQ?: number;
  XSMLL?: number;
  ZCFZL?: number;
  MGJYXJJE?: number;
}

interface EastmoneyCompanyRow {
  ORG_NAME?: string;
  ORG_NAME_EN?: string;
  SECURITY_TYPE?: string;
  BOARD_NAME_LEVEL?: string;
  EM2016?: string;
  TRADE_MARKET?: string;
  LISTING_DATE?: string;
  FOUND_DATE?: string;
  CHAIRMAN?: string;
  PRESIDENT?: string;
  LEGAL_PERSON?: string;
  ACTUAL_HOLDER?: string;
  EMP_NUM?: number;
  REG_CAPITAL?: number;
  ORG_WEB?: string;
  ORG_TEL?: string;
  ORG_EMAIL?: string;
  ADDRESS?: string;
  MAIN_BUSINESS?: string;
  BUSINESS_SCOPE?: string;
  ORG_PROFILE?: string;
}

interface EastmoneyAnnouncementRow {
  art_code?: string;
  title?: string;
  title_ch?: string;
  notice_date?: string;
  display_time?: string;
  columns?: Array<{ column_name?: string }>;
}

const FINANCE_COLUMNS = [
  'SECUCODE',
  'REPORT_DATE',
  'REPORT_DATE_NAME',
  'REPORT_TYPE',
  'TOTALOPERATEREVE',
  'TOTALOPERATEREVETZ',
  'PARENTNETPROFIT',
  'PARENTNETPROFITTZ',
  'EPSJB',
  'BPS',
  'ROEJQ',
  'XSMLL',
  'ZCFZL',
  'MGJYXJJE'
].join(',');

export async function fetchStockNews(meta: StockMeta): Promise<NewsItem[]> {
  const callback = 'bigaStockNews';
  const searchParam = {
    uid: '',
    keyword: meta.name,
    type: ['cmsArticleWebOld'],
    client: 'web',
    clientType: 'web',
    clientVersion: 'curr',
    param: {
      cmsArticleWebOld: {
        searchScope: 'default',
        sort: 'time',
        pageIndex: 1,
        pageSize: 12,
        preTag: '',
        postTag: ''
      }
    }
  };
  const url = new URL('https://search-api-web.eastmoney.com/search/jsonp');
  url.searchParams.set('cb', callback);
  url.searchParams.set('param', JSON.stringify(searchParam));

  const payload = parseJsonp<{ result?: { cmsArticleWebOld?: EastmoneyStockNewsRow[] } }>(await fetchMarketText(url.toString()), callback);
  return (payload.result?.cmsArticleWebOld ?? []).map((row) => normalizeStockNews(row, meta)).filter((item): item is NewsItem => Boolean(item));
}

export async function fetchStockFinancials(meta: StockMeta): Promise<StockFinancialReport[]> {
  const payload = await fetchDatacenter<EastmoneyFinanceRow>('RPT_F10_FINANCE_MAINFINADATA', meta, FINANCE_COLUMNS, 20, {
    sortTypes: '-1',
    sortColumns: 'REPORT_DATE'
  });

  return payload.map((row) => ({
    reportDate: dateOnly(row.REPORT_DATE),
    reportName: row.REPORT_DATE_NAME || row.REPORT_TYPE || dateOnly(row.REPORT_DATE),
    revenue: nullableNumber(row.TOTALOPERATEREVE),
    revenueGrowth: nullableNumber(row.TOTALOPERATEREVETZ),
    netProfit: nullableNumber(row.PARENTNETPROFIT),
    netProfitGrowth: nullableNumber(row.PARENTNETPROFITTZ),
    eps: nullableNumber(row.EPSJB),
    bookValuePerShare: nullableNumber(row.BPS),
    roe: nullableNumber(row.ROEJQ),
    grossMargin: nullableNumber(row.XSMLL),
    debtRatio: nullableNumber(row.ZCFZL),
    operatingCashflowPerShare: nullableNumber(row.MGJYXJJE)
  }));
}

export async function fetchStockCompanyProfile(meta: StockMeta): Promise<StockCompanyProfile | null> {
  const rows = await fetchDatacenter<EastmoneyCompanyRow>('RPT_F10_BASIC_ORGINFO', meta, 'ALL', 1);
  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    fullName: cleanText(row.ORG_NAME),
    englishName: cleanText(row.ORG_NAME_EN),
    securityType: cleanText(row.SECURITY_TYPE),
    industry: cleanText(row.BOARD_NAME_LEVEL || row.EM2016),
    exchange: cleanText(row.TRADE_MARKET),
    listingDate: dateOnly(row.LISTING_DATE),
    foundedDate: dateOnly(row.FOUND_DATE),
    chairman: cleanText(row.CHAIRMAN),
    president: cleanText(row.PRESIDENT),
    legalRepresentative: cleanText(row.LEGAL_PERSON),
    actualController: cleanText(row.ACTUAL_HOLDER),
    employees: nullableNumber(row.EMP_NUM),
    registeredCapital: nullableNumber(row.REG_CAPITAL),
    website: cleanText(row.ORG_WEB),
    phone: cleanText(row.ORG_TEL),
    email: cleanText(row.ORG_EMAIL),
    address: cleanText(row.ADDRESS),
    mainBusiness: cleanText(row.MAIN_BUSINESS),
    businessScope: cleanText(row.BUSINESS_SCOPE),
    profile: cleanText(row.ORG_PROFILE)
  };
}

export async function fetchStockAnnouncements(meta: StockMeta): Promise<StockAnnouncement[]> {
  const url = new URL('https://np-anotice-stock.eastmoney.com/api/security/ann');
  url.searchParams.set('sr', '-1');
  url.searchParams.set('page_size', '15');
  url.searchParams.set('page_index', '1');
  url.searchParams.set('ann_type', 'A');
  url.searchParams.set('client_source', 'web');
  url.searchParams.set('stock_list', meta.code);

  const text = await fetchMarketText(url.toString());
  const payload = JSON.parse(text) as { data?: { list?: EastmoneyAnnouncementRow[] } };
  return (payload.data?.list ?? []).map((row) => ({
    id: row.art_code || `${meta.code}-${row.notice_date}-${row.title}`,
    title: cleanText(row.title_ch || row.title),
    category: cleanText(row.columns?.[0]?.column_name) || '公司公告',
    publishedAt: parseDate(row.notice_date || row.display_time)
  })).filter((item) => item.title);
}

async function fetchDatacenter<T>(reportName: string, meta: StockMeta, columns: string, pageSize: number, extra: Record<string, string> = {}) {
  const url = new URL('https://datacenter.eastmoney.com/securities/api/data/v1/get');
  url.searchParams.set('reportName', reportName);
  url.searchParams.set('columns', columns);
  url.searchParams.set('filter', `(SECUCODE="${securityCode(meta)}")`);
  url.searchParams.set('pageNumber', '1');
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('source', 'HSF10');
  url.searchParams.set('client', 'PC');
  Object.entries(extra).forEach(([key, value]) => url.searchParams.set(key, value));

  const text = await fetchMarketText(url.toString());
  const payload = JSON.parse(text) as { success?: boolean; result?: { data?: T[] } };
  return payload.success ? payload.result?.data ?? [] : [];
}

function normalizeStockNews(row: EastmoneyStockNewsRow, meta: StockMeta): NewsItem | null {
  const title = cleanText(row.title);
  if (!title) {
    return null;
  }
  const url = normalizeUrl(row.url);
  return {
    id: `stock-${row.code || hashText(`${title}:${url}`)}`,
    title,
    summary: cleanText(row.content),
    source: 'eastmoney',
    sourceLabel: cleanText(row.mediaName) || '东方财富',
    channel: '个股资讯',
    publishedAt: parseDate(row.date),
    url,
    tags: [meta.name, meta.code]
  };
}

function parseJsonp<T>(text: string, callback: string): T {
  const prefix = `${callback}(`;
  const start = text.indexOf(prefix);
  const end = text.lastIndexOf(')');
  if (start < 0 || end <= start) {
    throw new Error('Invalid stock news response');
  }
  return JSON.parse(text.slice(start + prefix.length, end)) as T;
}

function securityCode(meta: StockMeta) {
  return `${meta.code}.${meta.market}`;
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function dateOnly(value: unknown) {
  const text = cleanText(value);
  return text ? text.slice(0, 10) : '';
}

function parseDate(value: unknown) {
  const text = cleanText(value);
  if (!text) {
    return null;
  }
  const timestamp = Date.parse(text.replace(/-/g, '/'));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function nullableNumber(value: unknown) {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) ? number : null;
}

function normalizeUrl(value: unknown) {
  const url = cleanText(value);
  return url.startsWith('http://') ? `https://${url.slice(7)}` : url;
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
