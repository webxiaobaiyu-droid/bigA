import type { HotStockRow, SectorRow, SectorSortKey } from '@/types/sector';

export type HotSectorSortKey = 'heat' | SectorSortKey;

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function sectorBreadthRatio(row: SectorRow) {
  const total = row.upCount + row.downCount + row.flatCount;
  return row.upCount + row.downCount > 0 && total > 0 ? row.upCount / total : null;
}

export function sectorBreadthText(row: SectorRow) {
  const ratio = sectorBreadthRatio(row);
  return ratio === null ? `${row.flatCount || '--'}只` : `${(ratio * 100).toFixed(0)}%`;
}

export function sectorHeatScore(row: SectorRow, maxSectorFlow: number, maxSectorAmount: number) {
  const normalizedMaxFlow = Math.max(maxSectorFlow, 1);
  const normalizedMaxAmount = Math.max(maxSectorAmount, 1);
  const momentum = clampNumber((row.changePct + 1) * 11, 0, 45);
  const breadth = sectorBreadthRatio(row);
  const breadthScore = breadth === null ? clampNumber((row.changePct + 2) * 3, 0, 15) : breadth * 20;
  const flowScore = row.source === 'eastmoney'
    ? clampNumber(Math.max(0, row.mainNetInflow) / normalizedMaxFlow * 20, 0, 20)
    : clampNumber(row.amount / normalizedMaxAmount * 10, 0, 10);
  const leaderScore = clampNumber(Math.max(0, row.leaderChangePct) * 1.5, 0, 15);
  const speedScore = clampNumber(Math.max(0, row.speed) * 10, 0, 10);
  return Math.round(momentum + breadthScore + flowScore + leaderScore + speedScore);
}

export function sectorHeatLabel(row: SectorRow, maxSectorFlow: number, maxSectorAmount: number) {
  const score = sectorHeatScore(row, maxSectorFlow, maxSectorAmount);
  if (score >= 75) return '主线';
  if (score >= 60) return '强势';
  if (score >= 45) return '活跃';
  return '观察';
}

export function sectorPulseLabel(row: SectorRow) {
  const breadth = sectorBreadthRatio(row);
  if (breadth !== null && breadth >= 0.7) return '全面扩散';
  if (row.source === 'eastmoney' && row.mainNetInflow > 0) return '资金流入';
  if (row.changePct >= 2) return '涨幅异动';
  return row.changePct >= 0 ? '局部活跃' : '弱势整理';
}

export function sortSectorRows(rows: SectorRow[], sort: SectorSortKey) {
  return [...rows].sort((a, b) => {
    if (sort === 'money') {
      const aValue = a.source === 'eastmoney' ? a.mainNetInflow : a.amount;
      const bValue = b.source === 'eastmoney' ? b.mainNetInflow : b.amount;
      return bValue - aValue;
    }
    if (sort === 'breadth') {
      return (sectorBreadthRatio(b) ?? b.changePct / 100) - (sectorBreadthRatio(a) ?? a.changePct / 100);
    }
    return b.changePct - a.changePct;
  });
}

export function sortHotSectorRows(
  rows: SectorRow[],
  sort: HotSectorSortKey,
  maxSectorFlow: number,
  maxSectorAmount: number
) {
  if (sort === 'heat') {
    return [...rows].sort(
      (a, b) => sectorHeatScore(b, maxSectorFlow, maxSectorAmount) - sectorHeatScore(a, maxSectorFlow, maxSectorAmount)
    );
  }
  return sortSectorRows(rows, sort);
}

export function hotStockHeatScore(row: HotStockRow, maxHotStockAmount: number) {
  const normalizedMaxAmount = Math.max(maxHotStockAmount, 1);
  const momentum = clampNumber(Math.max(0, row.changePct) * 4.5, 0, 45);
  const turnover = clampNumber(row.turnoverRate / 20 * 25, 0, 25);
  const amount = normalizedMaxAmount > 1
    ? clampNumber(Math.log1p(row.amount) / Math.log1p(normalizedMaxAmount) * 15, 0, 15)
    : 0;
  const volume = clampNumber(row.volumeRatio / 5 * 10, 0, 10);
  const speed = clampNumber(Math.max(0, row.speed) * 10, 0, 5);
  return Math.round(momentum + turnover + amount + volume + speed);
}

export function hotStockHeatLabel(row: HotStockRow, maxHotStockAmount: number) {
  const score = hotStockHeatScore(row, maxHotStockAmount);
  if (score >= 75) return '高热';
  if (score >= 55) return '活跃';
  return '观察';
}
