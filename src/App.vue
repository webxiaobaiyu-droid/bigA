<template>
  <div class="app-shell" :class="{ 'is-mac': isMac }">
    <AppTopBar
      v-model:active-tab="activeTab"
      :market-phase="marketPhase"
      :market-data-health="marketDataHealth"
      :has-market-data="hasMarketData"
      :breadth="breadth"
      @open-data-source="dataSourceHealthOpen = true"
      @open-appearance="appearanceSettingsOpen = true"
    />

    <NewsWorkspace
      v-if="activeTab === 'news'"
      v-model:filter="newsFilter"
      :status="newsStatus"
      :filters="newsFilters"
      :loading="newsLoading"
      :items="visibleNews"
      :empty-label="newsEmptyLabel"
      :selected-news="selectedNews"
      :selected-paragraphs="selectedNewsParagraphs"
      :detail-loading="selectedNewsDetailLoading"
      @refresh="refreshNews"
      @open-news="openNews"
      @close-detail="selectedNews = null"
    />

    <main v-else-if="activeTab === 'sectors'" class="tab-page sector-page">
      <MarketMonitor :watch-codes="watchCodes" @select-stock="openMonitorStock" @toggle-watchlist="toggleMonitorWatchlist" />
    </main>

    <HotSectorsWorkspace
      v-else-if="activeTab === 'hotSectors'"
      v-model:mode="sectorMode"
      v-model:sort="hotSectorSort"
      :status="sectorStatus"
      :loading="sectorLoading"
      :rows="hotSectorRows"
      :stats="hotSectorStats"
      :selected-sector="selectedSector"
      :constituents="selectedSectorConstituents"
      :constituents-loading="selectedSectorConstituentsLoading"
      :max-sector-flow="maxSectorFlow"
      :max-sector-amount="maxSectorAmount"
      @refresh="refreshSectors"
      @select-sector="selectSector"
      @select-stock="openConstituentStock"
    />

    <HotStocksWorkspace
      v-else-if="activeTab === 'hotStocks'"
      v-model:sort="hotStockSort"
      :timeframe="hotStockTimeframe"
      :adjustment-mode="adjustmentMode"
      :status="sectorStatus"
      :loading="sectorLoading"
      :rows="displayHotStockRows"
      :stats="hotStockStats"
      :selected-stock="selectedHotStock"
      :candles="selectedHotStockCandles"
      :candles-loading="hotStockCandlesLoading"
      :average-price="selectedHotStockAverage"
      :updated-label="selectedHotStockUpdatedLabel"
      :watchlisted="Boolean(selectedHotStock && isWatchlisted(selectedHotStock.code))"
      :max-amount="maxHotStockAmount"
      @update:timeframe="hotStockTimeframe = $event"
      @update:adjustment-mode="adjustmentMode = $event"
      @refresh="refreshHotStocks"
      @select-stock="showHotStockDetail"
      @close-detail="selectedHotStockCode = ''"
      @refresh-candles="selectedHotStock && reloadHotStockCandles(selectedHotStock.code)"
      @toggle-watchlist="toggleHotStockWatchlist"
    />

    <main v-else-if="activeTab === 'knowledge'" class="tab-page knowledge-page">
      <TradingKnowledge />
    </main>

    <div v-else class="workspace" :class="{ 'no-detail': !selected, 'left-collapsed': leftPaneCollapsed, 'right-collapsed': rightPaneCollapsed }">
      <WatchlistPane
        v-model:query="query"
        v-model:sort-key="sortKey"
        :collapsed="leftPaneCollapsed"
        :total-count="watchMetas.length"
        :unread-alert-count="unreadAlertCount"
        :search-loading="searchLoading"
        :search-error="searchError"
        :candidate-rows="candidateRows"
        :groups="watchGroups"
        :entries="watchOrganization.entries"
        :entries-by-code="watchEntryByCode"
        :latest-alerts="latestAlertByCode"
        :active-group-id="activeWatchGroupId"
        :rows="watchRows"
        :selected-code="selected?.meta.code ?? ''"
        :now="clockNow"
        @toggle-collapse="toggleLeftPane"
        @open-alert-center="openAlertCenter()"
        @open-manager="watchManagerOpen = true"
        @submit-search="addFirstCandidate"
        @add-stock="addStock"
        @select-group="selectWatchGroup"
        @select-stock="selectedCode = $event"
        @reorder-stock="reorderWatchStock"
        @remove-stock="removeStock"
      />

      <InstrumentChartPane
        v-if="selected"
        v-model:timeframe="timeframe"
        v-model:adjustment-mode="adjustmentMode"
        v-model:show-ma="showMa"
        v-model:show-volume="showVolume"
        :instrument="selected"
        :candles="selectedCandles"
        :info-expanded="stockInfoTab === 'finance'"
        @remove-stock="removeStock"
      >
        <template #stock-info>
          <StockInfoPanel
            v-model:tab="stockInfoTab"
            :meta="selected.meta"
            :loading="selectedStockInfoLoading"
            :has-data="selectedStockInfoHasData"
            :error="selectedStockInfoError"
            :news="selectedStockNews"
            :financial-reports="selectedFinancialReports"
            :company-profile="selectedCompanyProfile"
            :announcements="selectedAnnouncements"
            @refresh="loadSelectedStockInfo(true)"
            @open-news="openStockNews"
          />
        </template>
      </InstrumentChartPane>

      <main v-else class="empty-workspace">
        <div class="empty-panel">
          <Star :size="28" />
          <strong>暂无自选</strong>
        </div>
      </main>

      <StockDetailPane
        v-if="selected"
        v-model:indicator-tab="indicatorTab"
        :instrument="selected"
        :collapsed="rightPaneCollapsed"
        :alert-rule-count="selectedAlertRuleCount"
        :latest-alert="selectedLatestAlert"
        :provider-name="provider.providerName"
        :refresh-label="provider.refreshLabel"
        :now="clockNow"
        @toggle-collapse="toggleRightPane"
        @open-alert-center="openAlertCenter"
      />
    </div>

    <WatchlistManager
      v-if="watchManagerOpen"
      :groups="watchGroups"
      :entries="watchOrganization.entries"
      :metas="watchMetas"
      :import-status="watchImportStatus"
      @close="watchManagerOpen = false"
      @create-group="addWatchGroup"
      @update-group="updateWatchGroupDetails"
      @move-group="moveWatchGroup"
      @delete-group="deleteWatchGroup"
      @update-entry="editWatchEntry"
      @remove-codes="removeStocks"
      @import="importWatchlist"
      @export="exportWatchlist"
    />
    <AlertCenter
      v-if="alertCenterOpen"
      :rules="alertSettings.rules"
      :events="alertHistory"
      :settings="alertSettings"
      :metas="watchMetas"
      :groups="watchGroups"
      :initial-code="alertCenterInitialCode"
      @close="alertCenterOpen = false"
      @create-rule="createAlertRule"
      @update-rule="updateAlertRule"
      @toggle-rule="toggleAlertRule"
      @delete-rule="deleteAlertRule"
      @mark-read="markAlertRead"
      @mark-all-read="markAllAlertsRead"
      @clear-history="clearAlertHistory"
      @export-history="exportAlertHistory"
      @select-stock="openAlertStock"
      @update-settings="updateAlertSettings"
    />
    <DataSourceHealth v-if="dataSourceHealthOpen" @close="dataSourceHealthOpen = false" />
    <AppearanceSettings v-if="appearanceSettingsOpen" v-model="appearance" @close="appearanceSettingsOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Star } from '@lucide/vue';
import AppTopBar from '@/components/AppTopBar.vue';
import AlertCenter from '@/components/AlertCenter.vue';
import AppearanceSettings from '@/components/AppearanceSettings.vue';
import DataSourceHealth from '@/components/DataSourceHealth.vue';
import HotSectorsWorkspace from '@/components/HotSectorsWorkspace.vue';
import HotStocksWorkspace from '@/components/HotStocksWorkspace.vue';
import InstrumentChartPane from '@/components/InstrumentChartPane.vue';
import MarketMonitor from '@/components/MarketMonitor.vue';
import NewsWorkspace from '@/components/NewsWorkspace.vue';
import StockDetailPane from '@/components/StockDetailPane.vue';
import StockInfoPanel from '@/components/StockInfoPanel.vue';
import TradingKnowledge from '@/components/TradingKnowledge.vue';
import WatchlistPane from '@/components/WatchlistPane.vue';
import WatchlistManager from '@/components/WatchlistManager.vue';
import { useAdjustmentPreference } from '@/composables/useAdjustmentPreference';
import { useAlerts } from '@/composables/useAlerts';
import { useHotMarkets } from '@/composables/useHotMarkets';
import { useNewsFeed } from '@/composables/useNewsFeed';
import { usePaneLayout } from '@/composables/usePaneLayout';
import { useStockInfo } from '@/composables/useStockInfo';
import { useStockSearch } from '@/composables/useStockSearch';
import { candleVariantKey } from '@/services/adjustment';
import { applyAppearance, loadAppearance, type AppearanceSettings as AppearanceSettingsState } from '@/services/appearance';
import { EastmoneyAshareProvider } from '@/services/eastmoneyProvider';
import { assessMarketDataHealth } from '@/services/dataHealth';
import { fetchHotStockQuote, fetchStockCandles } from '@/services/sectorProvider';
import { createWatchGroup, exportWatchlistCsv, exportWatchlistJson, normalizeWatchlistOrganization, parseWatchlistImportReport, removeWatchGroup, reorderWatchEntries, reorderWatchGroups, updateWatchEntry, updateWatchGroup, upsertWatchEntry } from '@/services/watchlistState';
import type { AdjustmentMode, Candle, InstrumentState, StockMeta, Timeframe } from '@/types/market';
import type { NewsItem } from '@/types/news';
import type { MonitorStockReference } from '@/types/marketMonitor';
import type { HotStockRow } from '@/types/sector';
import type { WatchlistOrganization } from '@/types/watchlist';
import type { IndicatorTab, WatchSortKey, WorkspaceTab } from '@/types/workspace';
import { downloadTextFile } from '@/utils/download';
import { marketForStockCode } from '@/utils/marketFormatters';

const WATCHLIST_STORAGE_KEY = 'biga.watchlist.v1';
const WATCHLIST_ORGANIZATION_STORAGE_KEY = 'biga.watchlist-organization.v2';
const initialWatchlist = loadStoredWatchlist();
const initialWatchOrganization = loadStoredWatchOrganization(initialWatchlist);
const provider = new EastmoneyAshareProvider(initialWatchlist);
const snapshot = ref<InstrumentState[]>(provider.getSnapshot());
const watchMetas = ref<StockMeta[]>(initialWatchlist);
const watchOrganization = ref<WatchlistOrganization>(initialWatchOrganization);
const watchCodes = computed(() => watchMetas.value.map((item) => item.code));
const watchGroups = computed(() => [...watchOrganization.value.groups].sort((a, b) => a.order - b.order));
const watchEntryByCode = computed(() => new Map(watchOrganization.value.entries.map((entry) => [entry.code, entry])));
const activeWatchGroupId = ref('all');
const watchManagerOpen = ref(false);
const dataSourceHealthOpen = ref(false);
const appearanceSettingsOpen = ref(false);
const appearance = ref<AppearanceSettingsState>(loadAppearance());
const watchImportStatus = ref<{ message: string; tone: 'success' | 'error' } | null>(null);
const selectedCode = ref(initialWatchlist[0]?.code ?? '');
const { leftPaneCollapsed, rightPaneCollapsed, toggleLeftPane, toggleRightPane } = usePaneLayout();
const phaseNow = ref(provider.getMarketPhase());
const sourceStatus = ref(provider.getSourceStatus());
const clockNow = ref(Date.now());
const activeTab = ref<WorkspaceTab>('news');
const { query, searchLoading, searchError, candidateRows, clear: clearStockSearch } = useStockSearch(watchCodes);
const sortKey = ref<WatchSortKey>('custom');
const timeframe = ref<Timeframe>('fs');
const { adjustmentMode } = useAdjustmentPreference();
const showMa = ref(true);
const showVolume = ref(true);
const indicatorTab = ref<IndicatorTab>('trend');
const {
  newsFilters,
  newsFilter,
  newsLoading,
  newsStatus,
  selectedNews,
  visibleNews,
  newsEmptyLabel,
  selectedNewsParagraphs,
  selectedNewsDetailLoading,
  refreshNews,
  openNews
} = useNewsFeed();
const {
  sectorRows,
  sectorMode,
  hotSectorSort,
  hotStockSort,
  sectorLoading,
  sectorStatus,
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
} = useHotMarkets(activeTab, adjustmentMode);
const selectedAdjustedCandleCache = ref<Record<string, Record<string, Candle[]>>>({});
const selectedAdjustedLoadingKey = ref('');

let unsubscribe: (() => void) | null = null;
let phaseTimer: number | undefined;
let unsubscribeNotificationClick: (() => void) | undefined;

watch(appearance, (value) => applyAppearance(value), { deep: true });

onMounted(() => {
  unsubscribe = provider.subscribe((rows) => {
    snapshot.value = rows;
    syncWatchlistMetadata(rows);
    phaseNow.value = provider.getMarketPhase();
    sourceStatus.value = provider.getSourceStatus();
    evaluateSnapshotAlerts(rows);
  });
  unsubscribeNotificationClick = window.bigA?.onNotificationClick?.(({ code }) => openAlertStock(code));
  provider.start();
  phaseTimer = window.setInterval(() => {
    clockNow.value = Date.now();
    phaseNow.value = provider.getMarketPhase();
  }, 5_000);
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribeNotificationClick?.();
  provider.stop();
  if (phaseTimer) {
    window.clearInterval(phaseTimer);
  }
});

const marketPhase = computed(() => phaseNow.value);
const marketDataHealth = computed(() => assessMarketDataHealth(snapshot.value, sourceStatus.value, marketPhase.value, clockNow.value));
const isMac = computed(() => window.bigA?.platform === 'darwin' || navigator.platform.toLowerCase().includes('mac'));
const hasMarketData = computed(() => snapshot.value.length > 0);
const rowsByCode = computed(() => new Map(snapshot.value.map((row) => [row.meta.code, row])));

const watchRows = computed(() => {
  const visibleCodes = activeWatchGroupId.value === 'all'
    ? watchCodes.value
    : watchOrganization.value.entries.filter((entry) => entry.groupId === activeWatchGroupId.value).map((entry) => entry.code);
  const rows = visibleCodes
    .map((code) => rowsByCode.value.get(code))
    .filter((row): row is InstrumentState => Boolean(row));

  return rows.sort((a, b) => {
    if (sortKey.value === 'custom') {
      return (watchEntryByCode.value.get(a.meta.code)?.order ?? Infinity) - (watchEntryByCode.value.get(b.meta.code)?.order ?? Infinity);
    }
    if (sortKey.value === 'change') {
      return b.quote.changePct - a.quote.changePct;
    }

    if (sortKey.value === 'speed') {
      return Math.abs(b.quote.speed) - Math.abs(a.quote.speed);
    }

    return scoreRow(b) - scoreRow(a);
  });
});

const selected = computed(() => {
  const current = rowsByCode.value.get(selectedCode.value);
  if (activeWatchGroupId.value === 'all') return current ?? watchRows.value[0] ?? null;
  return watchRows.value.find((row) => row.meta.code === selectedCode.value) ?? watchRows.value[0] ?? null;
});
const {
  alertCenterOpen,
  alertCenterInitialCode,
  alertSettings,
  alertHistory,
  unreadAlertCount,
  latestAlertByCode,
  selectedLatestAlert,
  selectedAlertRuleCount,
  persistAlertState,
  removeAlertInstrument,
  openAlertCenter,
  createAlertRule,
  updateAlertRule,
  toggleAlertRule,
  deleteAlertRule,
  updateAlertSettings,
  markAlertRead,
  markAllAlertsRead,
  clearAlertHistory,
  exportAlertHistory,
  evaluateSnapshotAlerts
} = useAlerts({ selected, sectorRows, watchOrganization, marketPhase });
const selectedCandles = computed(() => {
  if (!selected.value) return [];
  if (timeframe.value === 'fs' || adjustmentMode.value === 'forward') return selected.value.candles[timeframe.value];
  return selectedAdjustedCandleCache.value[selected.value.meta.code]?.[candleVariantKey(timeframe.value, adjustmentMode.value)] ?? [];
});
const {
  stockInfoTab,
  selectedStockNews,
  selectedFinancialReports,
  selectedCompanyProfile,
  selectedAnnouncements,
  selectedStockInfoLoading,
  selectedStockInfoError,
  selectedStockInfoHasData,
  loadSelectedStockInfo
} = useStockInfo(selected);

const breadth = computed(() => {
  return snapshot.value.reduce(
    (acc, row) => {
      if (row.quote.changePct > 0.05) acc.up += 1;
      else if (row.quote.changePct < -0.05) acc.down += 1;
      else acc.flat += 1;
      return acc;
    },
    { up: 0, down: 0, flat: 0 }
  );
});

watch(
  () => [selected.value?.meta.code ?? '', timeframe.value, adjustmentMode.value] as const,
  ([code, selectedTimeframe, adjustment]) => {
    if (code && selectedTimeframe !== 'fs' && adjustment !== 'forward') {
      void loadSelectedAdjustedCandles(code, selectedTimeframe, adjustment);
    }
  },
  { immediate: true }
);

function addStock(meta: StockMeta) {
  if (!watchCodes.value.includes(meta.code)) {
    watchMetas.value = [meta, ...watchMetas.value];
    watchOrganization.value = upsertWatchEntry(watchOrganization.value, meta.code, activeWatchGroupId.value === 'all' ? undefined : activeWatchGroupId.value);
    provider.addInstrument(meta);
    persistWatchlist();
    persistWatchOrganization();
  }

  selectedCode.value = meta.code;
  clearStockSearch();
}

function isWatchlisted(code: string) {
  return watchCodes.value.includes(code);
}

function toggleWatchlistMeta(meta: StockMeta) {
  if (isWatchlisted(meta.code)) {
    removeStock(meta.code);
    return;
  }
  addStock(meta);
}

function toggleHotStockWatchlist(row: HotStockRow) {
  toggleWatchlistMeta(stockMetaFromMarketRow(row, '热门股票'));
}

function toggleMonitorWatchlist(reference: MonitorStockReference) {
  toggleWatchlistMeta(stockMetaFromMarketRow(reference, '市场监控'));
}

function stockMetaFromMarketRow(
  row: Pick<HotStockRow, 'code' | 'name' | 'price'> & Partial<Pick<HotStockRow, 'prevClose' | 'floatMarketCap' | 'pe'>>,
  sector: string
): StockMeta {
  const existing = watchMetas.value.find((item) => item.code === row.code);
  if (existing) return existing;
  return {
    code: row.code,
    name: row.name,
    market: marketForStockCode(row.code),
    sector,
    basePrice: row.prevClose || row.price || 1,
    floatMarketCap: row.floatMarketCap || 0,
    pe: row.pe || 0,
    beta: 1,
    style: 'core'
  };
}

function openStockNews(item: NewsItem) {
  activeTab.value = 'news';
  openNews(item);
}

function addFirstCandidate() {
  const first = candidateRows.value[0];
  if (first) {
    addStock(first);
  }
}

function removeStock(code: string) {
  watchMetas.value = watchMetas.value.filter((item) => item.code !== code);
  watchOrganization.value = { ...watchOrganization.value, entries: watchOrganization.value.entries.filter((entry) => entry.code !== code) };
  provider.removeInstrument(code);
  removeAlertInstrument(code);
  persistWatchlist();
  persistWatchOrganization();
  persistAlertState();

  if (selectedCode.value === code) {
    selectedCode.value = watchCodes.value[0] ?? '';
  }
}

function removeStocks(codes: string[]) {
  const uniqueCodes = [...new Set(codes)];
  const removing = new Set(uniqueCodes);
  watchMetas.value = watchMetas.value.filter((item) => !removing.has(item.code));
  watchOrganization.value = { ...watchOrganization.value, entries: watchOrganization.value.entries.filter((entry) => !removing.has(entry.code)) };
  uniqueCodes.forEach((code) => { provider.removeInstrument(code); removeAlertInstrument(code); });
  if (removing.has(selectedCode.value)) selectedCode.value = watchRows.value[0]?.meta.code ?? watchCodes.value[0] ?? '';
  persistWatchlist();
  persistWatchOrganization();
  persistAlertState();
}

function selectWatchGroup(groupId: string) {
  activeWatchGroupId.value = groupId;
  if (groupId === 'all') return;
  const firstCode = [...watchOrganization.value.entries].sort((a, b) => a.order - b.order).find((entry) => entry.groupId === groupId)?.code ?? '';
  selectedCode.value = firstCode;
}

function openAlertStock(code: string) {
  if (!watchCodes.value.includes(code)) return;
  selectedCode.value = code;
  activeTab.value = 'watchlist';
  alertCenterOpen.value = false;
}

function reorderWatchStock(sourceCode: string, targetCode: string) {
  if (sourceCode === targetCode) return;
  watchOrganization.value = reorderWatchEntries(watchOrganization.value, sourceCode, targetCode);
  persistWatchOrganization();
}

function addWatchGroup(name: string) {
  watchOrganization.value = { ...watchOrganization.value, groups: createWatchGroup(watchOrganization.value.groups, name) };
  persistWatchOrganization();
}

function updateWatchGroupDetails(id: string, patch: { name?: string; color?: string }) {
  watchOrganization.value = { ...watchOrganization.value, groups: updateWatchGroup(watchOrganization.value.groups, id, patch) };
  persistWatchOrganization();
}

function moveWatchGroup(sourceId: string, targetId: string) {
  watchOrganization.value = { ...watchOrganization.value, groups: reorderWatchGroups(watchOrganization.value.groups, sourceId, targetId) };
  persistWatchOrganization();
}

function deleteWatchGroup(id: string) {
  watchOrganization.value = removeWatchGroup(watchOrganization.value, id);
  if (activeWatchGroupId.value === id) activeWatchGroupId.value = 'all';
  persistWatchOrganization();
}

function editWatchEntry(code: string, patch: { groupId?: string; tags?: string[] }) {
  watchOrganization.value = updateWatchEntry(watchOrganization.value, code, patch);
  persistWatchOrganization();
}

function importWatchlist(text: string) {
  let report;
  try {
    report = parseWatchlistImportReport(text);
  } catch {
    watchImportStatus.value = { tone: 'error', message: '导入失败：文件格式无法识别' };
    return;
  }
  if (!report.rows.length) {
    watchImportStatus.value = { tone: 'error', message: report.rejected ? `未导入有效股票，已跳过 ${report.rejected} 行` : '未发现可导入的股票' };
    return;
  }
  let organization = watchOrganization.value;
  const nextMetas = [...watchMetas.value];
  let added = 0;
  let updated = 0;
  report.rows.forEach(({ meta, groupName, tags }) => {
    if (!organization.groups.some((group) => group.name === groupName)) {
      organization = { ...organization, groups: createWatchGroup(organization.groups, groupName) };
    }
    const groupId = organization.groups.find((group) => group.name === groupName)?.id;
    if (!nextMetas.some((item) => item.code === meta.code)) {
      nextMetas.push(meta);
      provider.addInstrument(meta);
      added += 1;
    } else updated += 1;
    organization = upsertWatchEntry(organization, meta.code, groupId);
    organization = updateWatchEntry(organization, meta.code, { groupId, tags });
  });
  watchMetas.value = nextMetas;
  watchOrganization.value = normalizeWatchlistOrganization(organization, nextMetas);
  persistWatchlist();
  persistWatchOrganization();
  const skipped = report.rejected ? `，跳过 ${report.rejected} 行` : '';
  watchImportStatus.value = { tone: 'success', message: `导入完成：新增 ${added}，更新 ${updated}${skipped}` };
}

function exportWatchlist(format: 'csv' | 'json') {
  const content = format === 'csv' ? exportWatchlistCsv(watchMetas.value, watchOrganization.value) : exportWatchlistJson(watchMetas.value, watchOrganization.value);
  downloadTextFile(`BigA-watchlist-${new Date().toISOString().slice(0, 10)}.${format}`, content, format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8');
}

function openConstituentStock(row: HotStockRow) {
  if (!findHotStock(row.code)) upsertHotStock(row);
  activeTab.value = 'hotStocks';
  showHotStockDetail(row);
}

async function openMonitorStock(reference: MonitorStockReference) {
  const existing = findHotStock(reference.code);
  const fallback = existing ?? monitorReferenceToHotStock(reference);
  if (!existing) upsertHotStock(fallback);
  activeTab.value = 'hotStocks';
  showHotStockDetail(fallback);

  const live = await fetchHotStockQuote(reference.code);
  if (!live) return;
  upsertHotStock(live);
}

function monitorReferenceToHotStock(reference: MonitorStockReference): HotStockRow {
  const prevClose = reference.price > 0 && reference.changePct !== -100
    ? reference.price / (1 + reference.changePct / 100)
    : reference.price;
  return {
    code: reference.code,
    name: reference.name,
    price: reference.price,
    prevClose,
    open: reference.price,
    high: reference.price,
    low: reference.price,
    change: reference.price - prevClose,
    changePct: reference.changePct,
    amplitude: 0,
    volume: 0,
    amount: reference.amount,
    turnoverRate: reference.turnoverRate,
    pe: 0,
    volumeRatio: 0,
    marketCap: 0,
    floatMarketCap: 0,
    mainNetInflow: 0,
    mainNetInflowPct: 0,
    speed: 0,
    updatedAt: 0,
    fetchedAt: Date.now()
  };
}

async function loadSelectedAdjustedCandles(code: string, selectedTimeframe: Timeframe, adjustment: AdjustmentMode, force = false) {
  if (selectedTimeframe === 'fs' || adjustment === 'forward') return;
  const variantKey = candleVariantKey(selectedTimeframe, adjustment);
  const requestKey = `${code}:${variantKey}`;
  if ((!force && selectedAdjustedCandleCache.value[code]?.[variantKey]?.length) || selectedAdjustedLoadingKey.value === requestKey) return;

  selectedAdjustedLoadingKey.value = requestKey;
  try {
    const candles = await fetchStockCandles(code, selectedTimeframe, adjustment);
    if (candles.length) {
      selectedAdjustedCandleCache.value = {
        ...selectedAdjustedCandleCache.value,
        [code]: {
          ...selectedAdjustedCandleCache.value[code],
          [variantKey]: candles
        }
      };
    }
  } finally {
    if (selectedAdjustedLoadingKey.value === requestKey) selectedAdjustedLoadingKey.value = '';
  }
}

function syncWatchlistMetadata(rows: InstrumentState[]) {
  const rowMap = new Map(rows.map((row) => [row.meta.code, row.meta]));
  let changed = false;
  const next = watchMetas.value.map((meta) => {
    const liveMeta = rowMap.get(meta.code);
    if (!liveMeta || (liveMeta.name === meta.name && liveMeta.sector === meta.sector && liveMeta.market === meta.market)) {
      return meta;
    }
    changed = true;
    return { ...meta, name: liveMeta.name, sector: liveMeta.sector, market: liveMeta.market };
  });

  if (changed) {
    watchMetas.value = next;
    persistWatchlist();
  }
}

function persistWatchlist() {
  try {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchMetas.value));
  } catch {
    // The live provider remains usable when renderer storage is unavailable.
  }
}

function persistWatchOrganization() {
  try {
    window.localStorage.setItem(WATCHLIST_ORGANIZATION_STORAGE_KEY, JSON.stringify(watchOrganization.value));
  } catch {
    // Keep the current session organization when renderer storage is unavailable.
  }
}

function loadStoredWatchOrganization(metas: StockMeta[]) {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_ORGANIZATION_STORAGE_KEY);
    return normalizeWatchlistOrganization(raw ? JSON.parse(raw) : null, metas);
  } catch {
    return normalizeWatchlistOrganization(null, metas);
  }
}

function loadStoredWatchlist(): StockMeta[] {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    const seen = new Set<string>();
    return parsed.flatMap((value) => {
      if (!isStoredStockMeta(value) || seen.has(value.code)) {
        return [];
      }
      seen.add(value.code);
      return [{ ...value, beta: Number(value.beta) || 1, style: value.style || 'core' }];
    });
  } catch {
    return [];
  }
}

function isStoredStockMeta(value: unknown): value is StockMeta {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<StockMeta>;
  return /^\d{6}$/.test(String(item.code ?? '')) && Boolean(item.name) && (item.market === 'SH' || item.market === 'SZ' || item.market === 'BJ');
}

function scoreRow(row: InstrumentState) {
  const signalScore = row.signals.filter((signal) => signal.active).reduce((sum, signal) => sum + signal.weight, 0);
  return signalScore + Math.abs(row.quote.changePct) * 5 + Math.abs(row.quote.speed) * 24;
}

</script>
