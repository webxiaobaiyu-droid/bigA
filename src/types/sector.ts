export type SectorMode = 'industry' | 'concept';
export type SectorSortKey = 'change' | 'money' | 'breadth';
export type HotStockSortKey = 'hot' | 'change' | 'amount' | 'turnover';

export interface SectorRow {
  code: string;
  name: string;
  mode: SectorMode;
  source: 'eastmoney' | 'sina';
  price: number;
  change: number;
  changePct: number;
  volume: number;
  amount: number;
  turnoverRate: number;
  marketCap: number;
  mainNetInflow: number;
  mainNetInflowPct: number;
  speed: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  leaderName: string;
  leaderCode: string;
  leaderChangePct: number;
  secondLeaderName: string;
  secondLeaderCode: string;
  /** Supplier-provided quote time. Zero means the source did not provide one. */
  updatedAt: number;
  /** Time at which BigA completed this request. */
  fetchedAt: number;
}

export interface HotStockRow {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  amplitude: number;
  volume: number;
  amount: number;
  turnoverRate: number;
  pe: number;
  volumeRatio: number;
  marketCap: number;
  floatMarketCap: number;
  mainNetInflow: number;
  mainNetInflowPct: number;
  speed: number;
  /** Supplier-provided quote time. Zero means the source did not provide one. */
  updatedAt: number;
  /** Time at which BigA completed this request. */
  fetchedAt: number;
}
