<template>
  <main class="tab-page sector-page">
    <section class="tab-hero sector-shell">
      <div class="tab-heading sector-heading">
        <div class="heading-title">
          <TrendingUp :size="22" />
          <strong>热门股票</strong>
          <span>{{ status }}</span>
        </div>
        <div class="sector-actions">
          <div class="mini-tabs sector-tabs">
            <button v-for="item in sortOptions" :key="item.key" type="button" :class="{ active: sort === item.key }" @click="emit('update:sort', item.key)">{{ item.label }}</button>
          </div>
          <button class="icon-button mini" :class="{ active: loading }" type="button" title="刷新股票" @click="emit('refresh')">
            <RefreshCw :size="14" />
          </button>
        </div>
      </div>

      <div v-if="selectedStock" class="hot-stock-detail">
        <div class="hot-stock-detail-bar" :class="{ 'is-intraday': timeframe === 'fs' }">
          <button class="icon-button mini" type="button" title="返回热门股票" @click="emit('close-detail')">
            <ArrowLeft :size="14" />
          </button>
          <div class="hot-stock-title">
            <strong>{{ selectedStock.name }}</strong>
            <span>{{ selectedStock.code }} · {{ timeframeLabel(timeframe) }} · {{ updatedLabel }}</span>
          </div>
          <button
            class="watchlist-toggle-button"
            :class="{ active: watchlisted }"
            type="button"
            :title="watchlisted ? '从自选股移除' : '加入自选股'"
            @click="emit('toggle-watchlist', selectedStock)"
          >
            <Star :size="13" :fill="watchlisted ? 'currentColor' : 'none'" />
            <span>{{ watchlisted ? '删自选' : '加自选' }}</span>
          </button>
          <div class="segmented hot-stock-timeframes">
            <button v-for="item in TIMEFRAME_OPTIONS" :key="item.key" type="button" :class="{ active: timeframe === item.key }" @click="emit('update:timeframe', item.key)">
              {{ item.label }}
            </button>
          </div>
          <div v-if="timeframe !== 'fs'" class="mini-tabs adjustment-tabs" aria-label="复权方式">
            <button v-for="item in ADJUSTMENT_OPTIONS" :key="item.key" type="button" :class="{ active: adjustmentMode === item.key }" @click="emit('update:adjustment-mode', item.key)">{{ item.label }}</button>
          </div>
          <button class="icon-button mini" type="button" :title="`刷新${timeframeLabel(timeframe)}`" @click="emit('refresh-candles')">
            <RefreshCw :size="14" />
          </button>
          <div class="hot-stock-price">
            <strong :class="priceClass(selectedStock.changePct)">{{ formatPrice(selectedStock.price) }}</strong>
            <span :class="priceClass(selectedStock.changePct)">{{ formatPct(selectedStock.changePct) }}</span>
          </div>
        </div>

        <div class="hot-stock-metrics">
          <div><span>今开</span><strong>{{ formatPrice(selectedStock.open) }}</strong></div>
          <div><span>最高</span><strong class="up">{{ formatPrice(selectedStock.high) }}</strong></div>
          <div><span>最低</span><strong class="down">{{ formatPrice(selectedStock.low) }}</strong></div>
          <div><span>均价</span><strong>{{ formatPrice(averagePrice) }}</strong></div>
          <div><span>换手</span><strong>{{ selectedStock.turnoverRate.toFixed(2) }}%</strong></div>
          <div><span>量比</span><strong>{{ selectedStock.volumeRatio.toFixed(2) }}</strong></div>
          <div><span>振幅</span><strong>{{ selectedStock.amplitude.toFixed(2) }}%</strong></div>
          <div><span>主力净比</span><strong :class="priceClass(selectedStock.mainNetInflowPct)">{{ formatPct(selectedStock.mainNetInflowPct) }}</strong></div>
          <div><span>成交额</span><strong>{{ formatAmount(selectedStock.amount) }}</strong></div>
          <div><span>流通值</span><strong>{{ formatAmount(selectedStock.floatMarketCap) }}</strong></div>
          <div><span>总市值</span><strong>{{ formatAmount(selectedStock.marketCap) }}</strong></div>
          <div><span>PE</span><strong>{{ formatNullable(selectedStock.pe, 1) }}</strong></div>
        </div>

        <section class="hot-stock-chart">
          <div v-if="candlesLoading && !candles.length" class="tab-empty compact">
            <RefreshCw :size="22" class="spin" />
            <strong>同步{{ timeframeLabel(timeframe) }}中</strong>
          </div>
          <div v-else-if="!candles.length" class="tab-empty compact">
            <TrendingDown :size="22" />
            <strong>暂无{{ timeframeLabel(timeframe) }}数据</strong>
          </div>
          <KLineChart
            v-else
            :key="`${selectedStock.code}-${candleVariantKey(timeframe, adjustmentMode)}`"
            :candles="candles"
            :mode="timeframe === 'fs' ? 'intraday' : 'kline'"
            :show-ma="timeframe !== 'fs'"
            :show-volume="true"
            :reference-price="selectedStock.prevClose"
            :price-limit-pct="stockLimitPct(selectedStock.code, selectedStock.name)"
          />
        </section>
      </div>
      <div v-else-if="loading && !rows.length" class="tab-empty">
        <RefreshCw :size="26" class="spin" />
        <strong>同步股票中</strong>
      </div>
      <div v-else-if="!rows.length" class="tab-empty">
        <TrendingUp :size="26" />
        <strong>暂无热门股票</strong>
      </div>
      <div v-else class="hot-stock-board">
        <div class="market-pulse-strip hot-stock-pulse">
          <div><span>热度领跑</span><strong>{{ stats.leader?.name || '--' }}</strong><em :class="priceClass(stats.leader?.changePct)">{{ stats.leader ? formatPct(stats.leader.changePct) : '--' }}</em></div>
          <div><span>高活跃股票</span><strong>{{ stats.strongCount }}</strong><em>综合热度 ≥ 60</em></div>
          <div><span>高换手股票</span><strong>{{ stats.highTurnoverCount }}</strong><em>换手率 ≥ 10%</em></div>
          <div><span>平均换手</span><strong>{{ stats.averageTurnover.toFixed(2) }}%</strong><em>{{ rows.length }} 只样本</em></div>
          <div><span>样本成交</span><strong>{{ formatAmount(stats.totalAmount) }}</strong><em>当前样本排行</em></div>
        </div>

        <div class="hot-stock-scan-table">
          <div class="hot-stock-scan-row head"><span>#</span><span>股票 / 状态</span><span>热度</span><span>现价</span><span>涨幅</span><span>换手 / 量比</span><span>成交额</span><span>振幅</span></div>
          <button v-for="(row, index) in rows" :key="row.code" type="button" class="hot-stock-scan-row" @click="emit('select-stock', row)">
            <span class="rank-index hot-rank">{{ index + 1 }}</span>
            <span class="rank-name"><strong>{{ row.name }}</strong><em>{{ row.code }} · {{ hotStockHeatLabel(row, maxAmount) }}</em></span>
            <span class="stock-heat"><strong>{{ hotStockHeatScore(row, maxAmount) }}</strong><i><b :style="{ width: `${hotStockHeatScore(row, maxAmount)}%` }" /></i></span>
            <strong>{{ formatPrice(row.price) }}</strong>
            <strong :class="priceClass(row.changePct)">{{ formatPct(row.changePct) }}</strong>
            <span class="stock-activity"><strong>{{ row.turnoverRate.toFixed(1) }}%</strong><em>量比 {{ row.volumeRatio > 0 ? row.volumeRatio.toFixed(2) : '--' }}</em></span>
            <span>{{ formatAmount(row.amount) }}</span>
            <span>{{ row.amplitude.toFixed(2) }}%</span>
          </button>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ArrowLeft, RefreshCw, Star, TrendingDown, TrendingUp } from '@lucide/vue';
import KLineChart from '@/components/KLineChart.vue';
import { ADJUSTMENT_OPTIONS, TIMEFRAME_OPTIONS } from '@/constants/marketOptions';
import { candleVariantKey } from '@/services/adjustment';
import type { AdjustmentMode, Candle, Timeframe } from '@/types/market';
import type { HotStockRow, HotStockSortKey } from '@/types/sector';
import { hotStockHeatLabel, hotStockHeatScore } from '@/utils/marketRanking';
import { formatAmount, formatNullable, formatPct, formatPrice, priceClass, stockLimitPct } from '@/utils/marketFormatters';

interface HotStockStats {
  leader: HotStockRow | null;
  strongCount: number;
  highTurnoverCount: number;
  averageTurnover: number;
  totalAmount: number;
}

defineProps<{
  status: string;
  loading: boolean;
  sort: HotStockSortKey;
  rows: HotStockRow[];
  stats: HotStockStats;
  selectedStock: HotStockRow | null;
  candles: Candle[];
  candlesLoading: boolean;
  timeframe: Timeframe;
  adjustmentMode: AdjustmentMode;
  averagePrice: number | null;
  updatedLabel: string;
  watchlisted: boolean;
  maxAmount: number;
}>();

const emit = defineEmits<{
  'update:sort': [value: HotStockSortKey];
  'update:timeframe': [value: Timeframe];
  'update:adjustment-mode': [value: AdjustmentMode];
  refresh: [];
  'select-stock': [row: HotStockRow];
  'close-detail': [];
  'refresh-candles': [];
  'toggle-watchlist': [row: HotStockRow];
}>();

const sortOptions: Array<{ key: HotStockSortKey; label: string }> = [
  { key: 'hot', label: '综合热度' },
  { key: 'change', label: '涨幅' },
  { key: 'amount', label: '成交' },
  { key: 'turnover', label: '换手' }
];

function timeframeLabel(value: Timeframe) {
  return TIMEFRAME_OPTIONS.find((item) => item.key === value)?.label ?? value;
}
</script>
