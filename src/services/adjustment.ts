import type { AdjustmentMode, Timeframe } from '@/types/market';

export function adjustmentQueryValue(mode: AdjustmentMode) {
  if (mode === 'none') return '0';
  if (mode === 'backward') return '2';
  return '1';
}

export function effectiveAdjustment(timeframe: Timeframe, mode: AdjustmentMode): AdjustmentMode {
  return timeframe === 'fs' ? 'forward' : mode;
}

export function candleVariantKey(timeframe: Timeframe, mode: AdjustmentMode) {
  return `${timeframe}:${effectiveAdjustment(timeframe, mode)}`;
}
