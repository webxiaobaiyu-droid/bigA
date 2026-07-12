import type { StockMeta } from '@/types/market';

export interface WatchGroup {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: number;
}

export interface WatchEntry {
  code: string;
  groupId: string;
  tags: string[];
  order: number;
  addedAt: number;
}

export interface WatchlistOrganization {
  version: 2;
  groups: WatchGroup[];
  entries: WatchEntry[];
}

export interface WatchlistImportRow {
  meta: StockMeta;
  groupName: string;
  tags: string[];
}

export interface WatchlistImportReport {
  rows: WatchlistImportRow[];
  rejected: number;
}

export interface WatchlistExportPayload {
  version: 2;
  exportedAt: number;
  groups: WatchGroup[];
  items: Array<{ meta: StockMeta; groupId: string; tags: string[]; order: number }>;
}
