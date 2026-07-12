<template>
  <div class="dragon-seat-detail">
    <div class="dragon-detail-header">
      <button class="icon-button mini" type="button" title="返回龙虎榜" @click="emit('back')"><ArrowLeft :size="14" /></button>
      <div class="dragon-detail-title">
        <strong>{{ stock.name }}</strong>
        <span>{{ stock.code }} · 龙虎榜席位 B/S · 近一年</span>
      </div>
      <div class="marker-legend">
        <template v-if="chartMode === 'daily'">
          <span class="institution-buy">{{ selectedSeat ? 'B席位' : 'B机构' }}</span>
          <span class="institution-sell">{{ selectedSeat ? 'S席位' : 'S机构' }}</span>
          <template v-if="!selectedSeat"><span class="hot-buy">B游资</span><span class="hot-sell">S游资</span></template>
        </template>
        <template v-else>
          <span class="institution-buy">{{ selectedSeat ? 'B推演' : 'B大单' }}</span>
          <span class="institution-sell">{{ selectedSeat ? 'S推演' : 'S大单' }}</span>
        </template>
      </div>
      <div class="dragon-header-actions">
        <button class="watchlist-toggle-button" :class="{ active: watchlisted }" type="button" :title="watchlisted ? '从自选股移除' : '加入自选股'" @click="emit('toggleWatchlist', stockReference())">
          <Star :size="12" :fill="watchlisted ? 'currentColor' : 'none'" />
          <span>{{ watchlisted ? '删自选' : '加自选' }}</span>
        </button>
        <button class="open-stock-button" type="button" @click="openFullStock">
          <span>完整行情</span><ArrowRight :size="14" />
        </button>
      </div>
    </div>

    <div class="dragon-detail-metrics">
      <div><span>上榜日期</span><strong>{{ selectedDate || stock.tradeDate }}</strong></div>
      <div><span>{{ selectedSeat ? '席位买入' : '机构净额' }}</span><strong :class="selectedSeat ? 'up' : priceClass(selectedStats.institutionNet)">{{ formatAmount(selectedSeat ? selectedSeat.buyAmount : selectedStats.institutionNet) }}</strong></div>
      <div><span>{{ selectedSeat ? '席位卖出' : '知名游资净额' }}</span><strong :class="selectedSeat ? 'down' : priceClass(selectedStats.hotMoneyNet)">{{ formatAmount(selectedSeat ? selectedSeat.sellAmount : selectedStats.hotMoneyNet) }}</strong></div>
      <div><span>{{ selectedSeat ? '席位净额' : '全部席位净额' }}</span><strong :class="priceClass(selectedSeat ? selectedSeat.netAmount : selectedStats.totalNet)">{{ formatAmount(selectedSeat ? selectedSeat.netAmount : selectedStats.totalNet) }}</strong></div>
      <div><span>B/S 标记</span><strong>{{ activeMarkers.length }}</strong><em>{{ chartMode === 'daily' ? '近一年' : stock.tradeDate }}</em></div>
    </div>

    <div class="dragon-detail-workspace">
      <section class="dragon-marker-chart">
        <div class="dragon-chart-title">
          <div><strong>{{ chartMode === 'daily' ? '日 K 席位轨迹' : '分时大单轨迹' }}</strong><span>{{ chartSubtitle }}</span></div>
          <div class="dragon-chart-actions">
            <span v-if="loading"><RefreshCw :size="12" class="spin" /> 同步中</span>
            <button v-if="selectedSeat" class="selected-seat-chip" type="button" :title="`取消选择 ${selectedSeat.seatName}`" @click="selectedSeat = null">
              <span>{{ selectedSeat.seatLabel }}</span><X :size="11" />
            </button>
            <div class="mini-tabs chart-mode-tabs">
              <button type="button" :class="{ active: chartMode === 'daily' }" @click="chartMode = 'daily'">日 K</button>
              <button type="button" :class="{ active: chartMode === 'intraday' }" @click="chartMode = 'intraday'">分时</button>
            </div>
          </div>
        </div>
        <div v-if="loading && !activeCandles.length" class="dragon-detail-state"><RefreshCw :size="22" class="spin" /><strong>同步席位与行情</strong></div>
        <div v-else-if="!activeCandles.length" class="dragon-detail-state"><strong>暂无{{ chartMode === 'daily' ? '日 K' : '分时' }}数据</strong></div>
        <KLineChart
          v-else
          :key="chartMode"
          :candles="activeCandles"
          :mode="chartMode === 'daily' ? 'kline' : 'intraday'"
          :show-ma="chartMode === 'daily'"
          :show-volume="true"
          :markers="activeMarkers"
          :reference-price="intradayReferencePrice"
          :price-limit-pct="priceLimitPct"
        />
      </section>

      <aside class="dragon-seat-panel">
        <div class="seat-panel-toolbar">
          <select v-model="selectedDate" title="选择龙虎榜日期">
            <option v-for="date in seatDates" :key="date" :value="date">{{ date }}</option>
          </select>
          <div class="mini-tabs seat-filter-tabs">
            <button v-for="item in seatFilterOptions" :key="item.key" type="button" :class="{ active: seatFilter === item.key }" @click="seatFilter = item.key">{{ item.label }}</button>
          </div>
        </div>
        <div class="seat-table-head">
          <span>席位 / 画像</span>
          <button type="button" :class="{ active: seatSort.key === 'buy' }" @click="toggleSeatSort('buy')">买入<component :is="seatSortIcon('buy')" :size="10" /></button>
          <button type="button" :class="{ active: seatSort.key === 'sell' }" @click="toggleSeatSort('sell')">卖出<component :is="seatSortIcon('sell')" :size="10" /></button>
          <button type="button" :class="{ active: seatSort.key === 'net' }" @click="toggleSeatSort('net')">净额<component :is="seatSortIcon('net')" :size="10" /></button>
        </div>
        <div v-if="error" class="dragon-detail-state compact"><strong>{{ error }}</strong></div>
        <div v-else-if="!visibleSeats.length" class="dragon-detail-state compact"><strong>该分类暂无席位</strong></div>
        <div v-else class="seat-list">
          <button
            v-for="row in visibleSeats"
            :key="seatKey(row)"
            type="button"
            class="seat-row"
            :class="{ selected: selectedSeat && seatKey(selectedSeat) === seatKey(row) }"
            @click="toggleSeat(row)"
          >
            <span class="seat-name" :title="row.seatName">
              <strong :title="row.seatName">{{ row.seatName }}</strong>
              <em><b :class="`seat-type-${row.seatType}`">{{ row.seatLabel }}</b><template v-if="row.successRate !== null"> · 3日胜率 {{ row.successRate.toFixed(0) }}%</template></em>
            </span>
            <span class="up">{{ formatCompactAmount(row.buyAmount) }}</span>
            <span class="down">{{ formatCompactAmount(row.sellAmount) }}</span>
            <strong :class="priceClass(row.netAmount)">{{ formatCompactAmount(row.netAmount) }}</strong>
          </button>
        </div>
        <div class="seat-source-note">{{ selectedSeat ? `已选择 ${selectedSeat.seatLabel}；日 K 为公开数据，分时为逐笔方向推演。` : '点击右侧席位查看对应 B/S；游资别名不代表个人身份确认。' }}</div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronsUpDown, RefreshCw, Star, X } from '@lucide/vue';
import KLineChart from '@/components/KLineChart.vue';
import { fetchDragonTigerSeatHistory, fetchIntradayTradeTicks } from '@/services/marketMonitorProvider';
import { fetchSinaDailyCandles } from '@/services/historicalCandles';
import { fetchHotStockIntraday } from '@/services/sectorProvider';
import type { Candle, ChartMarker } from '@/types/market';
import type { DragonTigerRow, DragonTigerSeatRow, IntradayTradeTick, MonitorStockReference } from '@/types/marketMonitor';

type SeatFilter = 'all' | 'institution' | 'hotMoney' | 'branch';
type SeatSortKey = 'buy' | 'sell' | 'net';

const props = defineProps<{ stock: DragonTigerRow; watchlisted: boolean }>();
const emit = defineEmits<{
  back: [];
  openStock: [stock: MonitorStockReference];
  toggleWatchlist: [stock: MonitorStockReference];
}>();
const dailyCandles = ref<Candle[]>([]);
const intradayCandles = ref<Candle[]>([]);
const intradayTrades = ref<IntradayTradeTick[]>([]);
const seats = ref<DragonTigerSeatRow[]>([]);
const loading = ref(false);
const error = ref('');
const selectedDate = ref(props.stock.tradeDate);
const seatFilter = ref<SeatFilter>('all');
const chartMode = ref<'daily' | 'intraday'>('daily');
const selectedSeat = ref<DragonTigerSeatRow | null>(null);
const seatSort = ref<{ key: SeatSortKey; direction: 'asc' | 'desc' }>({ key: 'net', direction: 'desc' });
const seatFilterOptions: Array<{ key: SeatFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'institution', label: '机构' },
  { key: 'hotMoney', label: '知名游资' },
  { key: 'branch', label: '营业部' }
];

onMounted(() => void loadDetail());

const seatDates = computed(() => [...new Set(seats.value.map((row) => row.tradeDate))].sort((a, b) => b.localeCompare(a)));
const selectedDateSeats = computed(() => seats.value.filter((row) => row.tradeDate === selectedDate.value));
const visibleSeats = computed(() => selectedDateSeats.value
  .filter((row) => {
    if (seatFilter.value === 'all') return true;
    if (seatFilter.value === 'institution') return row.seatType === 'institution' || row.seatType === 'northbound';
    return row.seatType === seatFilter.value;
  })
  .sort((a, b) => {
    const key = seatSort.value.key === 'buy' ? 'buyAmount' : seatSort.value.key === 'sell' ? 'sellAmount' : 'netAmount';
    const difference = a[key] - b[key];
    return seatSort.value.direction === 'asc' ? difference : -difference;
  }));
const selectedStats = computed(() => selectedDateSeats.value.reduce((stats, row) => {
  stats.totalNet += row.netAmount;
  if (row.seatType === 'institution' || row.seatType === 'northbound') stats.institutionNet += row.netAmount;
  if (row.seatType === 'hotMoney') stats.hotMoneyNet += row.netAmount;
  return stats;
}, { institutionNet: 0, hotMoneyNet: 0, totalNet: 0 }));
const dailyChartMarkers = computed<ChartMarker[]>(() => {
  const candleTimes = new Map(dailyCandles.value.map((candle) => [dateKey(candle.time), candle.time]));
  if (selectedSeat.value) return buildSelectedSeatDailyMarkers(selectedSeat.value, seats.value, candleTimes);
  const groups = new Map<string, { date: string; kind: 'institution' | 'hotMoney'; net: number }>();

  for (const row of seats.value) {
    const kind = row.seatType === 'hotMoney'
      ? 'hotMoney'
      : row.seatType === 'institution' || row.seatType === 'northbound' ? 'institution' : null;
    if (!kind || !candleTimes.has(row.tradeDate)) continue;
    const key = `${row.tradeDate}:${kind}`;
    const group = groups.get(key) ?? { date: row.tradeDate, kind, net: 0 };
    group.net += row.netAmount;
    groups.set(key, group);
  }

  return [...groups.values()].flatMap((group): ChartMarker[] => {
    const time = candleTimes.get(group.date);
    if (!time || Math.abs(group.net) < 1) return [];
    const buy = group.net > 0;
    const institution = group.kind === 'institution';
    return [{
      time,
      position: buy ? 'belowBar' : 'aboveBar',
      color: institution ? (buy ? '#d94f4f' : '#22a06b') : (buy ? '#d7a642' : '#41c6c3'),
      shape: buy ? 'arrowUp' : 'arrowDown',
      text: `${buy ? 'B' : 'S'}${institution ? '机构' : '游资'}`,
      size: 1
    }];
  }).sort((a, b) => a.time - b.time);
});
const intradayChartMarkers = computed<ChartMarker[]>(() => selectedSeat.value
  ? buildSeatProjectedMarkers(intradayTrades.value, selectedSeat.value)
  : buildIntradayMarkers(intradayTrades.value));
const activeCandles = computed(() => chartMode.value === 'daily' ? dailyCandles.value : intradayCandles.value);
const activeMarkers = computed(() => chartMode.value === 'daily' ? dailyChartMarkers.value : intradayChartMarkers.value);
const chartSubtitle = computed(() => {
  if (!selectedSeat.value) return chartMode.value === 'daily' ? '机构含机构专用与沪深股通' : '逐笔主动买卖按分钟聚合';
  if (chartMode.value === 'daily') return `${selectedSeat.value.seatLabel}公开上榜日 B/S`;
  return `${selectedSeat.value.seatLabel}按逐笔方向推演，非精确成交时点`;
});
const intradayReferencePrice = computed(() => {
  const previous = dailyCandles.value.filter((candle) => dateKey(candle.time) < props.stock.tradeDate).at(-1);
  if (previous) return previous.close;
  return props.stock.price > 0 && props.stock.changePct !== -100 ? props.stock.price / (1 + props.stock.changePct / 100) : null;
});
const priceLimitPct = computed(() => stockPriceLimitPct(props.stock.code, props.stock.name));

watch(selectedDate, () => {
  selectedSeat.value = null;
});

async function loadDetail() {
  loading.value = true;
  error.value = '';
  const [dailyResult, seatResult, intradayResult, tradeResult] = await Promise.allSettled([
    fetchSinaDailyCandles(props.stock.code),
    fetchDragonTigerSeatHistory(props.stock.code),
    fetchHotStockIntraday(props.stock.code),
    fetchIntradayTradeTicks(props.stock.code, props.stock.tradeDate)
  ]);
  if (dailyResult.status === 'fulfilled') dailyCandles.value = dailyResult.value.slice(-180);
  if (intradayResult.status === 'fulfilled') intradayCandles.value = alignIntradayDate(intradayResult.value, props.stock.tradeDate);
  if (tradeResult.status === 'fulfilled') intradayTrades.value = tradeResult.value;
  if (seatResult.status === 'fulfilled') {
    seats.value = seatResult.value.rows;
    if (!seatDates.value.includes(selectedDate.value)) selectedDate.value = seatDates.value[0] ?? props.stock.tradeDate;
  } else {
    error.value = '席位明细暂不可用';
  }
  loading.value = false;
}

function openFullStock() {
  emit('openStock', stockReference());
}

function stockReference(): MonitorStockReference {
  return {
    code: props.stock.code,
    name: props.stock.name,
    price: props.stock.price,
    changePct: props.stock.changePct,
    amount: props.stock.dealAmount,
    turnoverRate: props.stock.turnoverRate
  };
}

function toggleSeat(row: DragonTigerSeatRow) {
  selectedSeat.value = selectedSeat.value && seatKey(selectedSeat.value) === seatKey(row) ? null : row;
}

function toggleSeatSort(key: SeatSortKey) {
  seatSort.value = seatSort.value.key === key
    ? { key, direction: seatSort.value.direction === 'desc' ? 'asc' : 'desc' }
    : { key, direction: 'desc' };
}

function seatSortIcon(key: SeatSortKey) {
  if (seatSort.value.key !== key) return ChevronsUpDown;
  return seatSort.value.direction === 'desc' ? ArrowDown : ArrowUp;
}

function seatKey(row: DragonTigerSeatRow) {
  return `${row.tradeDate}:${row.seatCode}:${row.seatName}:${row.buyAmount}:${row.sellAmount}`;
}

function buildSelectedSeatDailyMarkers(
  selected: DragonTigerSeatRow,
  allSeats: DragonTigerSeatRow[],
  candleTimes: Map<string, number>
): ChartMarker[] {
  const matchingSeats = selected.seatCode && selected.seatCode !== '0'
    ? allSeats.filter((row) => row.seatCode === selected.seatCode)
    : selected.seatType === 'hotMoney'
      ? allSeats.filter((row) => row.seatLabel === selected.seatLabel)
      : [selected];

  return matchingSeats.flatMap((row): ChartMarker[] => {
    const time = candleTimes.get(row.tradeDate);
    if (!time) return [];
    const markers: ChartMarker[] = [];
    if (row.buyAmount > 0) markers.push({ time, position: 'belowBar', color: '#d94f4f', shape: 'arrowUp', text: 'B', size: 1 });
    if (row.sellAmount > 0) markers.push({ time, position: 'aboveBar', color: '#22a06b', shape: 'arrowDown', text: 'S', size: 1 });
    return markers;
  }).sort((a, b) => a.time - b.time);
}

function buildIntradayMarkers(ticks: IntradayTradeTick[]): ChartMarker[] {
  const flows = aggregateIntradayFlows(ticks);
  const magnitudes = flows.map((row) => Math.abs(row.net)).filter((value) => value > 0).sort((a, b) => a - b);
  if (!magnitudes.length) return [];
  const threshold = magnitudes[Math.floor((magnitudes.length - 1) * 0.7)] ?? 0;
  const strongestByBucket = new Map<number, typeof flows[number]>();
  for (const row of flows) {
    const bucket = intradayBucket(row.time);
    if (bucket === null || Math.abs(row.net) < threshold) continue;
    const current = strongestByBucket.get(bucket);
    if (!current || Math.abs(row.net) > Math.abs(current.net)) strongestByBucket.set(bucket, row);
  }
  const selected = [...strongestByBucket.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 8);

  return selected.map((row): ChartMarker => {
    const buy = row.net > 0;
    return {
      time: row.time,
      position: 'inBar',
      color: buy ? '#d94f4f' : '#22a06b',
      shape: buy ? 'arrowUp' : 'arrowDown',
      text: buy ? 'B' : 'S',
      size: 1
    };
  }).sort((a, b) => a.time - b.time);
}

function buildSeatProjectedMarkers(ticks: IntradayTradeTick[], seat: DragonTigerSeatRow): ChartMarker[] {
  const flows = aggregateIntradayFlows(ticks);
  const strongestBySideAndBucket = new Map<string, typeof flows[number]>();
  for (const row of flows) {
    const bucket = intradayBucket(row.time);
    if (bucket === null || row.net === 0) continue;
    const side = row.net > 0 ? 'buy' : 'sell';
    const key = `${side}:${bucket}`;
    const current = strongestBySideAndBucket.get(key);
    if (!current || Math.abs(row.net) > Math.abs(current.net)) strongestBySideAndBucket.set(key, row);
  }

  const gross = seat.buyAmount + seat.sellAmount;
  let buyCount = seat.buyAmount > 0 ? Math.max(1, Math.round(6 * seat.buyAmount / Math.max(gross, 1))) : 0;
  let sellCount = seat.sellAmount > 0 ? Math.max(1, 6 - buyCount) : 0;
  buyCount = Math.min(4, buyCount);
  sellCount = Math.min(4, sellCount);
  const candidates = [...strongestBySideAndBucket.values()];
  const selected = [
    ...candidates.filter((row) => row.net > 0).sort((a, b) => b.net - a.net).slice(0, buyCount),
    ...candidates.filter((row) => row.net < 0).sort((a, b) => a.net - b.net).slice(0, sellCount)
  ];

  return selected.map((row): ChartMarker => {
    const buy = row.net > 0;
    return {
      time: row.time,
      position: 'inBar',
      color: buy ? '#d94f4f' : '#22a06b',
      shape: buy ? 'arrowUp' : 'arrowDown',
      text: buy ? 'B*' : 'S*',
      size: 1
    };
  }).sort((a, b) => a.time - b.time);
}

function aggregateIntradayFlows(ticks: IntradayTradeTick[]) {
  const byMinute = new Map<number, { time: number; buy: number; sell: number }>();
  for (const tick of ticks) {
    if (tick.side === 'neutral') continue;
    const time = Math.floor(tick.time / 60) * 60;
    const row = byMinute.get(time) ?? { time, buy: 0, sell: 0 };
    const activeAmount = tick.amount || tick.price * tick.volume;
    if (tick.side === 'buy') row.buy += activeAmount;
    if (tick.side === 'sell') row.sell += activeAmount;
    byMinute.set(time, row);
  }
  return [...byMinute.values()].map((row) => ({ ...row, net: row.buy - row.sell }));
}

function intradayBucket(time: number) {
  const date = new Date(time * 1000);
  const minute = date.getHours() * 60 + date.getMinutes();
  if (minute < 9 * 60 + 35 || minute > 14 * 60 + 55 || (minute > 11 * 60 + 30 && minute < 13 * 60)) return null;
  const compressedMinute = minute >= 13 * 60 ? minute - 90 : minute;
  return Math.floor((compressedMinute - (9 * 60 + 30)) / 30);
}

function alignIntradayDate(candles: Candle[], tradeDate: string) {
  return candles.map((candle) => {
    const source = new Date(candle.time * 1000);
    const time = Math.floor(new Date(
      `${tradeDate.replace(/-/g, '/')} ${String(source.getHours()).padStart(2, '0')}:${String(source.getMinutes()).padStart(2, '0')}:00`
    ).getTime() / 1000);
    return { ...candle, time };
  });
}

function stockPriceLimitPct(code: string, name: string) {
  const normalizedName = name.toUpperCase();
  if (normalizedName.startsWith('N') || normalizedName.startsWith('C')) return null;
  if (normalizedName.includes('ST')) return 5;
  if (code.startsWith('8') || code.startsWith('4') || code.startsWith('920')) return 30;
  if (code.startsWith('300') || code.startsWith('301') || code.startsWith('302') || code.startsWith('688') || code.startsWith('689')) return 20;
  return 10;
}

function dateKey(timestamp: number) {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function priceClass(value: number) {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return '';
}

function formatAmount(value: number) {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}亿`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)}万`;
  return `${Math.round(value)}`;
}

function formatCompactAmount(value: number) {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}亿`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(0)}万`;
  return `${Math.round(value)}`;
}
</script>

<style scoped>
.dragon-seat-detail { min-width: 0; min-height: 0; display: grid; grid-template-rows: 50px 62px minmax(0, 1fr); }
.dragon-detail-header { min-width: 0; display: grid; grid-template-columns: 28px minmax(170px, 1fr) auto auto; align-items: center; gap: 10px; padding: 0 12px; border-bottom: 1px solid rgba(var(--border-rgb), .08); background: var(--bg-app); }
.dragon-detail-title { min-width: 0; }
.dragon-detail-title strong, .dragon-detail-title span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dragon-detail-title strong { color: var(--text-strong); font-size: 15px; }
.dragon-detail-title span { margin-top: 3px; color: var(--text-muted); font-size: 10px; }
.marker-legend { display: flex; align-items: center; gap: 5px; }
.marker-legend span { height: 22px; display: inline-flex; align-items: center; padding: 0 6px; border: 1px solid rgba(var(--border-rgb), .08); border-radius: 4px; background: var(--bg-elevated); font-size: 9px; font-weight: 800; }
.institution-buy { color: var(--market-up); }
.institution-sell { color: var(--market-down); }
.hot-buy { color: var(--accent); }
.hot-sell { color: #41c6c3; }
.dragon-header-actions { display: flex; align-items: center; gap: 6px; }
.watchlist-toggle-button { height: 28px; display: inline-flex; align-items: center; gap: 5px; padding: 0 8px; border: 1px solid rgba(var(--border-rgb), .1); border-radius: 5px; background: var(--bg-elevated); color: var(--text-secondary); font-size: 10px; cursor: pointer; }
.watchlist-toggle-button:hover { color: var(--accent-bright); border-color: rgba(var(--accent-rgb), .36); }
.watchlist-toggle-button.active { color: var(--accent-bright); border-color: rgba(var(--accent-rgb), .32); background: rgba(var(--accent-rgb), .08); }
.open-stock-button { height: 28px; display: inline-flex; align-items: center; gap: 5px; padding: 0 9px; border: 1px solid rgba(var(--accent-rgb), .3); border-radius: 5px; background: transparent; color: var(--accent-bright); font-size: 10px; cursor: pointer; }
.dragon-detail-metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border-bottom: 1px solid rgba(var(--border-rgb), .08); }
.dragon-detail-metrics > div { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-content: center; gap: 5px 8px; padding: 7px 12px; border-right: 1px solid rgba(var(--border-rgb), .06); }
.dragon-detail-metrics > div:last-child { border-right: 0; }
.dragon-detail-metrics span, .dragon-detail-metrics em { color: var(--text-muted); font-size: 9px; font-style: normal; }
.dragon-detail-metrics strong { grid-column: 1 / -1; overflow: hidden; color: var(--text-primary); font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.dragon-detail-metrics em { text-align: right; }
.dragon-detail-workspace { min-width: 0; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 432px; }
.dragon-marker-chart { min-width: 0; min-height: 0; display: grid; grid-template-rows: 38px minmax(0, 1fr); border-right: 1px solid rgba(var(--border-rgb), .08); }
.dragon-chart-title { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 12px; border-bottom: 1px solid rgba(var(--border-rgb), .06); background: var(--bg-panel-alt); }
.dragon-chart-title > div { min-width: 0; display: flex; align-items: center; gap: 10px; }
.dragon-chart-title strong { color: var(--text-primary); font-size: 11px; }
.dragon-chart-title span { display: inline-flex; align-items: center; gap: 5px; color: var(--text-subtle); font-size: 9px; white-space: nowrap; }
.dragon-chart-actions { display: flex; align-items: center; gap: 8px; }
.selected-seat-chip { max-width: 92px; height: 23px; display: inline-flex; align-items: center; gap: 4px; padding: 0 5px 0 7px; border: 1px solid rgba(var(--accent-rgb), .32); border-radius: 4px; background: var(--accent-soft); color: var(--accent-bright); cursor: pointer; }
.selected-seat-chip span { overflow: hidden; color: inherit; text-overflow: ellipsis; white-space: nowrap; }
.chart-mode-tabs { height: 28px; }
.chart-mode-tabs button { min-width: 42px; }
.dragon-seat-panel { min-width: 0; min-height: 0; overflow: hidden; display: grid; grid-template-rows: 38px 28px minmax(0, 1fr) 30px; background: var(--bg-panel-alt); }
.seat-panel-toolbar { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 7px; padding: 0 7px; border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.seat-panel-toolbar select { width: 108px; height: 26px; border: 1px solid rgba(var(--border-rgb), .09); border-radius: 5px; outline: 0; background: var(--bg-elevated); color: var(--text-strong); padding: 0 6px; font-size: 10px; }
.seat-filter-tabs { min-width: 0; height: 28px; }
.seat-filter-tabs button { padding: 0 6px; font-size: 9px; }
.seat-table-head, .seat-row { min-width: 0; display: grid; grid-template-columns: 206px 64px 64px 70px; align-items: center; justify-content: start; gap: 0; padding: 0 8px; text-align: right; font-variant-numeric: tabular-nums; }
.seat-table-head { color: var(--text-faint); font-size: 9px; background: var(--bg-elevated); }
.seat-table-head span:first-child, .seat-name { text-align: left; }
.seat-table-head button { height: 28px; min-width: 0; display: inline-flex; align-items: center; justify-content: flex-end; gap: 3px; padding: 0 0 0 7px; border: 0; border-left: 1px solid rgba(var(--border-rgb), .045); background: transparent; color: var(--text-faint); font-size: 9px; cursor: pointer; }
.seat-table-head button:hover { color: var(--text-primary); background: rgba(var(--border-rgb), .025); }
.seat-table-head button.active { color: var(--accent-bright); }
.seat-row > span:not(:first-child), .seat-row > strong { min-width: 0; padding-left: 7px; border-left: 1px solid rgba(var(--border-rgb), .045); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.seat-list { min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto; }
.seat-row { min-height: 43px; border-bottom: 1px solid rgba(var(--border-rgb), .05); color: var(--text-secondary); font-size: 9px; }
button.seat-row { border: 0; border-bottom: 1px solid rgba(var(--border-rgb), .05); background: transparent; cursor: pointer; }
button.seat-row:hover { background: var(--bg-hover); }
button.seat-row.selected { background: var(--accent-soft); box-shadow: inset 3px 0 var(--accent); }
.seat-name { min-width: 0; display: grid; gap: 4px; }
.seat-name > strong { overflow: hidden; color: var(--text-primary); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.seat-name em { overflow: hidden; color: var(--text-subtle); font-size: 8px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
.seat-name b { padding: 1px 4px; border-radius: 3px; background: var(--bg-muted); color: var(--text-secondary); font-weight: 700; }
.seat-name .seat-type-institution, .seat-name .seat-type-northbound { color: var(--accent-bright); }
.seat-name .seat-type-hotMoney { color: var(--accent); }
.seat-source-note { display: flex; align-items: center; padding: 0 9px; border-top: 1px solid rgba(var(--border-rgb), .06); color: var(--text-muted); font-size: 8px; white-space: nowrap; }
.dragon-detail-state { min-height: 0; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--text-muted); }
.dragon-detail-state strong { font-size: 11px; }
.dragon-detail-state.compact { min-height: 100%; }
.up { color: var(--market-up) !important; }
.down { color: var(--market-down) !important; }
@media (max-width: 1260px) {
  .dragon-detail-workspace { grid-template-columns: minmax(0, 1fr) 386px; }
  .dragon-detail-header { grid-template-columns: 28px minmax(150px, 1fr) auto auto; }
  .seat-table-head, .seat-row { grid-template-columns: 184px 58px 58px 66px; padding: 0 7px; }
}
</style>
