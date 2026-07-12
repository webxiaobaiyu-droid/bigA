import type { NewsFeedResult, NewsItem, NewsSourceKey } from '@/types/news';

interface NewsRouteConfig {
  key: string;
  sourceLabel: string;
  channel: string;
  route: string;
  limit: number;
}

interface NewsFetcher {
  label: string;
  load: () => Promise<NewsItem[]>;
}

interface EastmoneyNewsRow {
  code?: string;
  title?: string;
  summary?: string;
  mediaName?: string;
  showTime?: string;
  uniqueUrl?: string;
  url?: string;
  stockList?: string[];
}

interface EastmoneyColumnResponse {
  code?: string;
  data?: {
    list?: EastmoneyNewsRow[];
  };
}

interface EastmoneyFastResponse {
  code?: string;
  data?: {
    fastNewsList?: EastmoneyNewsRow[];
  };
}

interface NeteaseNewsRow {
  title?: string;
  digest?: string;
  docurl?: string;
  time?: string;
  label?: string;
  keywords?: string[];
}

export const NEWS_FILTERS: Array<{ key: 'all' | NewsSourceKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'eastmoney', label: '东方财富' },
  { key: 'netease', label: '网易财经' }
];

const RSSHUB_ROUTES: NewsRouteConfig[] = [
  {
    key: 'cls-telegraph',
    sourceLabel: '财联社',
    channel: '电报',
    route: '/cls/telegraph/watch',
    limit: 28
  },
  {
    key: 'eastmoney-ashare',
    sourceLabel: '东方财富',
    channel: 'A股',
    route: '/eastmoney/search/A股',
    limit: 18
  }
];

const FALLBACK_RSSHUB_BASE_URL = import.meta.env.VITE_BIGA_RSSHUB_BASE_URL || 'https://rsshub.app';
const ENABLE_RSSHUB_NEWS = import.meta.env.VITE_BIGA_ENABLE_RSSHUB_NEWS === '1';
const EASTMONEY_FAST_NEWS_URL = 'https://np-listapi.eastmoney.com/comm/web/getFastNewsList';
const EASTMONEY_COLUMN_NEWS_URL = 'https://np-listapi.eastmoney.com/comm/web/getNewsByColumns';
const NETEASE_FINANCE_URL = 'https://money.163.com/special/00259BVP/news_flow_index.js';
const A_SHARE_TAGS = [
  'A股',
  '沪深',
  '沪指',
  '上证',
  '深成指',
  '创业板',
  '科创',
  '北交所',
  '板块',
  '个股',
  '股票',
  '上市',
  'IPO',
  '涨停',
  '跌停',
  '券商',
  '证券',
  '银行',
  '基金',
  'ETF',
  '北向',
  '龙虎榜',
  '业绩',
  '回购',
  '减持',
  '增持',
  '证监会',
  '交易所',
  '央行'
];

export async function fetchAshareNews(): Promise<NewsFeedResult> {
  const fetchers: NewsFetcher[] = [
    { label: '东方财富快讯', load: fetchEastmoneyFastNews },
    { label: '东方财富资讯', load: fetchEastmoneyColumnNews },
    { label: '网易财经', load: fetchNeteaseFinanceNews },
    ...(ENABLE_RSSHUB_NEWS ? RSSHUB_ROUTES.map((route) => ({ label: route.sourceLabel, load: () => fetchRsshubRoute(route) })) : [])
  ];

  const settled = await Promise.allSettled(fetchers.map((fetcher) => fetcher.load()));
  const sourceLabels: string[] = [];
  const failedLabels: string[] = [];
  const items = new Map<string, NewsItem>();

  settled.forEach((result, index) => {
    const fetcher = fetchers[index];

    if (result.status === 'rejected') {
      failedLabels.push(fetcher.label);
      return;
    }

    if (result.value.length) {
      sourceLabels.push(fetcher.label);
    }

    result.value.forEach((item) => {
      const dedupeKey = item.url || `${item.source}:${item.title}`;
      if (!items.has(dedupeKey)) {
        items.set(dedupeKey, item);
      }
    });
  });

  return {
    items: Array.from(items.values())
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
      .slice(0, 100),
    sourceLabels: unique(sourceLabels),
    failedLabels: unique(failedLabels),
    fetchedAt: Date.now()
  };
}

export async function fetchNewsDetail(item: NewsItem): Promise<string[]> {
  if (!item.url) {
    return paragraphsFromText(item.summary || item.title);
  }

  try {
    const targetUrl = item.source === 'eastmoney' ? canonicalEastmoneyArticleUrl(item.url) : item.url;
    const html = await fetchNewsText(targetUrl);
    const paragraphs = item.source === 'eastmoney'
      ? parseEastmoneyArticle(html)
      : item.source === 'netease'
        ? parseNeteaseArticle(html)
        : parseGenericArticle(html);
    return preferCompleteArticle(paragraphs, item.summary || item.title);
  } catch {
    return paragraphsFromText(item.summary || item.title);
  }
}

async function fetchEastmoneyFastNews() {
  const url = withParams(EASTMONEY_FAST_NEWS_URL, {
    client: 'web',
    biz: 'web_724',
    fastColumn: '102',
    sortEnd: '',
    pageSize: '40',
    req_trace: requestTrace()
  });
  const response = JSON.parse(await fetchNewsText(url)) as EastmoneyFastResponse;
  return (response.data?.fastNewsList ?? [])
    .map((row) => normalizeEastmoneyItem(row, '快讯'))
    .filter((item): item is NewsItem => Boolean(item));
}

async function fetchEastmoneyColumnNews() {
  const url = withParams(EASTMONEY_COLUMN_NEWS_URL, {
    client: 'web',
    biz: 'web_news_col',
    column: '345',
    order: '1',
    needInteractData: '0',
    page_index: '1',
    page_size: '40',
    req_trace: requestTrace()
  });
  const response = JSON.parse(await fetchNewsText(url)) as EastmoneyColumnResponse;
  return (response.data?.list ?? [])
    .map((row) => normalizeEastmoneyItem(row, '资讯'))
    .filter((item): item is NewsItem => Boolean(item));
}

async function fetchNeteaseFinanceNews() {
  const rows = parseNeteaseJsonp(await fetchNewsText(NETEASE_FINANCE_URL));
  return rows
    .map(normalizeNeteaseItem)
    .filter((item): item is NewsItem => Boolean(item))
    .slice(0, 24);
}

async function fetchRsshubRoute(source: NewsRouteConfig) {
  const xml = await fetchNewsText(source.route);
  if (!xml.trim()) {
    throw new Error(`${source.sourceLabel} returned empty RSS`);
  }

  return parseFeed(xml, source);
}

async function fetchNewsText(targetText: string) {
  if (window.bigA?.fetchNewsText) {
    return window.bigA.fetchNewsText(targetText);
  }

  const target = targetText.startsWith('http') ? new URL(targetText) : new URL(targetText, withTrailingSlash(FALLBACK_RSSHUB_BASE_URL));
  const response = await fetch(target);
  if (!response.ok) {
    throw new Error(`News request failed: ${response.status}`);
  }

  return response.text();
}

function normalizeEastmoneyItem(row: EastmoneyNewsRow, channel: string): NewsItem | null {
  const title = cleanText(row.title ?? '');
  if (!title) {
    return null;
  }

  const summary = cleanText(row.summary ?? '');
  const tags = tagsFor(`${title} ${summary} ${(row.stockList ?? []).join(' ')}`);

  return {
    id: `eastmoney-${hashText(`${row.code ?? ''}:${title}`)}`,
    title,
    summary,
    source: 'eastmoney',
    sourceLabel: row.mediaName || '东方财富',
    channel,
    publishedAt: parseDate(row.showTime ?? ''),
    url: normalizeEastmoneyUrl(row),
    tags: [...tags, ...stockTags(row.stockList)].slice(0, 3)
  };
}

function normalizeNeteaseItem(row: NeteaseNewsRow): NewsItem | null {
  const title = cleanText(row.title ?? '');
  if (!title) {
    return null;
  }

  const summary = cleanText(row.digest ?? '');
  const tags = tagsFor(`${title} ${summary} ${(row.keywords ?? []).join(' ')}`);

  if (!tags.length && !/股|上市|市场|公司|基金|银行|证券|券商|IPO|ETF/i.test(`${title}${summary}`)) {
    return null;
  }

  return {
    id: `netease-${hashText(`${row.docurl ?? ''}:${title}`)}`,
    title,
    summary,
    source: 'netease',
    sourceLabel: '网易财经',
    channel: row.label || '财经',
    publishedAt: parseDate(row.time ?? ''),
    url: row.docurl ?? '',
    tags: tags.slice(0, 3)
  };
}

function parseNeteaseJsonp(text: string) {
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  if (start < 0 || end <= start) {
    return [];
  }

  try {
    return JSON.parse(text.slice(start + 1, end)) as NeteaseNewsRow[];
  } catch {
    return [];
  }
}

function parseFeed(xml: string, source: NewsRouteConfig) {
  const document = new DOMParser().parseFromString(xml, 'application/xml');

  if (document.querySelector('parsererror')) {
    return [];
  }

  return Array.from(document.querySelectorAll('item, entry'))
    .map((node) => normalizeRsshubItem(node, source))
    .filter((item): item is NewsItem => Boolean(item))
    .slice(0, source.limit);
}

function normalizeRsshubItem(node: Element, source: NewsRouteConfig): NewsItem | null {
  const title = cleanText(readText(node, ['title']));
  if (!title) {
    return null;
  }

  const url = readLink(node);
  const rawSummary = readText(node, ['description', 'summary', 'content', 'content:encoded']);
  const summary = cleanText(rawSummary);
  const publishedAt = parseDate(readText(node, ['pubDate', 'updated', 'published', 'dc:date']));
  const textForTags = `${title} ${summary}`;

  return {
    id: `${source.key}-${hashText(`${title}:${url}:${publishedAt ?? ''}`)}`,
    title,
    summary,
    source: 'rsshub',
    sourceLabel: source.sourceLabel,
    channel: source.channel,
    publishedAt,
    url,
    tags: tagsFor(textForTags).slice(0, 3)
  };
}

function readText(node: Element, names: string[]) {
  for (const name of names) {
    const value = node.getElementsByTagName(name)[0]?.textContent?.trim();
    if (value) {
      return value;
    }
  }

  return '';
}

function readLink(node: Element) {
  const atomLink = Array.from(node.getElementsByTagName('link')).find((item) => item.getAttribute('href'));
  if (atomLink?.getAttribute('href')) {
    return atomLink.getAttribute('href') ?? '';
  }

  return readText(node, ['link', 'guid']);
}

function cleanText(value: string) {
  if (!value) {
    return '';
  }

  const document = new DOMParser().parseFromString(value, 'text/html');
  return (document.documentElement.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function parseDate(value: string) {
  if (!value) {
    return null;
  }

  const normalized = value.includes('-') ? value.replace(/-/g, '/') : value;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

function tagsFor(text: string) {
  return A_SHARE_TAGS.filter((tag) => text.includes(tag));
}

function stockTags(stockList: string[] | undefined) {
  if (!stockList?.length) {
    return [];
  }

  return ['关联标的'];
}

function normalizeEastmoneyUrl(row: EastmoneyNewsRow) {
  if (row.uniqueUrl) {
    return normalizeNewsUrl(row.uniqueUrl);
  }

  if (row.url) {
    return canonicalEastmoneyArticleUrl(normalizeNewsUrl(row.url));
  }

  return row.code ? `https://finance.eastmoney.com/a/${row.code}.html` : '';
}

function parseEastmoneyArticle(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const body = document.querySelector('#ContentBody, .txtinfos, .article-body, .article-content, .newsContent');
  return body ? paragraphsFromContainer(body) : paragraphsFromStructuredData(document);
}

function parseNeteaseArticle(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const body = document.querySelector('.post_body, #content .post_body, .post_content_main, .article-body');
  return body ? paragraphsFromContainer(body) : paragraphsFromStructuredData(document);
}

function parseGenericArticle(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const body = document.querySelector('article, [itemprop="articleBody"], .article-body, .article-content, .post_body, #ContentBody');
  return body ? paragraphsFromContainer(body) : paragraphsFromStructuredData(document);
}

function paragraphsFromContainer(source: Element) {
  const body = source.cloneNode(true) as Element;
  body.querySelectorAll('script, style, noscript, iframe, img, video, audio, figure, form, button, .ad, .advertisement').forEach((node) => node.remove());

  const blocks = Array.from(body.querySelectorAll('p, h2, h3, blockquote'))
    .map((node) => cleanText(node.textContent ?? ''))
    .filter(isArticleParagraph);

  if (blocks.length) {
    return unique(blocks);
  }

  return paragraphsFromText(body.textContent ?? '').filter(isArticleParagraph);
}

function paragraphsFromStructuredData(document: Document) {
  for (const node of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const payload = JSON.parse(node.textContent || '{}') as { articleBody?: unknown } | Array<{ articleBody?: unknown }>;
      const entries = Array.isArray(payload) ? payload : [payload];
      const articleBody = entries.find((entry) => typeof entry?.articleBody === 'string')?.articleBody;
      if (typeof articleBody === 'string') {
        const paragraphs = paragraphsFromText(articleBody).filter(isArticleParagraph);
        if (paragraphs.length) return paragraphs;
      }
    } catch {
      // Some publishers include non-standard JSON-LD; continue to metadata fallback.
    }
  }

  const description = document.querySelector('meta[name="description"], meta[property="og:description"]')?.getAttribute('content') ?? '';
  return paragraphsFromText(description);
}

function preferCompleteArticle(paragraphs: string[], fallback: string) {
  const fallbackParagraphs = paragraphsFromText(fallback);
  const articleLength = paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0);
  const fallbackLength = fallbackParagraphs.reduce((sum, paragraph) => sum + paragraph.length, 0);
  return articleLength >= Math.max(80, fallbackLength) ? paragraphs : fallbackParagraphs;
}

function isArticleParagraph(text: string) {
  if (!text) return false;
  return ![
    '文章来源',
    '东方财富发布此内容',
    '本文来源',
    '责任编辑',
    '免责声明',
    '风险提示',
    '打开网易新闻',
    '声明：个人原创'
  ].some((marker) => text.includes(marker));
}

function canonicalEastmoneyArticleUrl(url: string) {
  return url.replace(/\/news\/[^/,]+,(\d+)\.html(?:\?.*)?$/i, '/a/$1.html');
}

function paragraphsFromText(value: string) {
  const text = cleanText(value);
  if (!text) {
    return [];
  }

  return text
    .split(/(?<=。|！|？|；)\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeNewsUrl(url: string) {
  if (!url) {
    return '';
  }

  if (url.startsWith('//')) {
    return `https:${url}`;
  }

  if (url.startsWith('http://')) {
    return `https://${url.slice('http://'.length)}`;
  }

  return url;
}

function withParams(url: string, params: Record<string, string>) {
  const target = new URL(url);
  Object.entries(params).forEach(([key, value]) => {
    target.searchParams.set(key, value);
  });

  return target.toString();
}

function requestTrace() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function withTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}
