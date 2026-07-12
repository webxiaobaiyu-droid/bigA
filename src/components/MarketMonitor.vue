<template>
  <section class="tab-hero market-monitor-shell">
    <div class="tab-heading market-monitor-heading">
      <div class="heading-title">
        <Activity :size="20" />
        <strong>市场监控</strong>
        <span>{{ statusLabel }}</span>
      </div>
      <div class="monitor-actions">
        <div class="mini-tabs monitor-tabs">
          <button v-for="item in monitorViews" :key="item.key" type="button" :class="{ active: activeView === item.key }" @click="activeView = item.key">
            {{ item.label }}
          </button>
        </div>
        <div v-if="activeView === 'sentiment'" class="mini-tabs monitor-mode-tabs"><button type="button" :class="{ active: sentimentMode === 'live' }" @click="sentimentMode = 'live'">实时</button><button type="button" :class="{ active: sentimentMode === 'replay' }" @click="sentimentMode = 'replay'">复盘</button></div>
        <div v-if="activeView === 'fundFlow'" class="mini-tabs monitor-mode-tabs"><button type="button" :class="{ active: fundFlowMode === 'live' }" @click="fundFlowMode = 'live'">实时榜</button><button type="button" :class="{ active: fundFlowMode === 'rotation' }" @click="fundFlowMode = 'rotation'">轮动</button></div>
        <button class="icon-button mini" :class="{ active: currentLoading }" type="button" title="刷新市场监控" @click="refreshCurrent(true)">
          <RefreshCw :size="14" />
        </button>
      </div>
    </div>

    <div v-if="currentLoading && !currentHasData" class="tab-empty">
      <RefreshCw :size="25" class="spin" />
      <strong>同步{{ activeViewLabel }}中</strong>
    </div>
    <div v-else-if="currentError && !currentHasData" class="tab-empty">
      <Database :size="25" />
      <strong>{{ currentError }}</strong>
      <button class="monitor-retry" type="button" @click="refreshCurrent(true)">重新连接</button>
    </div>

    <div v-else-if="activeView === 'sentiment' && sentiment && sentimentMode === 'live'" class="monitor-view sentiment-view">
      <MarketSentimentDashboard :snapshot="sentiment" />

      <div class="sentiment-workspace">
        <section class="sentiment-overview">
          <div class="monitor-section-title">
            <div><Gauge :size="15" /><strong>指数与诊断</strong></div>
            <span>{{ sentiment.tradeDate || '--' }}</span>
          </div>

          <div class="index-pulse-list">
            <div class="index-pulse-head"><span>指数</span><span>最新</span><span>涨跌</span><span>成交额</span></div>
            <div v-for="row in sentiment.indices" :key="row.code" class="index-pulse-row">
              <strong>{{ row.name }}</strong>
              <span>{{ formatPrice(row.price) }}</span>
              <span :class="priceClass(row.changePct)">{{ formatPct(row.changePct) }}</span>
              <span>{{ formatAmount(row.amount) }}</span>
            </div>
          </div>

          <div class="sentiment-factor-list">
            <div><span>红盘覆盖</span><strong :class="advancingRatio >= 50 ? 'up' : 'down'">{{ advancingRatio.toFixed(1) }}%</strong></div>
            <div><span>涨跌停差</span><strong :class="priceClass(sentiment.limitUp - sentiment.limitDown)">{{ sentiment.limitUp - sentiment.limitDown >= 0 ? '+' : '' }}{{ sentiment.limitUp - sentiment.limitDown }}</strong></div>
            <div><span>封板质量</span><strong :class="sentiment.sealRate >= 60 ? 'up' : sentiment.sealRate < 40 ? 'down' : 'watch'">{{ sentiment.sealRate.toFixed(1) }}%</strong></div>
            <div><span>绿盘占比</span><strong :class="decliningRatio > 50 ? 'down' : ''">{{ decliningRatio.toFixed(1) }}%</strong></div>
          </div>
          <MarketSentimentRadar :snapshot="sentiment" />
        </section>

        <section class="limit-leader-panel">
          <div class="monitor-section-title">
            <div><TrendingUp :size="15" /><strong>涨停个股</strong></div>
            <span>点击查看行情 · 连板优先</span>
          </div>
          <div class="limit-leader-table">
            <div class="limit-leader-row head"><span>#</span><span>股票 / 板块</span><span>连板</span><span>涨幅</span><span>首封</span><span>炸板</span><span>成交额</span></div>
            <button v-for="(row, index) in sentiment.leaders" :key="row.code" class="limit-leader-row" type="button" @click="emitLimitStock(row)">
              <span class="rank-index">{{ index + 1 }}</span>
              <span class="monitor-stock-name"><strong>{{ row.name }}</strong><em>{{ row.code }} · {{ row.sector }}</em></span>
              <strong class="streak-badge">{{ row.streak }}板</strong>
              <strong class="up">{{ formatPct(row.changePct) }}</strong>
              <span>{{ row.firstLimitTime }}</span>
              <span :class="row.brokenCount ? 'watch' : ''">{{ row.brokenCount }}次</span>
              <span>{{ formatAmount(row.amount) }}</span>
            </button>
          </div>
        </section>
      </div>
    </div>

    <MarketSentimentReplay v-else-if="activeView === 'sentiment' && sentimentMode === 'replay'" class="monitor-view" :points="sentimentHistory" />

    <div v-else-if="activeView === 'dragonTiger' && dragonTiger" class="monitor-view dragon-view" :class="{ 'detail-open': selectedDragonStock }">
      <DragonTigerDetail
        v-if="selectedDragonStock"
        :key="`${selectedDragonStock.code}-${selectedDragonStock.tradeDate}`"
        :stock="selectedDragonStock"
        :watchlisted="watchCodes.includes(selectedDragonStock.code)"
        @back="selectedDragonStock = null"
        @open-stock="emit('selectStock', $event)"
        @toggle-watchlist="emit('toggleWatchlist', $event)"
      />
      <template v-else>
      <div class="monitor-pulse-strip dragon-pulse">
        <div><span>上榜股票</span><strong>{{ dragonStats.total }}</strong><em>{{ dragonTiger.tradeDate || '--' }}</em></div>
        <div><span>净买入家数</span><strong class="up">{{ dragonStats.netBuyCount }}</strong><em>占比 {{ formatRatio(dragonStats.netBuyCount, dragonStats.total) }}</em></div>
        <div><span>合计净额</span><strong :class="priceClass(dragonStats.totalNet)">{{ formatAmount(dragonStats.totalNet) }}</strong><em>去重统计</em></div>
        <div><span>净买入首位</span><strong>{{ dragonStats.topBuy?.name || '--' }}</strong><em class="up">{{ dragonStats.topBuy ? formatAmount(dragonStats.topBuy.netAmount) : '--' }}</em></div>
        <div><span>净卖出首位</span><strong>{{ dragonStats.topSell?.name || '--' }}</strong><em class="down">{{ dragonStats.topSell ? formatAmount(dragonStats.topSell.netAmount) : '--' }}</em></div>
      </div>

      <div class="dragon-table-shell">
        <div class="dragon-toolbar">
          <div><ListFilter :size="14" /><strong>龙虎榜明细</strong><span>点击股票查看机构与游资 B/S</span></div>
          <div class="dragon-toolbar-actions">
            <label class="dragon-filter">
              <Search :size="13" />
              <input v-model.trim="dragonQuery" type="search" placeholder="名称 / 代码 / 席位 / 原因" aria-label="筛选龙虎榜" />
              <button v-if="dragonQuery" type="button" title="清空筛选" aria-label="清空筛选" @click="dragonQuery = ''"><X :size="12" /></button>
            </label>
            <div class="mini-tabs dragon-sort-tabs">
              <button v-for="item in dragonSortOptions" :key="item.key" type="button" :class="{ active: dragonSort === item.key }" @click="dragonSort = item.key">{{ item.label }}</button>
            </div>
          </div>
        </div>
        <div class="dragon-table">
          <div class="dragon-row head"><span>#</span><span>股票</span><span>涨幅</span><span>龙虎净额</span><span>买入 / 卖出</span><span>榜单占比</span><span>席位特征</span><span>上榜原因</span></div>
          <button v-for="(row, index) in sortedDragonRows" :key="row.code" type="button" class="dragon-row" @click="selectedDragonStock = row">
            <span class="rank-index">{{ index + 1 }}</span>
            <span class="monitor-stock-name"><strong>{{ row.name }}</strong><em>{{ row.code }} · 换手 {{ row.turnoverRate.toFixed(1) }}%</em></span>
            <strong :class="priceClass(row.changePct)">{{ formatPct(row.changePct) }}</strong>
            <strong :class="priceClass(row.netAmount)">{{ formatAmount(row.netAmount) }}</strong>
            <span class="buy-sell-cell"><b class="up">{{ formatAmount(row.buyAmount) }}</b><i>/</i><b class="down">{{ formatAmount(row.sellAmount) }}</b></span>
            <span>{{ row.dealRatio.toFixed(1) }}%</span>
            <span class="ellipsis-cell" :title="row.seatInsight">{{ row.seatInsight }}</span>
            <span class="ellipsis-cell" :title="row.reason">{{ row.reason }}</span>
          </button>
          <div v-if="!sortedDragonRows.length" class="dragon-filter-empty">未找到匹配的龙虎榜股票</div>
        </div>
      </div>
      </template>
    </div>

    <div v-else-if="activeView === 'fundFlow' && fundFlow && fundFlowMode === 'live'" class="monitor-view fund-flow-view">
      <div class="monitor-pulse-strip fund-pulse">
        <div class="primary-pulse"><span>行业合计净额</span><strong :class="priceClass(capitalStats.totalNet)">{{ formatAmount(capitalStats.totalNet) }}</strong><em>新浪行业资金</em></div>
        <div><span>流入资金</span><strong class="up">{{ formatAmount(capitalStats.totalInflow) }}</strong><em>{{ fundFlow.sectors.length }} 个行业</em></div>
        <div><span>流出资金</span><strong class="down">{{ formatAmount(capitalStats.totalOutflow) }}</strong><em>实时汇总</em></div>
        <div><span>净流入首位</span><strong>{{ positiveCapitalSectors[0]?.name || '--' }}</strong><em class="up">{{ positiveCapitalSectors[0] ? formatAmount(positiveCapitalSectors[0].netAmount) : '--' }}</em></div>
        <div><span>个股主力首位</span><strong>{{ positiveCapitalStocks[0]?.name || '--' }}</strong><em class="up">{{ positiveCapitalStocks[0] ? formatAmount(positiveCapitalStocks[0].netAmount) : '--' }}</em></div>
      </div>

      <div class="capital-rank-grid">
        <section class="capital-rank-panel">
          <div class="monitor-section-title"><div><TrendingUp :size="14" /><strong>行业净流入</strong></div><span>净额 / 净占比</span></div>
          <div class="capital-rank-head"><span>#</span><span>行业 / 龙头</span><span>涨跌</span><span>净额</span><span>净占比</span></div>
          <div v-for="(row, index) in positiveCapitalSectors" :key="row.code" class="capital-rank-row">
            <span class="rank-index">{{ index + 1 }}</span><span class="monitor-stock-name"><strong>{{ row.name }}</strong><em>{{ row.leaderName }}</em></span><span :class="priceClass(row.changePct)">{{ formatPct(row.changePct) }}</span><strong class="up">{{ formatAmount(row.netAmount) }}</strong><span>{{ row.netRatio.toFixed(1) }}%</span>
          </div>
        </section>
        <section class="capital-rank-panel">
          <div class="monitor-section-title"><div><TrendingDown :size="14" /><strong>行业净流出</strong></div><span>净额 / 净占比</span></div>
          <div class="capital-rank-head"><span>#</span><span>行业 / 龙头</span><span>涨跌</span><span>净额</span><span>净占比</span></div>
          <div v-for="(row, index) in negativeCapitalSectors" :key="row.code" class="capital-rank-row">
            <span class="rank-index">{{ index + 1 }}</span><span class="monitor-stock-name"><strong>{{ row.name }}</strong><em>{{ row.leaderName }}</em></span><span :class="priceClass(row.changePct)">{{ formatPct(row.changePct) }}</span><strong class="down">{{ formatAmount(row.netAmount) }}</strong><span>{{ row.netRatio.toFixed(1) }}%</span>
          </div>
        </section>
        <section class="capital-rank-panel stock-capital-panel">
          <div class="monitor-section-title"><div><TrendingUp :size="14" /><strong>个股主力净流入</strong></div><span>点击查看行情</span></div>
          <div class="capital-rank-head"><span>#</span><span>股票</span><span>涨跌</span><span>主力净额</span><span>净占比</span></div>
          <button v-for="(row, index) in positiveCapitalStocks" :key="row.code" type="button" class="capital-rank-row" @click="emitCapitalStock(row)">
            <span class="rank-index">{{ index + 1 }}</span><span class="monitor-stock-name"><strong>{{ row.name }}</strong><em>{{ row.code }} · 换手 {{ row.turnoverRate.toFixed(1) }}%</em></span><span :class="priceClass(row.changePct)">{{ formatPct(row.changePct) }}</span><strong class="up">{{ formatAmount(row.netAmount) }}</strong><span>{{ row.netRatio.toFixed(1) }}%</span>
          </button>
        </section>
        <section class="capital-rank-panel stock-capital-panel">
          <div class="monitor-section-title"><div><TrendingDown :size="14" /><strong>个股主力净流出</strong></div><span>点击查看行情</span></div>
          <div class="capital-rank-head"><span>#</span><span>股票</span><span>涨跌</span><span>主力净额</span><span>净占比</span></div>
          <button v-for="(row, index) in negativeCapitalStocks" :key="row.code" type="button" class="capital-rank-row" @click="emitCapitalStock(row)">
            <span class="rank-index">{{ index + 1 }}</span><span class="monitor-stock-name"><strong>{{ row.name }}</strong><em>{{ row.code }} · 换手 {{ row.turnoverRate.toFixed(1) }}%</em></span><span :class="priceClass(row.changePct)">{{ formatPct(row.changePct) }}</span><strong class="down">{{ formatAmount(row.netAmount) }}</strong><span>{{ row.netRatio.toFixed(1) }}%</span>
          </button>
        </section>
      </div>
    </div>

    <MarketRotationPanel v-else-if="activeView === 'fundFlow' && fundFlowMode === 'rotation'" class="monitor-view" :points="fundFlowHistory" :current="fundFlow" />

    <div v-else class="tab-empty"><Database :size="25" /><strong>暂无{{ activeViewLabel }}数据</strong></div>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Activity, Database, Gauge, ListFilter, RefreshCw, Search, TrendingDown, TrendingUp, X } from '@lucide/vue';
import DragonTigerDetail from '@/components/DragonTigerDetail.vue';
import { appendFundFlowHistory, appendSentimentHistory, FUND_FLOW_HISTORY_STORAGE_KEY, loadHistory, saveHistory, SENTIMENT_HISTORY_STORAGE_KEY } from '@/services/marketHistory';
import { fetchDragonTigerList, fetchMarketFundFlow, fetchMarketSentiment } from '@/services/marketMonitorProvider';
import type {
  CapitalFlowStock,
  DragonTigerRow,
  DragonTigerSnapshot,
  FundFlowHistoryPoint,
  LimitPoolStock,
  MarketFundFlowSnapshot,
  MarketMonitorView,
  MarketSentimentSnapshot,
  MonitorStockReference,
  SentimentHistoryPoint
} from '@/types/marketMonitor';

const MarketSentimentDashboard = defineAsyncComponent(() => import('@/components/MarketSentimentDashboard.vue'));
const MarketSentimentRadar = defineAsyncComponent(() => import('@/components/MarketSentimentRadar.vue'));
const MarketSentimentReplay = defineAsyncComponent(() => import('@/components/MarketSentimentReplay.vue'));
const MarketRotationPanel = defineAsyncComponent(() => import('@/components/MarketRotationPanel.vue'));

type DragonSortKey = 'netBuy' | 'netSell' | 'dealRatio' | 'change';

const props = withDefaults(defineProps<{ watchCodes?: string[] }>(), { watchCodes: () => [] });
const emit = defineEmits<{
  selectStock: [stock: MonitorStockReference];
  toggleWatchlist: [stock: MonitorStockReference];
}>();
const watchCodes = computed(() => props.watchCodes);
const activeView = ref<MarketMonitorView>('sentiment');
const sentiment = ref<MarketSentimentSnapshot | null>(null);
const dragonTiger = ref<DragonTigerSnapshot | null>(null);
const fundFlow = ref<MarketFundFlowSnapshot | null>(null);
const loadingView = ref<MarketMonitorView | ''>('');
const errors = ref<Partial<Record<MarketMonitorView, string>>>({});
const dragonSort = ref<DragonSortKey>('netBuy');
const dragonQuery = ref('');
const selectedDragonStock = ref<DragonTigerRow | null>(null);
const sentimentMode = ref<'live' | 'replay'>('live');
const fundFlowMode = ref<'live' | 'rotation'>('live');
const sentimentHistory = ref<SentimentHistoryPoint[]>([]);
const fundFlowHistory = ref<FundFlowHistoryPoint[]>([]);
let refreshTimer: number | undefined;

const monitorViews: Array<{ key: MarketMonitorView; label: string }> = [
  { key: 'sentiment', label: '市场情绪' },
  { key: 'dragonTiger', label: '龙虎榜' },
  { key: 'fundFlow', label: '资金流向' }
];
const dragonSortOptions: Array<{ key: DragonSortKey; label: string }> = [
  { key: 'netBuy', label: '净买入' },
  { key: 'netSell', label: '净卖出' },
  { key: 'dealRatio', label: '榜单占比' },
  { key: 'change', label: '涨幅' }
];

onMounted(() => {
  sentimentHistory.value = loadHistory<SentimentHistoryPoint>(SENTIMENT_HISTORY_STORAGE_KEY);
  fundFlowHistory.value = loadHistory<FundFlowHistoryPoint>(FUND_FLOW_HISTORY_STORAGE_KEY);
  void refreshCurrent();
  refreshTimer = window.setInterval(() => void refreshCurrent(true), 30_000);
});
onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
});
watch(activeView, () => {
  selectedDragonStock.value = null;
  void refreshCurrent();
});

const activeViewLabel = computed(() => monitorViews.find((item) => item.key === activeView.value)?.label ?? '市场监控');
const currentLoading = computed(() => loadingView.value === activeView.value);
const currentError = computed(() => errors.value[activeView.value] ?? '');
const currentHasData = computed(() => {
  if (activeView.value === 'sentiment') return Boolean(sentiment.value);
  if (activeView.value === 'dragonTiger') return Boolean(dragonTiger.value?.rows.length);
  return Boolean(fundFlow.value?.sectors.length || fundFlow.value?.stocks.length);
});
const statusLabel = computed(() => {
  if (currentLoading.value) return `${activeViewLabel.value}同步中`;
  if (currentError.value) return currentError.value;
  if (activeView.value === 'sentiment' && sentiment.value) return `东方财富 / 新浪 · ${formatClock(sentiment.value.updatedAt)}`;
  if (activeView.value === 'dragonTiger' && dragonTiger.value) return `东方财富 · ${dragonTiger.value.tradeDate}`;
  if (activeView.value === 'fundFlow' && fundFlow.value) return `新浪资金 · ${formatClock(fundFlow.value.updatedAt)}`;
  return '待连接';
});
const advancingRatio = computed(() => sentiment.value?.total ? (sentiment.value.up / sentiment.value.total) * 100 : 0);
const decliningRatio = computed(() => sentiment.value?.total ? (sentiment.value.down / sentiment.value.total) * 100 : 0);
const sortedDragonRows = computed(() => {
  const query = dragonQuery.value.trim().toLocaleLowerCase();
  const rows = (dragonTiger.value?.rows ?? []).filter((row) => !query || [
    row.name,
    row.code,
    row.seatInsight,
    row.reason
  ].some((value) => value.toLocaleLowerCase().includes(query)));
  if (dragonSort.value === 'netSell') return rows.sort((a, b) => a.netAmount - b.netAmount);
  if (dragonSort.value === 'dealRatio') return rows.sort((a, b) => b.dealRatio - a.dealRatio);
  if (dragonSort.value === 'change') return rows.sort((a, b) => b.changePct - a.changePct);
  return rows.sort((a, b) => b.netAmount - a.netAmount);
});
const dragonStats = computed(() => {
  const rows = dragonTiger.value?.rows ?? [];
  return {
    total: rows.length,
    netBuyCount: rows.filter((row) => row.netAmount > 0).length,
    totalNet: rows.reduce((sum, row) => sum + row.netAmount, 0),
    topBuy: [...rows].sort((a, b) => b.netAmount - a.netAmount)[0] ?? null,
    topSell: [...rows].sort((a, b) => a.netAmount - b.netAmount)[0] ?? null
  };
});
const positiveCapitalSectors = computed(() => [...(fundFlow.value?.sectors ?? [])].filter((row) => row.netAmount > 0).sort((a, b) => b.netAmount - a.netAmount).slice(0, 8));
const negativeCapitalSectors = computed(() => [...(fundFlow.value?.sectors ?? [])].filter((row) => row.netAmount < 0).sort((a, b) => a.netAmount - b.netAmount).slice(0, 8));
const positiveCapitalStocks = computed(() => [...(fundFlow.value?.stocks ?? [])].filter((row) => row.netAmount > 0).sort((a, b) => b.netAmount - a.netAmount).slice(0, 8));
const negativeCapitalStocks = computed(() => [...(fundFlow.value?.stocks ?? [])].filter((row) => row.netAmount < 0).sort((a, b) => a.netAmount - b.netAmount).slice(0, 8));
const capitalStats = computed(() => {
  const sectors = fundFlow.value?.sectors ?? [];
  return {
    totalInflow: sectors.reduce((sum, row) => sum + row.inflow, 0),
    totalOutflow: sectors.reduce((sum, row) => sum + row.outflow, 0),
    totalNet: sectors.reduce((sum, row) => sum + row.netAmount, 0)
  };
});

async function refreshCurrent(force = false) {
  const view = activeView.value;
  if (loadingView.value) return;
  if (!force && ((view === 'sentiment' && sentiment.value) || (view === 'dragonTiger' && dragonTiger.value) || (view === 'fundFlow' && fundFlow.value))) return;

  loadingView.value = view;
  errors.value = { ...errors.value, [view]: '' };
  try {
    if (view === 'sentiment') {
      sentiment.value = await fetchMarketSentiment();
      sentimentHistory.value = appendSentimentHistory(sentimentHistory.value, sentiment.value);
      saveHistory(SENTIMENT_HISTORY_STORAGE_KEY, sentimentHistory.value);
    }
    if (view === 'dragonTiger') dragonTiger.value = await fetchDragonTigerList();
    if (view === 'fundFlow') {
      fundFlow.value = await fetchMarketFundFlow();
      fundFlowHistory.value = appendFundFlowHistory(fundFlowHistory.value, fundFlow.value);
      saveHistory(FUND_FLOW_HISTORY_STORAGE_KEY, fundFlowHistory.value);
    }
  } catch {
    errors.value = { ...errors.value, [view]: `${activeViewLabel.value}数据暂不可用` };
  } finally {
    if (loadingView.value === view) loadingView.value = '';
  }
}

function emitLimitStock(row: LimitPoolStock) {
  emit('selectStock', { code: row.code, name: row.name, price: 0, changePct: row.changePct, amount: row.amount, turnoverRate: row.turnoverRate });
}

function emitCapitalStock(row: CapitalFlowStock) {
  emit('selectStock', { code: row.code, name: row.name, price: row.price, changePct: row.changePct, amount: row.amount, turnoverRate: row.turnoverRate });
}

function priceClass(value: number | null | undefined) {
  if ((value ?? 0) > 0) return 'up';
  if ((value ?? 0) < 0) return 'down';
  return '';
}

function formatAmount(value: number) {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}亿`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)}万`;
  return `${Math.round(value)}`;
}

function formatPct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatPrice(value: number) {
  return value > 0 ? value.toFixed(2) : '--';
}

function formatRatio(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(0)}%` : '--';
}

function formatClock(value: number) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
</script>

<style scoped>
.market-monitor-shell { grid-template-rows: 46px minmax(0, 1fr); }
.market-monitor-heading { justify-content: space-between; padding-right: 10px; }
.monitor-actions { min-width: 0; display: flex; align-items: center; gap: 8px; }
.monitor-tabs { height: 30px; }
.monitor-tabs button { min-width: 70px; }
.monitor-mode-tabs { height: 28px; }
.monitor-mode-tabs button { min-width: 46px; }
.monitor-retry { height: 28px; padding: 0 12px; border: 1px solid rgba(var(--accent-rgb), .35); border-radius: 5px; background: transparent; color: var(--accent-bright); cursor: pointer; }
.monitor-view { min-width: 0; min-height: 0; overflow: hidden; }
.monitor-pulse-strip { height: 72px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border-bottom: 1px solid rgba(var(--border-rgb), .08); background: var(--bg-app); }
.monitor-pulse-strip > div { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-content: center; gap: 5px 8px; padding: 8px 13px; border-right: 1px solid rgba(var(--border-rgb), .07); }
.monitor-pulse-strip > div:last-child { border-right: 0; }
.monitor-pulse-strip span, .monitor-pulse-strip em { overflow: hidden; color: var(--text-muted); font-size: 10px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
.monitor-pulse-strip strong { grid-column: 1 / -1; overflow: hidden; color: var(--text-primary); font-size: 18px; text-overflow: ellipsis; white-space: nowrap; }
.monitor-pulse-strip strong b { font-size: inherit; }
.monitor-pulse-strip strong i { margin: 0 5px; color: var(--text-disabled); font-style: normal; font-weight: 400; }
.monitor-pulse-strip em { text-align: right; }
.primary-pulse { box-shadow: inset 3px 0 var(--accent); }
.sentiment-view { display: grid; grid-template-rows: 168px minmax(0, 1fr); }
.dragon-view, .fund-flow-view { display: grid; grid-template-rows: 72px minmax(0, 1fr); }
.dragon-view.detail-open { grid-template-rows: minmax(0, 1fr); }
.sentiment-workspace { min-width: 0; min-height: 0; display: grid; grid-template-columns: 340px minmax(0, 1fr); }
.sentiment-overview, .limit-leader-panel { min-width: 0; min-height: 0; overflow: hidden; }
.sentiment-overview { display: grid; grid-template-rows: 38px auto auto minmax(190px,1fr); border-right: 1px solid rgba(var(--border-rgb), .08); background: var(--bg-panel-alt); }
.monitor-section-title { height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 12px; border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.monitor-section-title > div { min-width: 0; display: flex; align-items: center; gap: 7px; color: var(--accent); }
.monitor-section-title strong { color: var(--text-primary); font-size: 12px; }
.monitor-section-title span { overflow: hidden; color: var(--text-subtle); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.up-bg { background: var(--market-up); }
.down-bg { background: var(--market-down); }
.flat-bg { background: var(--text-disabled); }
.index-pulse-list { border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.index-pulse-head, .index-pulse-row { height: 38px; display: grid; grid-template-columns: minmax(80px, 1fr) 70px 62px 80px; align-items: center; gap: 6px; padding: 0 12px; font-size: 10px; text-align: right; }
.index-pulse-head { height: 28px; color: var(--text-muted); background: var(--bg-elevated); }
.index-pulse-head span:first-child, .index-pulse-row strong { text-align: left; }
.index-pulse-row { border-top: 1px solid rgba(var(--border-rgb), .045); color: var(--text-secondary); }
.index-pulse-row strong { overflow: hidden; color: var(--text-primary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.sentiment-factor-list { margin: 12px; border-top: 1px solid rgba(var(--border-rgb), .07); }
.sentiment-factor-list div { height: 32px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(var(--border-rgb), .05); color: var(--text-muted); font-size: 10px; }
.sentiment-factor-list strong { font-size: 11px; }
.limit-leader-panel { display: grid; grid-template-rows: 38px minmax(0, 1fr); }
.limit-leader-table { min-height: 0; overflow-y: auto; }
.limit-leader-row { width: 100%; min-height: 43px; display: grid; grid-template-columns: 32px minmax(140px, 1fr) 56px 70px 54px 50px 82px; align-items: center; gap: 8px; padding: 0 11px; border: 0; border-bottom: 1px solid rgba(var(--border-rgb), .055); background: transparent; color: var(--text-secondary); font-size: 10px; text-align: left; }
button.limit-leader-row { cursor: pointer; }
button.limit-leader-row:hover { background: var(--bg-hover); }
.limit-leader-row.head { position: sticky; z-index: 2; top: 0; min-height: 29px; background: var(--bg-elevated); color: var(--text-subtle); font-weight: 700; }
.monitor-stock-name { min-width: 0; display: grid; gap: 3px; }
.monitor-stock-name strong, .monitor-stock-name em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.monitor-stock-name strong { color: var(--text-strong); font-size: 12px; }
.monitor-stock-name em { color: var(--text-subtle); font-size: 9px; font-style: normal; }
.streak-badge { color: var(--accent-bright); }
.dragon-table-shell { min-height: 0; display: grid; grid-template-rows: 42px minmax(0, 1fr); }
.dragon-toolbar { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 10px 0 13px; border-bottom: 1px solid rgba(var(--border-rgb), .07); background: var(--bg-panel-alt); }
.dragon-toolbar > div:first-child { min-width: 0; display: flex; align-items: center; gap: 7px; color: var(--accent); }
.dragon-toolbar strong { color: var(--text-primary); font-size: 12px; }
.dragon-toolbar span { color: var(--text-subtle); font-size: 10px; }
.dragon-toolbar-actions { display: flex; align-items: center; gap: 8px; }
.dragon-filter { width: 196px; height: 28px; display: flex; align-items: center; gap: 6px; padding: 0 7px; border: 1px solid rgba(var(--border-rgb), .09); border-radius: 5px; background: var(--bg-elevated); color: var(--text-subtle); }
.dragon-filter:focus-within { border-color: rgba(var(--accent-rgb), .48); color: var(--accent); }
.dragon-filter input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text-strong); font-size: 10px; }
.dragon-filter input::placeholder { color: var(--text-faint); }
.dragon-filter button { width: 16px; height: 16px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 3px; background: transparent; color: var(--text-muted); cursor: pointer; }
.dragon-filter button:hover { background: var(--bg-muted); color: var(--text-strong); }
.dragon-sort-tabs { height: 28px; }
.dragon-table { min-height: 0; overflow-y: auto; }
.dragon-row { width: 100%; min-height: 46px; display: grid; grid-template-columns: 32px minmax(125px, .9fr) 66px 88px 145px 72px minmax(150px, 1fr) minmax(170px, 1.2fr); align-items: center; gap: 9px; padding: 0 11px; border: 0; border-bottom: 1px solid rgba(var(--border-rgb), .055); background: transparent; color: var(--text-secondary); font-size: 10px; text-align: left; }
button.dragon-row { cursor: pointer; }
button.dragon-row:hover { background: var(--bg-hover); }
.dragon-row.head { position: sticky; z-index: 3; top: 0; min-height: 30px; background: var(--bg-elevated); color: var(--text-subtle); font-weight: 700; }
.dragon-filter-empty { height: 120px; display: grid; place-items: center; color: var(--text-subtle); font-size: 11px; }
.buy-sell-cell { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.buy-sell-cell i { color: var(--text-disabled); font-style: normal; }
.ellipsis-cell { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.capital-rank-grid { min-width: 0; min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); }
.capital-rank-panel { min-width: 0; min-height: 0; overflow-y: auto; border-right: 1px solid rgba(var(--border-rgb), .07); border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.capital-rank-panel:nth-child(2n) { border-right: 0; }
.capital-rank-panel:nth-child(n+3) { border-bottom: 0; }
.capital-rank-panel .monitor-section-title { position: sticky; z-index: 3; top: 0; background: var(--bg-panel); }
.capital-rank-head, .capital-rank-row { width: 100%; min-height: 31px; display: grid; grid-template-columns: 30px minmax(110px, 1fr) 66px 90px 58px; align-items: center; gap: 8px; padding: 0 11px; color: var(--text-muted); font-size: 10px; text-align: right; }
.capital-rank-head { position: sticky; z-index: 3; top: 38px; min-height: 27px; background: var(--bg-elevated); color: var(--text-faint); font-weight: 700; }
.capital-rank-head span:nth-child(2), .capital-rank-row .monitor-stock-name { text-align: left; }
.capital-rank-row { border: 0; border-top: 1px solid rgba(var(--border-rgb), .045); background: transparent; }
button.capital-rank-row { cursor: pointer; }
button.capital-rank-row:hover { background: var(--bg-hover); }
.capital-rank-row > strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-index { width: 23px; height: 23px; display: grid; place-items: center; border-radius: 4px; background: var(--bg-muted); color: var(--accent-bright); font-weight: 800; }
@media (max-width: 1260px) {
  .sentiment-workspace { grid-template-columns: 310px minmax(0, 1fr); }
  .dragon-row { grid-template-columns: 30px minmax(112px,.8fr) 60px 80px 126px 66px minmax(125px,1fr) minmax(145px,1.1fr); gap: 7px; padding: 0 9px; }
  .dragon-filter { width: 164px; }
  .limit-leader-row { grid-template-columns: 30px minmax(120px,1fr) 50px 62px 48px 44px 76px; gap: 6px; padding: 0 9px; }
}
</style>
