import { computed, onScopeDispose, ref, watch, type ComputedRef } from 'vue';
import { searchAshareStocks } from '@/services/stockSearch';
import type { StockMeta } from '@/types/market';

const DEFAULT_SEARCH_DELAY = 220;
const MAX_CANDIDATES = 8;

export function useStockSearch(excludedCodes: ComputedRef<string[]>, delay = DEFAULT_SEARCH_DELAY) {
  const query = ref('');
  const searchResults = ref<StockMeta[]>([]);
  const searchLoading = ref(false);
  const searchError = ref('');
  const candidateRows = computed(() => searchResults.value
    .filter((item) => !excludedCodes.value.includes(item.code))
    .slice(0, MAX_CANDIDATES));

  let searchTimer: number | undefined;
  let searchRequestId = 0;

  function cancelPendingSearch() {
    searchRequestId += 1;
    if (searchTimer !== undefined) {
      window.clearTimeout(searchTimer);
      searchTimer = undefined;
    }
  }

  function clear() {
    cancelPendingSearch();
    query.value = '';
    searchResults.value = [];
    searchLoading.value = false;
    searchError.value = '';
  }

  watch(query, (value) => {
    if (searchTimer !== undefined) {
      window.clearTimeout(searchTimer);
      searchTimer = undefined;
    }

    const keyword = value.trim();
    const requestId = ++searchRequestId;
    searchResults.value = [];
    searchError.value = '';

    if (!keyword) {
      searchLoading.value = false;
      return;
    }

    searchLoading.value = true;
    searchTimer = window.setTimeout(async () => {
      searchTimer = undefined;
      try {
        const rows = await searchAshareStocks(keyword);
        if (requestId === searchRequestId) {
          searchResults.value = rows;
        }
      } catch {
        if (requestId === searchRequestId) {
          searchError.value = '查询接口暂不可用';
        }
      } finally {
        if (requestId === searchRequestId) {
          searchLoading.value = false;
        }
      }
    }, Math.max(0, delay));
  });

  onScopeDispose(cancelPendingSearch);

  return {
    query,
    searchResults,
    searchLoading,
    searchError,
    candidateRows,
    clear
  };
}
