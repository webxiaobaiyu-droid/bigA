import { A_SHARE_UNIVERSE } from '@/data/universe';
import { buildSignals, summarizeIndicators } from '@/services/indicators';
import { getAshareMarketPhase } from '@/services/marketCalendar';
import { fetchSinaDailyCandles } from '@/services/historicalCandles';
import { fetchMarketText } from '@/services/marketTransport';
import { fetchStockCandles } from '@/services/sectorProvider';
import type { Candle, InstrumentState, MarketDataProvider, MarketPhase, MarketSnapshotListener, OrderLevel, Quote, StockMeta } from '@/types/market';

type EastmoneyQuoteRow = Record<string, number | string | undefined>;

interface SinaQuoteSnapshot {
  name: string;
  open: number;
  prevClose: number;
  price: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  updatedAt: number;
  bid: OrderLevel[];
  ask: OrderLevel[];
}

const EASTMONEY_QUOTE_FIELDS = [
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f12',
  'f13',
  'f14',
  'f15',
  'f16',
  'f17',
  'f18',
  'f20',
  'f23',
  'f100',
  'f124'
].join(',');

const QUOTE_REFRESH_MS = 3_800;
const CHART_REFRESH_MS = 90_000;
const CHART_LOAD_BATCH_SIZE = 1;

export class EastmoneyAshareProvider implements MarketDataProvider {
  readonly providerName = 'EastmoneyAshareProvider';
  readonly sourceLabel = '真实行情';
  readonly refreshLabel = '3.8s / 90s';

  private universe: StockMeta[];
  private states = new Map<string, InstrumentState>();
  private listeners = new Set<MarketSnapshotListener>();
  private quoteTimer: number | undefined;
  private chartTimer: number | undefined;
  private quoteInFlight = false;
  private chartInFlight = false;
  private sourceStatus = '待接入';

  constructor(universe: StockMeta[] = A_SHARE_UNIVERSE) {
    this.universe = uniqueMetas(universe);
    this.universe.forEach((meta) => this.states.set(meta.code, createEmptyState(meta)));
  }

  start() {
    if (this.quoteTimer) {
      return;
    }

    if (!this.universe.length) {
      this.sourceStatus = '待接入';
      this.emit();
      return;
    }

    void this.refreshQuotes();
    void this.refreshCharts();
    this.quoteTimer = window.setInterval(() => void this.refreshQuotes(), QUOTE_REFRESH_MS);
    this.chartTimer = window.setInterval(() => void this.refreshCharts(), CHART_REFRESH_MS);
    this.emit();
  }

  stop() {
    if (this.quoteTimer) {
      window.clearInterval(this.quoteTimer);
      this.quoteTimer = undefined;
    }

    if (this.chartTimer) {
      window.clearInterval(this.chartTimer);
      this.chartTimer = undefined;
    }
  }

  getSnapshot() {
    return Array.from(this.states.values()).map(cloneState);
  }

  getMarketPhase(): MarketPhase {
    return getAshareMarketPhase();
  }

  getSourceStatus() {
    return this.sourceStatus;
  }

  subscribe(listener: MarketSnapshotListener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  addInstrument(meta: StockMeta) {
    const existing = this.universe.find((item) => item.code === meta.code);
    if (existing) {
      return;
    }

    this.universe = [meta, ...this.universe];
    this.states.set(meta.code, createEmptyState(meta));
    this.emit();

    if (!this.quoteTimer) {
      this.start();
      return;
    }

    void this.refreshQuotes();
    void this.refreshChartsFor(meta).then(() => this.emit());
  }

  removeInstrument(code: string) {
    this.universe = this.universe.filter((item) => item.code !== code);
    this.states.delete(code);

    if (!this.universe.length) {
      this.stop();
      this.sourceStatus = '待接入';
    }

    this.emit();
  }

  private async refreshQuotes() {
    if (this.quoteInFlight) {
      return;
    }

    this.quoteInFlight = true;

    try {
      const [quotesResult, sinaResult] = await Promise.allSettled([this.fetchEastmoneyQuotes(), this.fetchSinaQuotes()]);
      const quotes = quotesResult.status === 'fulfilled' ? quotesResult.value : [];
      const sinaQuotes = sinaResult.status === 'fulfilled' ? sinaResult.value : new Map<string, SinaQuoteSnapshot>();
      const dailyQuotes = new Map<string, Candle[]>();

      if (!quotes.length && !sinaQuotes.size) {
        const dailyResults = await Promise.allSettled(
          this.universe.map(async (meta) => ({ code: meta.code, candles: await fetchSinaDailyCandles(meta.code) }))
        );
        dailyResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.candles.length) {
            dailyQuotes.set(result.value.code, result.value.candles);
          }
        });
      }

      if (!quotes.length && !sinaQuotes.size && !dailyQuotes.size) {
        throw new Error('No quote rows returned');
      }

      const updatedCodes = new Set<string>();
      quotes.forEach((quote) => {
        const code = stringField(quote.f12, '');
        const state = this.states.get(code);
        const meta = this.universe.find((item) => item.code === code);
        if (!state || !meta) {
          return;
        }

        const nextMeta = {
          ...meta,
          name: stringField(quote.f14, meta.name),
          sector: stringField(quote.f100, meta.sector)
        };
        state.meta = nextMeta;
        this.universe = this.universe.map((item) => (item.code === code ? nextMeta : item));
        const previousPrice = state.quote.price;
        const book = sinaQuotes.get(code);
        const nextQuote = toQuote(nextMeta, quote, previousPrice, book, state.quote);
        state.quote = nextQuote;
        state.indicators = summarizeIndicators(chartCandlesForIndicators(state));
        state.signals = buildSignals(nextQuote, chartCandlesForIndicators(state), state.indicators);
        updatedCodes.add(code);
      });

      this.universe.forEach((meta) => {
        if (updatedCodes.has(meta.code)) {
          return;
        }
        const state = this.states.get(meta.code);
        const sinaQuote = sinaQuotes.get(meta.code);
        if (!state || !sinaQuote) {
          return;
        }

        state.meta = { ...meta, name: sinaQuote.name || meta.name };
        state.quote = toSinaQuote(state.meta, sinaQuote, state.quote);
        state.indicators = summarizeIndicators(chartCandlesForIndicators(state));
        state.signals = buildSignals(state.quote, chartCandlesForIndicators(state), state.indicators);
        updatedCodes.add(meta.code);
      });

      this.universe.forEach((meta) => {
        if (updatedCodes.has(meta.code)) {
          return;
        }
        const state = this.states.get(meta.code);
        const daily = dailyQuotes.get(meta.code);
        if (!state || !daily?.length) {
          return;
        }

        state.quote = toDailyQuote(meta, daily, state.quote);
        state.indicators = summarizeIndicators(daily);
        state.signals = buildSignals(state.quote, daily, state.indicators);
      });

      this.sourceStatus = quotes.length ? '东方财富+新浪' : sinaQuotes.size ? '新浪行情' : '新浪日线兜底';
      this.emit();
    } catch (error) {
      console.warn('[market] quote refresh failed', error);
      this.sourceStatus = '行情接口暂不可用';
    } finally {
      this.quoteInFlight = false;
    }
  }

  private async refreshCharts() {
    if (this.chartInFlight) {
      return;
    }

    this.chartInFlight = true;

    try {
      for (let index = 0; index < this.universe.length; index += CHART_LOAD_BATCH_SIZE) {
        const batch = this.universe.slice(index, index + CHART_LOAD_BATCH_SIZE);
        await Promise.allSettled(batch.map((meta) => this.refreshChartsFor(meta)));
      }

      this.emit();
    } catch (error) {
      console.warn('[market] chart refresh failed', error);
    } finally {
      this.chartInFlight = false;
    }
  }

  private async refreshChartsFor(meta: StockMeta) {
    const state = this.states.get(meta.code);
    if (!state) {
      return;
    }

    const [intraday, daily, weekly, monthly] = await Promise.all([
      safeCandles(() => fetchStockCandles(meta.code, 'fs')),
      safeCandles(() => fetchStockCandles(meta.code, '1d')),
      safeCandles(() => fetchStockCandles(meta.code, '1w')),
      safeCandles(() => fetchStockCandles(meta.code, '1mo'))
    ]);

    state.candles = {
      fs: intraday.length ? intraday : state.candles.fs,
      '1d': daily.length ? daily : state.candles['1d'],
      '1w': weekly.length ? weekly : state.candles['1w'],
      '1mo': monthly.length ? monthly : state.candles['1mo']
    };
    state.indicators = summarizeIndicators(chartCandlesForIndicators(state));
    state.signals = buildSignals(state.quote, chartCandlesForIndicators(state), state.indicators);
  }

  private async fetchEastmoneyQuotes() {
    const secids = this.universe.map(toEastmoneySecid).join(',');
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=${EASTMONEY_QUOTE_FIELDS}&secids=${encodeURIComponent(secids)}`;
    const data = await fetchJson<{ data?: { diff?: EastmoneyQuoteRow[] } }>(url);
    return data.data?.diff ?? [];
  }

  private async fetchSinaQuotes() {
    const symbols = this.universe.map(toSinaSymbol).join(',');
    const text = await fetchMarketText(`https://hq.sinajs.cn/list=${symbols}`, 'gb18030');
    return parseSinaQuotes(text);
  }

  private emit() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

function toQuote(meta: StockMeta, row: EastmoneyQuoteRow, previousPrice: number, book: { bid: OrderLevel[]; ask: OrderLevel[] } | undefined, previousQuote: Quote): Quote {
  const price = numberField(row.f2, previousQuote.price);
  const prevClose = numberField(row.f18, previousQuote.prevClose);
  const high = numberField(row.f15, previousQuote.high);
  const low = numberField(row.f16, previousQuote.low);
  const open = numberField(row.f17, previousQuote.open);
  const change = numberField(row.f4, price - prevClose);
  const changePct = numberField(row.f3, prevClose ? (change / prevClose) * 100 : 0);
  const volumeHands = numberField(row.f5, previousQuote.volume);
  const amount = numberField(row.f6, previousQuote.amount);
  const speed = previousPrice ? ((price - previousPrice) / previousPrice) * 100 : 0;

  return {
    code: meta.code,
    name: stringField(row.f14, meta.name),
    market: meta.market,
    sector: meta.sector,
    price,
    prevClose,
    open,
    high,
    low,
    change,
    changePct,
    volume: volumeHands,
    amount,
    turnoverRate: numberField(row.f8, previousQuote.turnoverRate),
    amplitude: numberField(row.f7, previousQuote.amplitude),
    bid: book?.bid.length ? book.bid : previousQuote.bid,
    ask: book?.ask.length ? book.ask : previousQuote.ask,
    speed,
    updatedAt: providerTimestamp(row.f124) || previousQuote.updatedAt
  };
}

function parseSinaQuotes(text: string) {
  const rows = new Map<string, SinaQuoteSnapshot>();
  const pattern = /var hq_str_(sh|sz|bj)(\d+)="([^"]*)";/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const code = match[2];
    const parts = match[3].split(',');
    const price = Number(parts[3]);
    const bid = parseSinaLevels(parts, 10);
    const ask = parseSinaLevels(parts, 20);

    if (parts[0] && Number.isFinite(price) && price > 0) {
      rows.set(code, {
        name: parts[0],
        open: numberField(parts[1], 0),
        prevClose: numberField(parts[2], 0),
        price,
        high: numberField(parts[4], price),
        low: numberField(parts[5], price),
        volume: numberField(parts[8], 0),
        amount: numberField(parts[9], 0),
        updatedAt: parseSinaTimestamp(parts[30], parts[31]),
        bid,
        ask
      });
    }
  }

  return rows;
}

function toSinaQuote(meta: StockMeta, row: SinaQuoteSnapshot, previousQuote: Quote): Quote {
  const prevClose = row.prevClose || previousQuote.prevClose;
  const change = row.price - prevClose;
  const previousPrice = previousQuote.price;

  return {
    code: meta.code,
    name: row.name || meta.name,
    market: meta.market,
    sector: meta.sector,
    price: row.price,
    prevClose,
    open: row.open,
    high: row.high,
    low: row.low,
    change,
    changePct: prevClose ? (change / prevClose) * 100 : 0,
    volume: Math.round(row.volume / 100),
    amount: row.amount,
    turnoverRate: previousQuote.turnoverRate,
    amplitude: prevClose ? ((row.high - row.low) / prevClose) * 100 : 0,
    speed: previousPrice ? ((row.price - previousPrice) / previousPrice) * 100 : 0,
    bid: row.bid.length ? row.bid : previousQuote.bid,
    ask: row.ask.length ? row.ask : previousQuote.ask,
    updatedAt: row.updatedAt || previousQuote.updatedAt
  };
}

function toDailyQuote(meta: StockMeta, candles: Candle[], previousQuote: Quote): Quote {
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const prevClose = previous?.close || previousQuote.prevClose || latest.open;
  const change = latest.close - prevClose;

  return {
    code: meta.code,
    name: meta.name,
    market: meta.market,
    sector: meta.sector,
    price: latest.close,
    prevClose,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    change,
    changePct: prevClose ? (change / prevClose) * 100 : 0,
    volume: Math.round(latest.volume / 100),
    amount: latest.volume * latest.close,
    turnoverRate: previousQuote.turnoverRate,
    amplitude: prevClose ? ((latest.high - latest.low) / prevClose) * 100 : 0,
    speed: previousQuote.price ? ((latest.close - previousQuote.price) / previousQuote.price) * 100 : 0,
    bid: previousQuote.bid,
    ask: previousQuote.ask,
    updatedAt: latest.time * 1000
  };
}

function providerTimestamp(value: unknown) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

function parseSinaTimestamp(dateText: string | undefined, timeText: string | undefined) {
  if (!dateText || !timeText) return 0;
  const timestamp = new Date(`${dateText.replace(/-/g, '/')} ${timeText}`).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function parseSinaLevels(parts: string[], start: number) {
  const levels: OrderLevel[] = [];

  for (let offset = 0; offset < 10; offset += 2) {
    const volumeShares = Number(parts[start + offset]);
    const price = Number(parts[start + offset + 1]);

    if (Number.isFinite(price) && price > 0) {
      levels.push({
        price,
        volume: Number.isFinite(volumeShares) ? Math.round(volumeShares / 100) : 0
      });
    }
  }

  return levels;
}

function chartCandlesForIndicators(state: InstrumentState) {
  return state.candles['1d'];
}

async function fetchJson<T>(url: string): Promise<T> {
  const text = await fetchMarketText(url, 'utf-8');
  if (!text) {
    throw new Error('Empty market data response');
  }

  return JSON.parse(text) as T;
}

function toEastmoneySecid(meta: StockMeta) {
  return `${meta.market === 'SH' ? 1 : 0}.${meta.code}`;
}

function toSinaSymbol(meta: StockMeta) {
  return `${meta.market.toLowerCase()}${meta.code}`;
}

function numberField(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) && next !== -1 ? next : fallback;
}

function stringField(value: unknown, fallback: string) {
  return typeof value === 'string' && value ? value : fallback;
}

async function safeCandles(loader: () => Promise<Candle[]>) {
  try {
    return await loader();
  } catch {
    return [];
  }
}

function cloneState(state: InstrumentState): InstrumentState {
  return {
    ...state,
    quote: {
      ...state.quote,
      bid: state.quote.bid.map((item) => ({ ...item })),
      ask: state.quote.ask.map((item) => ({ ...item }))
    },
    candles: {
      fs: state.candles.fs.map((candle) => ({ ...candle })),
      '1d': state.candles['1d'].map((candle) => ({ ...candle })),
      '1w': state.candles['1w'].map((candle) => ({ ...candle })),
      '1mo': state.candles['1mo'].map((candle) => ({ ...candle }))
    },
    indicators: { ...state.indicators },
    signals: state.signals.map((signal) => ({ ...signal }))
  };
}

function uniqueMetas(metas: StockMeta[]) {
  const seen = new Set<string>();
  return metas.filter((meta) => {
    if (seen.has(meta.code)) {
      return false;
    }
    seen.add(meta.code);
    return true;
  });
}

function createEmptyState(meta: StockMeta): InstrumentState {
  const quote: Quote = {
    code: meta.code,
    name: meta.name,
    market: meta.market,
    sector: meta.sector,
    price: 0,
    prevClose: 0,
    open: 0,
    high: 0,
    low: 0,
    change: 0,
    changePct: 0,
    volume: 0,
    amount: 0,
    turnoverRate: 0,
    amplitude: 0,
    speed: 0,
    bid: emptyOrderLevels(),
    ask: emptyOrderLevels(),
    updatedAt: 0
  };
  const candles: InstrumentState['candles'] = {
    fs: [],
    '1d': [],
    '1w': [],
    '1mo': []
  };
  const indicators = summarizeIndicators([]);

  return {
    meta: { ...meta },
    quote,
    candles,
    indicators,
    signals: buildSignals(quote, [], indicators)
  };
}

function emptyOrderLevels(): OrderLevel[] {
  return Array.from({ length: 5 }, () => ({ price: 0, volume: 0 }));
}
