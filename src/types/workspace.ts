import type { NewsSourceKey } from '@/types/news';

export type WorkspaceTab = 'news' | 'sectors' | 'hotSectors' | 'hotStocks' | 'knowledge' | 'watchlist';

export type NewsFilterKey = 'all' | NewsSourceKey;

export type WatchSortKey = 'custom' | 'signal' | 'change' | 'speed';

export type IndicatorTab = 'trend' | 'macd' | 'risk';

export type StockInfoTab = 'news' | 'finance' | 'company' | 'announcements';
