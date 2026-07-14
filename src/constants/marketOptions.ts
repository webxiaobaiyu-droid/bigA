import type { AdjustmentMode, Timeframe } from '@/types/market';
import type { StockInfoTab } from '@/types/workspace';

export const TIMEFRAME_OPTIONS: ReadonlyArray<{ key: Timeframe; label: string }> = [
  { key: 'fs', label: '分时' },
  { key: '1d', label: '日K' },
  { key: '1w', label: '周K' },
  { key: '1mo', label: '月K' }
];

export const ADJUSTMENT_OPTIONS: ReadonlyArray<{ key: AdjustmentMode; label: string }> = [
  { key: 'forward', label: '前复权' },
  { key: 'none', label: '不复权' },
  { key: 'backward', label: '后复权' }
];

export const STOCK_INFO_TABS: ReadonlyArray<{ key: StockInfoTab; label: string }> = [
  { key: 'news', label: '资讯' },
  { key: 'finance', label: '财务' },
  { key: 'company', label: '公司' },
  { key: 'announcements', label: '公告' }
];
