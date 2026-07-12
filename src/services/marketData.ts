import { A_SHARE_UNIVERSE } from '@/data/universe';
import { buildSignals, summarizeIndicators } from '@/services/indicators';
import { getAshareMarketPhase } from '@/services/marketCalendar';
import type { Candle, InstrumentState, MarketDataProvider, MarketPhase, MarketSnapshotListener, Quote, StockMeta, Timeframe } from '@/types/market';

const FRAME_SECONDS: Record<Timeframe, number> = {
  fs: 60,
  '1d': 86_400,
  '1w': 7 * 86_400,
  '1mo': 30 * 86_400
};

const FRAME_POINTS: Record<Timeframe, number> = {
  fs: 180,
  '1d': 120,
  '1w': 120,
  '1mo': 100
};

export class SimulatedAshareProvider implements MarketDataProvider {
  private states = new Map<string, InstrumentState>();
  private listeners = new Set<MarketSnapshotListener>();
  private timer: number | undefined;
  private tick = 0;

  constructor(private readonly universe: StockMeta[] = A_SHARE_UNIVERSE) {
    this.universe.forEach((meta) => {
      const candles = {
        fs: generateHistory(meta, 'fs'),
        '1d': generateHistory(meta, '1d'),
        '1w': generateHistory(meta, '1w'),
        '1mo': generateHistory(meta, '1mo')
      };
      const quote = buildQuote(meta, candles['1d'], 0);
      const indicators = summarizeIndicators(candles['1d']);
      const signals = buildSignals(quote, candles['1d'], indicators);

      this.states.set(meta.code, {
        meta,
        quote,
        candles,
        indicators,
        signals
      });
    });
  }

  start() {
    if (this.timer) {
      return;
    }

    this.timer = window.setInterval(() => {
      this.advance();
      this.emit();
    }, 1100);
    this.emit();
  }

  stop() {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  getSnapshot() {
    return Array.from(this.states.values()).map(cloneState);
  }

  getMarketPhase(): MarketPhase {
    return getAshareMarketPhase();
  }

  subscribe(listener: MarketSnapshotListener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  private advance() {
    this.tick += 1;
    const sectorPulse = getSectorPulse(this.tick);

    this.states.forEach((state) => {
      const pulse = sectorPulse[state.meta.sector] ?? 0;
      const lastPrice = state.quote.price;
      const previousPrice = state.quote.price;
      const betaNoise = randomBetween(-0.18, 0.18) * state.meta.beta;
      const stylePulse = getStylePulse(state.meta.style, this.tick);
      const drift = (pulse + betaNoise + stylePulse) / 100;
      const limitHigh = state.quote.prevClose * 1.099;
      const limitLow = state.quote.prevClose * 0.901;
      const nextPrice = roundPrice(clamp(lastPrice * (1 + drift), limitLow, limitHigh));
      const deltaVolume = Math.round(randomBetween(8_000, 98_000) * state.meta.beta * (1 + Math.abs(drift) * 32));

      updateCandles(state.candles.fs, nextPrice, deltaVolume, this.tick % 10 === 0, FRAME_SECONDS.fs);
      updateCandles(state.candles['1d'], nextPrice, deltaVolume * 8, false, FRAME_SECONDS['1d']);
      updateCandles(state.candles['1w'], nextPrice, deltaVolume * 32, false, FRAME_SECONDS['1w']);
      updateCandles(state.candles['1mo'], nextPrice, deltaVolume * 96, false, FRAME_SECONDS['1mo']);

      state.quote = buildQuote(state.meta, state.candles['1d'], nextPrice - previousPrice);
      state.indicators = summarizeIndicators(state.candles['1d']);
      state.signals = buildSignals(state.quote, state.candles['1d'], state.indicators);
    });
  }

  private emit() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

function generateHistory(meta: StockMeta, timeframe: Timeframe): Candle[] {
  const points = FRAME_POINTS[timeframe];
  const step = FRAME_SECONDS[timeframe];
  const now = Math.floor(Date.now() / 1000);
  const candles: Candle[] = [];
  let close = meta.basePrice * randomBetween(0.975, 1.025);
  let trend = randomBetween(-0.002, 0.003);

  for (let index = 0; index < points; index += 1) {
    if (index % 36 === 0) {
      trend = randomBetween(-0.002, 0.003);
    }

    const open = close;
    const move = trend + randomBetween(-0.006, 0.006) * meta.beta;
    close = clamp(open * (1 + move), meta.basePrice * 0.72, meta.basePrice * 1.28);
    const high = Math.max(open, close) * (1 + randomBetween(0.0005, 0.008));
    const low = Math.min(open, close) * (1 - randomBetween(0.0005, 0.008));
    const volumeScale = timeframe === '1mo' ? 320 : timeframe === '1w' ? 80 : timeframe === '1d' ? 18 : 1;
    const volume = Math.round(randomBetween(40_000, 260_000) * meta.beta * volumeScale);

    candles.push({
      time: now - (points - index) * step,
      open: roundPrice(open),
      high: roundPrice(high),
      low: roundPrice(low),
      close: roundPrice(close),
      volume,
      average: roundPrice(candles.length ? (candles[candles.length - 1].close + close) / 2 : close)
    });
  }

  return candles;
}

function buildQuote(meta: StockMeta, candles: Candle[], priceDelta: number): Quote {
  const latest = candles[candles.length - 1];
  const first = candles[0];
  const prevClose = candles[Math.max(candles.length - 120, 0)].open;
  const price = latest.close;
  const change = price - prevClose;
  const changePct = (change / prevClose) * 100;
  const volume = candles.slice(-120).reduce((sum, candle) => sum + candle.volume, 0);
  const amount = volume * price * 100;
  const high = Math.max(...candles.slice(-120).map((candle) => candle.high));
  const low = Math.min(...candles.slice(-120).map((candle) => candle.low));

  return {
    code: meta.code,
    name: meta.name,
    market: meta.market,
    sector: meta.sector,
    price,
    prevClose,
    open: first.open,
    high,
    low,
    change,
    changePct,
    volume,
    amount,
    turnoverRate: clamp((volume * price * 100) / (meta.floatMarketCap * 100_000_000) * 100, 0.05, 18),
    amplitude: ((high - low) / prevClose) * 100,
    speed: (priceDelta / Math.max(price - priceDelta, 0.01)) * 100,
    bid: buildOrderLevels(price, 'bid', meta.beta),
    ask: buildOrderLevels(price, 'ask', meta.beta),
    updatedAt: Date.now()
  };
}

function updateCandles(candles: Candle[], price: number, volume: number, shouldPush: boolean, step: number) {
  if (shouldPush) {
    const latest = candles[candles.length - 1];
    candles.push({
      time: latest.time + step,
      open: latest.close,
      high: Math.max(latest.close, price),
      low: Math.min(latest.close, price),
      close: price,
      volume,
      average: price
    });
    candles.shift();
    return;
  }

  const latest = candles[candles.length - 1];
  latest.high = Math.max(latest.high, price);
  latest.low = Math.min(latest.low, price);
  latest.close = price;
  latest.average = latest.average ? roundPrice((latest.average + price) / 2) : price;
  latest.volume += Math.round(volume);
}

function buildOrderLevels(price: number, side: 'bid' | 'ask', beta: number) {
  return Array.from({ length: 5 }, (_, index) => {
    const offset = (index + 1) * randomBetween(0.0006, 0.0014);
    const levelPrice = side === 'bid' ? price * (1 - offset) : price * (1 + offset);

    return {
      price: roundPrice(levelPrice),
      volume: Math.round(randomBetween(900, 7800) * beta)
    };
  });
}

function getSectorPulse(tick: number) {
  const sectors = ['白酒', '新能源', '保险', '银行', '汽车', '光伏', '券商', '半导体', '医药', '互联网金融', '家电', '电力', '有色', '消费电子'];

  return sectors.reduce<Record<string, number>>((acc, sector, index) => {
    acc[sector] = Math.sin((tick + index * 11) / 22) * 0.045 + randomBetween(-0.018, 0.018);
    return acc;
  }, {});
}

function getStylePulse(style: StockMeta['style'], tick: number) {
  const phase = {
    core: 0,
    growth: 9,
    cyclical: 17,
    broker: 25,
    defense: 33
  }[style];

  return Math.cos((tick + phase) / 18) * 0.035;
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

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundPrice(value: number) {
  return Number(value.toFixed(value >= 1000 ? 2 : 3));
}
