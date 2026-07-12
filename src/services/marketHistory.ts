import type {
  FundFlowHistoryPoint,
  MarketFundFlowSnapshot,
  MarketSentimentSnapshot,
  SectorRotationRow,
  SentimentHistoryPoint
} from '@/types/marketMonitor';

export const SENTIMENT_HISTORY_STORAGE_KEY = 'biga.market-sentiment-history.v1';
export const FUND_FLOW_HISTORY_STORAGE_KEY = 'biga.market-fund-flow-history.v1';
const SNAPSHOT_BUCKET_MS = 5 * 60_000;

export function sentimentHistoryPoint(snapshot: MarketSentimentSnapshot): SentimentHistoryPoint {
  const total = Math.max(snapshot.total, 1);
  const indexChange = snapshot.indices.length
    ? snapshot.indices.reduce((sum, row) => sum + row.changePct, 0) / snapshot.indices.length
    : 0;
  return {
    id: historyId(snapshot.tradeDate, snapshot.updatedAt),
    tradeDate: snapshot.tradeDate,
    updatedAt: snapshot.updatedAt,
    score: snapshot.score,
    label: snapshot.label,
    upRatio: (snapshot.up / total) * 100,
    downRatio: (snapshot.down / total) * 100,
    limitUp: snapshot.limitUp,
    limitDown: snapshot.limitDown,
    brokenLimit: snapshot.brokenLimit,
    sealRate: snapshot.sealRate,
    maxStreak: snapshot.maxStreak,
    indexChange
  };
}

export function fundFlowHistoryPoint(snapshot: MarketFundFlowSnapshot): FundFlowHistoryPoint {
  return {
    id: historyId(snapshot.tradeDate, snapshot.updatedAt),
    tradeDate: snapshot.tradeDate,
    updatedAt: snapshot.updatedAt,
    sectors: snapshot.sectors.map(({ code, name, changePct, netAmount, netRatio }) => ({ code, name, changePct, netAmount, netRatio }))
  };
}

export function appendSentimentHistory(history: readonly SentimentHistoryPoint[], snapshot: MarketSentimentSnapshot, maxPoints = 1_200) {
  return upsertHistory(history, sentimentHistoryPoint(snapshot), maxPoints);
}

export function appendFundFlowHistory(history: readonly FundFlowHistoryPoint[], snapshot: MarketFundFlowSnapshot, maxPoints = 720) {
  return upsertHistory(history, fundFlowHistoryPoint(snapshot), maxPoints);
}

export function analyzeSectorRotation(history: readonly FundFlowHistoryPoint[], snapshot?: MarketFundFlowSnapshot | null): SectorRotationRow[] {
  const points = snapshot ? appendFundFlowHistory(history, snapshot) : [...history];
  const latest = points[points.length - 1];
  if (!latest) return [];
  const previous = points[points.length - 2];
  const previousByCode = new Map(previous?.sectors.map((row) => [row.code, row]) ?? []);
  const latestRank = rankByNet(latest.sectors);
  const previousRank = rankByNet(previous?.sectors ?? []);
  const dailyPoints = latestByTradeDate(points);

  return latest.sectors.map((row): SectorRotationRow => {
    const prior = previousByCode.get(row.code);
    const momentum = row.netAmount - (prior?.netAmount ?? row.netAmount);
    const recentNetAmount = points.slice(-5).reduce((sum, point) => sum + (point.sectors.find((item) => item.code === row.code)?.netAmount ?? 0), 0);
    const signs = [...dailyPoints].reverse().map((point) => point.sectors.find((item) => item.code === row.code)?.netAmount ?? 0);
    const inflowStreakDays = countLeading(signs, (value) => value > 0);
    const outflowStreakDays = countLeading(signs, (value) => value < 0);
    const rankChange = previousRank.has(row.code) ? (previousRank.get(row.code) ?? 0) - (latestRank.get(row.code) ?? 0) : 0;
    return {
      ...row,
      inflowStreakDays,
      outflowStreakDays,
      recentNetAmount,
      momentum,
      rankChange,
      state: rotationState(row.netAmount, momentum, prior?.netAmount)
    };
  }).sort((a, b) => rotationScore(b) - rotationScore(a));
}

export function loadHistory<T>(key: string): T[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

export function saveHistory<T>(key: string, history: readonly T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(history));
  } catch {
    // Monitoring continues in memory when renderer storage is unavailable.
  }
}

function upsertHistory<T extends { id: string; updatedAt: number }>(history: readonly T[], point: T, maxPoints: number) {
  const next = history.filter((item) => item.id !== point.id);
  next.push(point);
  return next.sort((a, b) => a.updatedAt - b.updatedAt).slice(-maxPoints);
}

function historyId(tradeDate: string, updatedAt: number) {
  return `${tradeDate}:${Math.floor(updatedAt / SNAPSHOT_BUCKET_MS)}`;
}

function latestByTradeDate(points: readonly FundFlowHistoryPoint[]) {
  const byDate = new Map<string, FundFlowHistoryPoint>();
  points.forEach((point) => byDate.set(point.tradeDate, point));
  return [...byDate.values()].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
}

function rankByNet(rows: readonly { code: string; netAmount: number }[]) {
  return new Map([...rows].sort((a, b) => b.netAmount - a.netAmount).map((row, index) => [row.code, index + 1]));
}

function countLeading(values: readonly number[], predicate: (value: number) => boolean) {
  let count = 0;
  for (const value of values) {
    if (!predicate(value)) break;
    count += 1;
  }
  return count;
}

function rotationState(netAmount: number, momentum: number, previousNet?: number): SectorRotationRow['state'] {
  if (netAmount > 0 && (previousNet ?? 0) <= 0) return 'entering';
  if (netAmount < 0 && (previousNet ?? 0) >= 0) return 'leaving';
  if (netAmount > 0 && momentum > 0) return 'strengthening';
  if ((netAmount > 0 && momentum < 0) || (netAmount < 0 && momentum > 0)) return 'weakening';
  return 'neutral';
}

function rotationScore(row: SectorRotationRow) {
  const direction = row.netAmount >= 0 ? 1 : -1;
  return direction * Math.log10(Math.abs(row.netAmount) + 1) * 10 + row.inflowStreakDays * 8 + row.rankChange * 1.5 + Math.sign(row.momentum) * 3;
}
