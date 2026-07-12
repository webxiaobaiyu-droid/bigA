export type NewsSourceKey = 'eastmoney' | 'netease' | 'rsshub';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: NewsSourceKey;
  sourceLabel: string;
  channel: string;
  publishedAt: number | null;
  url: string;
  tags: string[];
}

export interface NewsFeedResult {
  items: NewsItem[];
  sourceLabels: string[];
  failedLabels: string[];
  fetchedAt: number;
}
