export type Timeframe = 'fs' | '1d' | '1w' | '1mo';
export type AdjustmentMode = 'none' | 'forward' | 'backward';

export type MarketPhaseType = 'preopen' | 'auction' | 'trading' | 'noon' | 'closed';

export interface StockMeta {
  code: string;
  name: string;
  market: 'SH' | 'SZ' | 'BJ';
  sector: string;
  basePrice: number;
  floatMarketCap: number;
  pe: number;
  beta: number;
  style: 'core' | 'growth' | 'cyclical' | 'broker' | 'defense';
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  average?: number;
  amount?: number;
  change?: number;
  changePct?: number;
  amplitude?: number;
  turnoverRate?: number;
}

export interface ChartMarker {
  time: number;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text: string;
  size?: number;
}

export interface ChartGuide {
  price: number;
  color: string;
  title: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  axisLabelVisible?: boolean;
}

export interface OrderLevel {
  price: number;
  volume: number;
}

export interface Quote {
  code: string;
  name: string;
  market: StockMeta['market'];
  sector: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  volume: number;
  amount: number;
  turnoverRate: number;
  amplitude: number;
  speed: number;
  bid: OrderLevel[];
  ask: OrderLevel[];
  updatedAt: number;
}

export interface Signal {
  id: string;
  label: string;
  detail: string;
  tone: 'hot' | 'watch' | 'calm';
  active: boolean;
  weight: number;
}

export interface IndicatorSummary {
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  rsi6: number | null;
  dif: number | null;
  dea: number | null;
  macd: number | null;
  volumeRatio: number | null;
  trendLabel: string;
}

export interface InstrumentState {
  meta: StockMeta;
  quote: Quote;
  candles: Record<Timeframe, Candle[]>;
  indicators: IndicatorSummary;
  signals: Signal[];
}

export interface MarketPhase {
  type: MarketPhaseType;
  label: string;
  shortLabel: string;
  tradeDate: string;
  isTradingDay: boolean;
  calendarConfidence: 'configured' | 'weekday-only';
  reason: string;
  nextTransitionAt?: number;
  nextTradeDate?: string;
}

export type MarketSnapshotListener = (rows: InstrumentState[]) => void;

export interface MarketDataProvider {
  start(): void;
  stop(): void;
  getSnapshot(): InstrumentState[];
  getMarketPhase(): MarketPhase;
  subscribe(listener: MarketSnapshotListener): () => void;
}
