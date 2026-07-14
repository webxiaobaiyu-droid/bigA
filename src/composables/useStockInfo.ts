import { computed, ref, watch, type ComputedRef } from 'vue';
import { STOCK_INFO_TABS } from '@/constants/marketOptions';
import {
  fetchStockAnnouncements,
  fetchStockCompanyProfile,
  fetchStockFinancials,
  fetchStockNews
} from '@/services/stockInfoProvider';
import type { InstrumentState } from '@/types/market';
import type { NewsItem } from '@/types/news';
import type { StockAnnouncement, StockCompanyProfile, StockFinancialReport } from '@/types/stockInfo';
import type { StockInfoTab } from '@/types/workspace';

export function useStockInfo(selected: ComputedRef<InstrumentState | null>) {
  const stockInfoTab = ref<StockInfoTab>('news');
  const stockNewsCache = ref<Record<string, NewsItem[]>>({});
  const stockFinancialCache = ref<Record<string, StockFinancialReport[]>>({});
  const stockCompanyCache = ref<Record<string, StockCompanyProfile | null>>({});
  const stockAnnouncementCache = ref<Record<string, StockAnnouncement[]>>({});
  const stockInfoErrors = ref<Record<string, string>>({});
  const stockInfoLoadingKey = ref('');

  const selectedStockNews = computed(() => (selected.value ? stockNewsCache.value[selected.value.meta.code] ?? [] : []));
  const selectedFinancialReports = computed(() => (selected.value ? stockFinancialCache.value[selected.value.meta.code] ?? [] : []));
  const selectedCompanyProfile = computed(() => (selected.value ? stockCompanyCache.value[selected.value.meta.code] ?? null : null));
  const selectedAnnouncements = computed(() => (selected.value ? stockAnnouncementCache.value[selected.value.meta.code] ?? [] : []));
  const selectedStockInfoKey = computed(() => (selected.value ? stockInfoCacheKey(selected.value.meta.code, stockInfoTab.value) : ''));
  const selectedStockInfoLoading = computed(() => Boolean(selectedStockInfoKey.value && stockInfoLoadingKey.value === selectedStockInfoKey.value));
  const selectedStockInfoError = computed(() => stockInfoErrors.value[selectedStockInfoKey.value] ?? '');
  const stockInfoTabLabel = computed(() => STOCK_INFO_TABS.find((item) => item.key === stockInfoTab.value)?.label ?? '个股资料');
  const selectedStockInfoHasData = computed(() => Boolean(selected.value && hasStockInfoCache(selected.value.meta.code, stockInfoTab.value)));

  watch(
    () => [selected.value?.meta.code ?? '', stockInfoTab.value] as const,
    ([code]) => {
      if (code) {
        void loadSelectedStockInfo();
      }
    },
    { immediate: true }
  );

  async function loadSelectedStockInfo(force = false) {
    const row = selected.value;
    if (!row) {
      return;
    }

    const { meta } = row;
    const tab = stockInfoTab.value;
    const key = stockInfoCacheKey(meta.code, tab);
    if ((!force && hasStockInfoCache(meta.code, tab)) || stockInfoLoadingKey.value === key) {
      return;
    }

    stockInfoLoadingKey.value = key;
    const nextErrors = { ...stockInfoErrors.value };
    delete nextErrors[key];
    stockInfoErrors.value = nextErrors;

    try {
      if (tab === 'news') {
        stockNewsCache.value = { ...stockNewsCache.value, [meta.code]: await fetchStockNews(meta) };
      } else if (tab === 'finance') {
        stockFinancialCache.value = { ...stockFinancialCache.value, [meta.code]: await fetchStockFinancials(meta) };
      } else if (tab === 'company') {
        stockCompanyCache.value = { ...stockCompanyCache.value, [meta.code]: await fetchStockCompanyProfile(meta) };
      } else {
        stockAnnouncementCache.value = { ...stockAnnouncementCache.value, [meta.code]: await fetchStockAnnouncements(meta) };
      }
    } catch {
      const label = STOCK_INFO_TABS.find((item) => item.key === tab)?.label ?? '个股资料';
      stockInfoErrors.value = { ...stockInfoErrors.value, [key]: `${label}接口暂不可用` };
    } finally {
      if (stockInfoLoadingKey.value === key) {
        stockInfoLoadingKey.value = '';
      }
    }
  }

  function hasStockInfoCache(code: string, tab: StockInfoTab) {
    const cache = tab === 'news'
      ? stockNewsCache.value
      : tab === 'finance'
        ? stockFinancialCache.value
        : tab === 'company'
          ? stockCompanyCache.value
          : stockAnnouncementCache.value;
    return Object.prototype.hasOwnProperty.call(cache, code);
  }

  function stockInfoCacheKey(code: string, tab: StockInfoTab) {
    return `${code}:${tab}`;
  }

  return {
    stockInfoTab,
    stockNewsCache,
    stockFinancialCache,
    stockCompanyCache,
    stockAnnouncementCache,
    stockInfoErrors,
    stockInfoLoadingKey,
    selectedStockNews,
    selectedFinancialReports,
    selectedCompanyProfile,
    selectedAnnouncements,
    selectedStockInfoKey,
    selectedStockInfoLoading,
    selectedStockInfoError,
    stockInfoTabLabel,
    selectedStockInfoHasData,
    loadSelectedStockInfo,
    hasStockInfoCache,
    stockInfoCacheKey
  };
}
