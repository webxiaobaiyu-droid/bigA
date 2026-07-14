<template>
  <main class="chart-pane" :class="{ 'finance-expanded': infoExpanded }">
    <section class="instrument-bar">
      <div class="instrument-title">
        <div class="market-badge">{{ instrument.meta.market }}</div>
        <div>
          <h1>{{ instrument.meta.name }}</h1>
          <span>{{ instrument.meta.code }} · {{ instrument.meta.sector }} · {{ instrument.indicators.trendLabel }}</span>
        </div>
        <button class="icon-button instrument-watch-button active" type="button" title="从自选股移除" @click="emit('remove-stock', instrument.meta.code)">
          <Star :size="15" fill="currentColor" />
        </button>
      </div>

      <div class="instrument-price">
        <strong :class="priceClass(instrument.quote.changePct)">{{ formatPrice(instrument.quote.price) }}</strong>
        <span :class="priceClass(instrument.quote.changePct)">
          {{ formatSigned(instrument.quote.change) }} / {{ formatPct(instrument.quote.changePct) }}
        </span>
      </div>

      <div class="chart-toolbar">
        <div class="segmented tight">
          <button v-for="item in TIMEFRAME_OPTIONS" :key="item.key" type="button" :class="{ active: timeframe === item.key }" @click="emit('update:timeframe', item.key)">
            {{ item.label }}
          </button>
        </div>
        <div v-if="timeframe !== 'fs'" class="mini-tabs adjustment-tabs" aria-label="复权方式">
          <button v-for="item in ADJUSTMENT_OPTIONS" :key="item.key" type="button" :class="{ active: adjustmentMode === item.key }" @click="emit('update:adjustment-mode', item.key)">{{ item.label }}</button>
        </div>
        <button class="tool-toggle" :class="{ active: showMa }" type="button" title="均线" @click="emit('update:show-ma', !showMa)">
          <Activity :size="16" />
          <span>MA</span>
        </button>
        <button class="tool-toggle" :class="{ active: showVolume }" type="button" title="成交量" @click="emit('update:show-volume', !showVolume)">
          <Gauge :size="16" />
          <span>VOL</span>
        </button>
      </div>
    </section>

    <section class="chart-surface">
      <div v-if="!candles.length" class="tab-empty compact">
        <RefreshCw :size="22" class="spin" />
        <strong>同步{{ timeframeLabel(timeframe) }}中</strong>
      </div>
      <KLineChart
        v-else
        :key="`${instrument.meta.code}-${candleVariantKey(timeframe, adjustmentMode)}`"
        :candles="candles"
        :mode="timeframe === 'fs' ? 'intraday' : 'kline'"
        :show-ma="showMa"
        :show-volume="showVolume"
        :reference-price="instrument.quote.prevClose"
        :price-limit-pct="stockLimitPct(instrument.meta.code, instrument.meta.name)"
      />
    </section>

    <slot name="stock-info" />
  </main>
</template>

<script setup lang="ts">
import { Activity, Gauge, RefreshCw, Star } from '@lucide/vue';
import KLineChart from '@/components/KLineChart.vue';
import { ADJUSTMENT_OPTIONS, TIMEFRAME_OPTIONS } from '@/constants/marketOptions';
import { candleVariantKey } from '@/services/adjustment';
import type { AdjustmentMode, Candle, InstrumentState, Timeframe } from '@/types/market';
import { formatPct, formatPrice, formatSigned, priceClass, stockLimitPct } from '@/utils/marketFormatters';

defineProps<{
  instrument: InstrumentState;
  candles: Candle[];
  timeframe: Timeframe;
  adjustmentMode: AdjustmentMode;
  showMa: boolean;
  showVolume: boolean;
  infoExpanded: boolean;
}>();

const emit = defineEmits<{
  'update:timeframe': [value: Timeframe];
  'update:adjustment-mode': [value: AdjustmentMode];
  'update:show-ma': [value: boolean];
  'update:show-volume': [value: boolean];
  'remove-stock': [code: string];
}>();

function timeframeLabel(value: Timeframe) {
  return TIMEFRAME_OPTIONS.find((item) => item.key === value)?.label ?? value;
}
</script>
