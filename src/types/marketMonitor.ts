export type MarketMonitorView = 'sentiment' | 'dragonTiger' | 'fundFlow';

export interface MarketIndexSnapshot {
  code: string;
  name: string;
  price: number;
  changePct: number;
  amount: number;
}

export interface LimitPoolStock {
  code: string;
  name: string;
  changePct: number;
  amount: number;
  turnoverRate: number;
  sector: string;
  streak: number;
  firstLimitTime: string;
  brokenCount: number;
}

export interface MarketSentimentSnapshot {
  tradeDate: string;
  updatedAt: number;
  total: number;
  up: number;
  down: number;
  flat: number;
  limitUp: number;
  limitDown: number;
  brokenLimit: number;
  sealRate: number;
  maxStreak: number;
  score: number;
  label: string;
  indices: MarketIndexSnapshot[];
  leaders: LimitPoolStock[];
}

export interface DragonTigerRow {
  code: string;
  name: string;
  tradeDate: string;
  price: number;
  changePct: number;
  turnoverRate: number;
  buyAmount: number;
  sellAmount: number;
  netAmount: number;
  dealAmount: number;
  dealRatio: number;
  reason: string;
  seatInsight: string;
}

export interface DragonTigerSnapshot {
  tradeDate: string;
  updatedAt: number;
  rows: DragonTigerRow[];
}

export type DragonTigerSeatType = 'institution' | 'northbound' | 'hotMoney' | 'branch';

export interface DragonTigerSeatRow {
  code: string;
  tradeDate: string;
  seatCode: string;
  seatName: string;
  seatType: DragonTigerSeatType;
  seatLabel: string;
  buyAmount: number;
  sellAmount: number;
  netAmount: number;
  marketAmount: number;
  reason: string;
  successRate: number | null;
  recentTimes: number | null;
}

export interface DragonTigerSeatHistory {
  code: string;
  updatedAt: number;
  rows: DragonTigerSeatRow[];
}

export interface IntradayTradeTick {
  time: number;
  price: number;
  volume: number;
  amount: number;
  tradeCount: number;
  side: 'buy' | 'sell' | 'neutral';
}

export interface MarketFundFlowSnapshot {
  tradeDate: string;
  updatedAt: number;
  sectors: CapitalFlowSector[];
  stocks: CapitalFlowStock[];
}

export interface SentimentHistoryPoint {
  id: string;
  tradeDate: string;
  updatedAt: number;
  score: number;
  label: string;
  upRatio: number;
  downRatio: number;
  limitUp: number;
  limitDown: number;
  brokenLimit: number;
  sealRate: number;
  maxStreak: number;
  indexChange: number;
}

export interface FundFlowSectorPoint {
  code: string;
  name: string;
  changePct: number;
  netAmount: number;
  netRatio: number;
}

export interface FundFlowHistoryPoint {
  id: string;
  tradeDate: string;
  updatedAt: number;
  sectors: FundFlowSectorPoint[];
}

export interface SectorRotationRow extends FundFlowSectorPoint {
  inflowStreakDays: number;
  outflowStreakDays: number;
  recentNetAmount: number;
  momentum: number;
  rankChange: number;
  state: 'entering' | 'strengthening' | 'weakening' | 'leaving' | 'neutral';
}

export interface CapitalFlowSector {
  code: string;
  name: string;
  changePct: number;
  inflow: number;
  outflow: number;
  netAmount: number;
  netRatio: number;
  leaderCode: string;
  leaderName: string;
}

export interface CapitalFlowStock {
  code: string;
  name: string;
  price: number;
  changePct: number;
  turnoverRate: number;
  amount: number;
  inflow: number;
  outflow: number;
  netAmount: number;
  netRatio: number;
}

export interface MonitorStockReference {
  code: string;
  name: string;
  price: number;
  changePct: number;
  amount: number;
  turnoverRate: number;
}
