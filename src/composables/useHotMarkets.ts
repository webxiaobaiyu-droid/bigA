import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { candleVariantKey, effectiveAdjustment } from '@/services/adjustment';
import {
  fetchHotStockRows,
  fetchSectorConstituents,
  fetchSectorRows,
  fetchStockCandles
} from '@/services/sectorProvider';
import type { AdjustmentMode, Candle, Timeframe } from '@/types/market';
import type { HotStockRow, HotStockSortKey, SectorMode, SectorRow } from '@/types/sector';
import type { WorkspaceTab } from '@/types/workspace';
import { formatCandleDate, formatNewsTime, marketListTimeLabel } from '@/utils/marketFormatters';
import {
  hotStockHeatScore,
  sectorHeatScore,
  sortHotSectorRows,
  type HotSectorSortKey
} from '@/utils/marketRanking';

const MARKET_REFRESH_INTERVAL = 15_000;

export function useHotMarkets(activeTab: Ref<WorkspaceTab>, adjustmentMode: Ref<AdjustmentMode>) {
  const sectorRows = ref<SectorRow[]>([]);
  const hotStockRows = ref<HotStockRow[]>([]);
  const sectorMode = ref<SectorMode>('industry');
  const hotSectorSort = ref<HotSectorSortKey>('heat');
  const hotStockSort = ref<HotStockSortKey>('hot');
  const sectorLoading = ref(false);
  const sectorStatus = ref('待连接');
  const selectedSectorCode = ref('');
  const sectorConstituentCache = ref<Record<string, HotStockRow[]>>({});
  const sectorConstituentLoadingCode = ref('');
  const selectedHotStockCode = ref('');
  const hotStockTimeframe = ref<Timeframe>('fs');
  const hotStockCandleCache = ref<Record<string, Record<string, Candle[]>>>({});
  const hotStockLoadingKey = ref('');

  let refreshTimer: number | undefined;
  let marketListRequestId = 0;

  const maxSectorFlow = computed(() => Math.max(...sectorRows.value.map((row) => Math.abs(row.mainNetInflow)), 1));
  const maxSectorAmount = computed(() => Math.max(...sectorRows.value.map((row) => row.amount), 1));
  const hotSectorRows = computed(() => sortHotSectorRows(
    sectorRows.value,
    hotSectorSort.value,
    maxSectorFlow.value,
    maxSectorAmount.value
  ));
  const activeSectorRows = computed(() => hotSectorRows.value);
  const selectedSector = computed(() => activeSectorRows.value.find((row) => row.code === selectedSectorCode.value) ?? activeSectorRows.value[0] ?? null);
  const selectedSectorConstituents = computed(() => selectedSector.value
    ? sectorConstituentCache.value[selectedSector.value.code] ?? []
    : []);
  const selectedSectorConstituentsLoading = computed(() => Boolean(
    selectedSector.value && sectorConstituentLoadingCode.value === selectedSector.value.code
  ));
  const selectedHotStock = computed(() => findHotStock(selectedHotStockCode.value) ?? null);
  const selectedHotStockCandles = computed(() => {
    if (!selectedHotStock.value) return [];
    const adjustment = effectiveAdjustment(hotStockTimeframe.value, adjustmentMode.value);
    return hotStockCandleCache.value[selectedHotStock.value.code]?.[
      candleVariantKey(hotStockTimeframe.value, adjustment)
    ] ?? [];
  });
  const hotStockCandlesLoading = computed(() => {
    if (!selectedHotStock.value) return false;
    const adjustment = effectiveAdjustment(hotStockTimeframe.value, adjustmentMode.value);
    return hotStockLoadingKey.value === hotStockCacheKey(
      selectedHotStock.value.code,
      hotStockTimeframe.value,
      adjustment
    );
  });
  const selectedHotStockAverage = computed(() => {
    const intraday = selectedHotStock.value
      ? hotStockCandleCache.value[selectedHotStock.value.code]?.[candleVariantKey('fs', 'forward')] ?? []
      : [];
    const latest = intraday[intraday.length - 1];
    if (latest?.average !== undefined) return latest.average;
    if (!intraday.length) return null;

    return intraday.reduce((sum, candle) => sum + candle.close, 0) / intraday.length;
  });
  const selectedHotStockUpdatedLabel = computed(() => {
    const latest = selectedHotStockCandles.value[selectedHotStockCandles.value.length - 1];
    if (!latest) return hotStockCandlesLoading.value ? '同步中' : '待同步';
    return hotStockTimeframe.value === 'fs'
      ? formatNewsTime(latest.time * 1000)
      : formatCandleDate(latest.time);
  });
  const maxHotStockAmount = computed(() => Math.max(...hotStockRows.value.map((row) => row.amount), 1));
  const displayHotStockRows = computed(() => {
    const rows = [...hotStockRows.value];
    if (hotStockSort.value === 'hot') {
      return rows.sort(
        (a, b) => hotStockHeatScore(b, maxHotStockAmount.value) - hotStockHeatScore(a, maxHotStockAmount.value)
      );
    }
    if (hotStockSort.value === 'change') return rows.sort((a, b) => b.changePct - a.changePct);
    if (hotStockSort.value === 'turnover') return rows.sort((a, b) => b.turnoverRate - a.turnoverRate);
    return rows.sort((a, b) => b.amount - a.amount);
  });
  const hotSectorStats = computed(() => ({
    leader: hotSectorRows.value[0] ?? null,
    strongCount: hotSectorRows.value.filter(
      (row) => sectorHeatScore(row, maxSectorFlow.value, maxSectorAmount.value) >= 60
    ).length,
    activeCount: hotSectorRows.value.filter((row) => row.changePct >= 1).length,
    totalAmount: hotSectorRows.value.slice(0, 20).reduce((sum, row) => sum + row.amount, 0)
  }));
  const hotStockStats = computed(() => ({
    leader: displayHotStockRows.value[0] ?? null,
    strongCount: displayHotStockRows.value.filter(
      (row) => hotStockHeatScore(row, maxHotStockAmount.value) >= 60
    ).length,
    highTurnoverCount: displayHotStockRows.value.filter((row) => row.turnoverRate >= 10).length,
    averageTurnover: hotStockRows.value.length
      ? hotStockRows.value.reduce((sum, row) => sum + row.turnoverRate, 0) / hotStockRows.value.length
      : 0,
    totalAmount: hotStockRows.value.reduce((sum, row) => sum + row.amount, 0)
  }));

  watch(activeTab, (tab) => {
    if (tab === 'sectors' || tab === 'hotSectors') {
      selectedSectorCode.value = '';
      void refreshSectors();
    }

    if (tab === 'hotStocks' && !hotStockRows.value.length) {
      void refreshHotStocks();
    }
  });

  watch(sectorMode, () => {
    selectedSectorCode.value = '';
    if (activeTab.value === 'sectors' || activeTab.value === 'hotSectors') {
      void refreshSectors();
    }
  });

  watch(hotSectorSort, () => {
    selectedSectorCode.value = '';
    if (activeTab.value === 'hotSectors') {
      void refreshSectors();
    }
  });

  watch(hotStockSort, () => {
    selectedHotStockCode.value = '';
    if (activeTab.value === 'hotStocks') {
      void refreshHotStocks();
    }
  });

  watch(hotStockTimeframe, (nextTimeframe) => {
    if (selectedHotStockCode.value) {
      void loadHotStockCandles(selectedHotStockCode.value, nextTimeframe);
    }
  });

  watch(adjustmentMode, () => {
    if (selectedHotStockCode.value && hotStockTimeframe.value !== 'fs') {
      void loadHotStockCandles(selectedHotStockCode.value, hotStockTimeframe.value);
    }
  });

  onMounted(() => {
    void refreshSectors();
    refreshTimer = window.setInterval(() => void refreshActiveMarketTab(), MARKET_REFRESH_INTERVAL);
  });

  onBeforeUnmount(() => {
    if (refreshTimer !== undefined) {
      window.clearInterval(refreshTimer);
    }
  });

  async function refreshSectors() {
    const requestId = ++marketListRequestId;
    const requestedMode = sectorMode.value;
    const requestedTab = activeTab.value;
    sectorLoading.value = true;

    try {
      const requestedSort = requestedTab === 'hotSectors'
        ? hotSectorSort.value === 'money'
          ? 'money'
          : hotSectorSort.value === 'breadth'
            ? 'breadth'
            : 'change'
        : 'money';
      const rows = await fetchSectorRows(requestedMode, requestedSort);
      if (
        requestId !== marketListRequestId
        || sectorMode.value !== requestedMode
        || activeTab.value !== requestedTab
      ) return;

      sectorRows.value = rows;
      if (requestedTab === 'hotSectors') {
        const visibleRows = hotSectorRows.value;
        if (!visibleRows.some((row) => row.code === selectedSectorCode.value)) {
          selectedSectorCode.value = visibleRows[0]?.code ?? '';
        }
        if (selectedSector.value) {
          void loadSectorConstituents(selectedSector.value, true);
        }
      }
      const source = rows[0]?.source === 'sina' ? '新浪板块' : '东方财富';
      sectorStatus.value = rows.length ? `${source} · ${marketListTimeLabel(rows)}` : '板块源暂无返回';
    } catch {
      if (requestId === marketListRequestId) sectorStatus.value = '板块源暂不可用';
    } finally {
      if (requestId === marketListRequestId) sectorLoading.value = false;
    }
  }

  function selectSector(row: SectorRow) {
    selectedSectorCode.value = row.code;
    void loadSectorConstituents(row);
  }

  async function loadSectorConstituents(row: SectorRow, force = false) {
    if (
      (!force && Object.prototype.hasOwnProperty.call(sectorConstituentCache.value, row.code))
      || sectorConstituentLoadingCode.value === row.code
    ) return;

    sectorConstituentLoadingCode.value = row.code;
    try {
      const stocks = await fetchSectorConstituents(row);
      sectorConstituentCache.value = { ...sectorConstituentCache.value, [row.code]: stocks };
    } finally {
      if (sectorConstituentLoadingCode.value === row.code) {
        sectorConstituentLoadingCode.value = '';
      }
    }
  }

  async function refreshHotStocks() {
    const requestId = ++marketListRequestId;
    const requestedSort = hotStockSort.value;
    sectorLoading.value = true;

    try {
      const rows = await fetchHotStockRows(requestedSort);
      if (
        requestId !== marketListRequestId
        || activeTab.value !== 'hotStocks'
        || hotStockSort.value !== requestedSort
      ) return;

      hotStockRows.value = rows;
      if (selectedHotStockCode.value && !rows.some((row) => row.code === selectedHotStockCode.value)) {
        selectedHotStockCode.value = '';
      }
      if (selectedHotStockCode.value) {
        void loadHotStockCandles(selectedHotStockCode.value, hotStockTimeframe.value, true);
      }
      sectorStatus.value = rows.length ? `热门股票 · ${marketListTimeLabel(rows)}` : '股票源暂无返回';
    } catch {
      if (requestId === marketListRequestId) sectorStatus.value = '股票源暂不可用';
    } finally {
      if (requestId === marketListRequestId) sectorLoading.value = false;
    }
  }

  function refreshActiveMarketTab() {
    if (activeTab.value === 'sectors' || activeTab.value === 'hotSectors') {
      return refreshSectors();
    }
    if (activeTab.value === 'hotStocks') {
      return refreshHotStocks();
    }
    return Promise.resolve();
  }

  function showHotStockDetail(row: HotStockRow) {
    selectedHotStockCode.value = row.code;
    hotStockTimeframe.value = 'fs';
    void loadHotStockCandles(row.code, 'fs');
  }

  function reloadHotStockCandles(code: string) {
    void loadHotStockCandles(code, hotStockTimeframe.value, true);
  }

  async function loadHotStockCandles(code: string, nextTimeframe: Timeframe, force = false) {
    const adjustment = effectiveAdjustment(nextTimeframe, adjustmentMode.value);
    const variantKey = candleVariantKey(nextTimeframe, adjustment);
    const key = hotStockCacheKey(code, nextTimeframe, adjustment);
    if (
      (!force && hotStockCandleCache.value[code]?.[variantKey]?.length)
      || hotStockLoadingKey.value === key
    ) return;

    hotStockLoadingKey.value = key;
    try {
      const candles = await fetchStockCandles(code, nextTimeframe, adjustment);
      if (candles.length) {
        hotStockCandleCache.value = {
          ...hotStockCandleCache.value,
          [code]: {
            ...hotStockCandleCache.value[code],
            [variantKey]: candles
          }
        };
      }
    } finally {
      if (hotStockLoadingKey.value === key) {
        hotStockLoadingKey.value = '';
      }
    }
  }

  function hotStockCacheKey(code: string, nextTimeframe: Timeframe, adjustment: AdjustmentMode) {
    return `${code}:${candleVariantKey(nextTimeframe, adjustment)}`;
  }

  function findHotStock(code: string) {
    return hotStockRows.value.find((row) => row.code === code);
  }

  function upsertHotStock(row: HotStockRow) {
    hotStockRows.value = [row, ...hotStockRows.value.filter((item) => item.code !== row.code)];
  }

  return {
    sectorRows,
    sectorMode,
    hotSectorSort,
    hotStockSort,
    sectorLoading,
    sectorStatus,
    selectedSectorCode,
    selectedHotStockCode,
    hotStockTimeframe,
    maxSectorFlow,
    maxSectorAmount,
    hotSectorRows,
    selectedSector,
    selectedSectorConstituents,
    selectedSectorConstituentsLoading,
    selectedHotStock,
    selectedHotStockCandles,
    hotStockCandlesLoading,
    selectedHotStockAverage,
    selectedHotStockUpdatedLabel,
    maxHotStockAmount,
    displayHotStockRows,
    hotSectorStats,
    hotStockStats,
    refreshSectors,
    selectSector,
    refreshHotStocks,
    showHotStockDetail,
    reloadHotStockCandles,
    findHotStock,
    upsertHotStock
  };
}
