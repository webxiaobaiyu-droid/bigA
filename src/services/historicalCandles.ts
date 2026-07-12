import { fetchMarketText } from '@/services/marketTransport';
import type { AdjustmentMode, Candle } from '@/types/market';

interface SinaDailyRow {
  day?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
}

export interface SinaAdjustmentFactor {
  d: string;
  f: string | number;
}

const CACHE_TTL_MS = 30_000;
const dailyCache = new Map<string, { expiresAt: number; request: Promise<Candle[]> }>();
const adjustmentCache = new Map<string, { expiresAt: number; request: Promise<Candle[]> }>();

export function fetchSinaDailyCandles(code: string) {
  const cached = dailyCache.get(code);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.request;
  }

  const request = loadSinaDailyCandles(code).catch((error) => {
    dailyCache.delete(code);
    throw error;
  });
  dailyCache.set(code, { expiresAt: Date.now() + CACHE_TTL_MS, request });
  return request;
}

export function fetchSinaAdjustedDailyCandles(code: string, adjustment: Exclude<AdjustmentMode, 'none'>) {
  const cacheKey = `${code}:${adjustment}`;
  const cached = adjustmentCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.request;

  const request = loadSinaAdjustedDailyCandles(code, adjustment).catch((error) => {
    adjustmentCache.delete(cacheKey);
    throw error;
  });
  adjustmentCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, request });
  return request;
}

export function applySinaAdjustmentFactors(
  candles: Candle[],
  factors: SinaAdjustmentFactor[],
  adjustment: Exclude<AdjustmentMode, 'none'>
) {
  const normalized = factors
    .map((item) => ({ date: item.d, factor: Number(item.f) }))
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.factor) && item.factor > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!normalized.length) return [];

  return enrichDerivedFields(candles.map((candle) => {
    const date = marketDateKey(candle.time);
    const factor = normalized.find((item) => date >= item.date)?.factor ?? normalized[normalized.length - 1].factor;
    const scale = adjustment === 'forward' ? 1 / factor : factor;
    return {
      time: candle.time,
      open: adjustedPrice(candle.open, scale),
      high: adjustedPrice(candle.high, scale),
      low: adjustedPrice(candle.low, scale),
      close: adjustedPrice(candle.close, scale),
      volume: candle.volume,
      amount: candle.amount,
      turnoverRate: candle.turnoverRate
    };
  }));
}

export function aggregateHistoricalCandles(candles: Candle[], period: 'week' | 'month') {
  const groups = new Map<string, Candle[]>();

  candles.forEach((candle) => {
    const key = period === 'month' ? monthKey(candle.time) : weekKey(candle.time);
    const group = groups.get(key) ?? [];
    group.push(candle);
    groups.set(key, group);
  });

  return enrichDerivedFields(Array.from(groups.values()).map((group) => {
    const first = group[0];
    const last = group[group.length - 1];
    const amounts = group.map((item) => item.amount).filter((value): value is number => value !== undefined);
    const turnoverRates = group.map((item) => item.turnoverRate).filter((value): value is number => value !== undefined);
    return {
      time: last.time,
      open: first.open,
      high: Math.max(...group.map((item) => item.high)),
      low: Math.min(...group.map((item) => item.low)),
      close: last.close,
      volume: group.reduce((sum, item) => sum + item.volume, 0),
      amount: amounts.length === group.length ? amounts.reduce((sum, value) => sum + value, 0) : undefined,
      turnoverRate: turnoverRates.length === group.length ? turnoverRates.reduce((sum, value) => sum + value, 0) : undefined
    };
  }));
}

async function loadSinaDailyCandles(code: string) {
  const url = new URL('https://quotes.sina.cn/cn/api/openapi.php/CN_MarketDataService.getKLineData');
  url.searchParams.set('symbol', toSinaSymbol(code));
  url.searchParams.set('scale', '240');
  url.searchParams.set('ma', 'no');
  url.searchParams.set('datalen', '1023');

  const text = await fetchMarketText(url.toString());
  if (!text) {
    return [];
  }

  const payload = JSON.parse(text) as { result?: { data?: SinaDailyRow[] } };
  return enrichDerivedFields((payload.result?.data ?? []).map(parseSinaDailyRow).filter((item): item is Candle => Boolean(item)));
}

async function loadSinaAdjustedDailyCandles(code: string, adjustment: Exclude<AdjustmentMode, 'none'>) {
  const [candles, factors] = await Promise.all([
    fetchSinaDailyCandles(code),
    fetchSinaAdjustmentFactors(code, adjustment)
  ]);
  return applySinaAdjustmentFactors(candles, factors, adjustment);
}

async function fetchSinaAdjustmentFactors(code: string, adjustment: Exclude<AdjustmentMode, 'none'>) {
  const suffix = adjustment === 'forward' ? 'qfq' : 'hfq';
  const symbol = toSinaSymbol(code);
  const text = await fetchMarketText(`https://finance.sina.com.cn/realstock/company/${symbol}/${suffix}.js`);
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return [];
  const payload = JSON.parse(json) as { data?: SinaAdjustmentFactor[] };
  return payload.data ?? [];
}

function enrichDerivedFields(candles: Candle[]) {
  return candles.map((candle, index) => {
    const previousClose = candles[index - 1]?.close;
    if (!previousClose || previousClose <= 0) return candle;
    const change = candle.close - previousClose;
    return {
      ...candle,
      change: candle.change ?? change,
      changePct: candle.changePct ?? (change / previousClose) * 100,
      amplitude: candle.amplitude ?? ((candle.high - candle.low) / previousClose) * 100
    };
  });
}

function parseSinaDailyRow(row: SinaDailyRow): Candle | null {
  const time = parseMarketDate(row.day ?? '');
  const open = Number(row.open);
  const high = Number(row.high);
  const low = Number(row.low);
  const close = Number(row.close);
  const volume = Number(row.volume);

  if (!time || ![open, high, low, close].every(Number.isFinite)) {
    return null;
  }

  return {
    time,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0
  };
}

function parseMarketDate(value: string) {
  if (!value) {
    return 0;
  }
  return Math.floor(new Date(`${value.replace(/-/g, '/')} 15:00:00`).getTime() / 1000);
}

function marketDateKey(time: number) {
  const date = new Date(time * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function adjustedPrice(price: number, scale: number) {
  return Number((price * scale).toFixed(4));
}

function monthKey(time: number) {
  const date = new Date(time * 1000);
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function weekKey(time: number) {
  const date = new Date(time * 1000);
  const dayFromMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayFromMonday);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
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
