<template>
  <aside class="detail-pane" :class="{ collapsed }">
    <button v-if="collapsed" class="icon-button pane-restore-button" type="button" title="展开盘口" @click="emit('toggle-collapse')">
      <PanelRightOpen :size="17" />
    </button>
    <template v-else>
      <section class="detail-block quote-focus">
        <div class="detail-header">
          <span>盘口</span>
          <button class="icon-button mini" type="button" title="收起盘口" @click="emit('toggle-collapse')">
            <PanelRightClose :size="14" />
          </button>
        </div>
        <div class="price-line">
          <strong :class="priceClass(instrument.quote.changePct)">{{ formatPrice(instrument.quote.price) }}</strong>
          <div :class="priceClass(instrument.quote.changePct)">
            <component :is="instrument.quote.changePct >= 0 ? TrendingUp : TrendingDown" :size="16" />
            <span>{{ formatPct(instrument.quote.changePct) }}</span>
          </div>
        </div>
        <div class="quote-matrix">
          <span>今开</span><strong>{{ formatPrice(instrument.quote.open) }}</strong>
          <span>最高</span><strong class="up">{{ formatPrice(instrument.quote.high) }}</strong>
          <span>最低</span><strong class="down">{{ formatPrice(instrument.quote.low) }}</strong>
          <span>换手</span><strong>{{ instrument.quote.turnoverRate.toFixed(2) }}%</strong>
          <span>振幅</span><strong>{{ instrument.quote.amplitude.toFixed(2) }}%</strong>
          <span>成交</span><strong>{{ formatAmount(instrument.quote.amount) }}</strong>
        </div>
      </section>

      <section class="detail-block">
        <div class="detail-header">
          <span>五档</span>
          <span class="muted">手</span>
        </div>
        <div class="order-book">
          <div v-for="(level, index) in [...instrument.quote.ask].reverse()" :key="`ask-${index}`" class="book-row ask">
            <span>卖{{ instrument.quote.ask.length - index }}</span>
            <strong>{{ formatPrice(level.price) }}</strong>
            <em>{{ formatVolume(level.volume) }}</em>
          </div>
          <div class="spread-line">
            <span>价差</span>
            <strong>{{ formatPrice(spread) }}</strong>
          </div>
          <div v-for="(level, index) in instrument.quote.bid" :key="`bid-${index}`" class="book-row bid">
            <span>买{{ index + 1 }}</span>
            <strong>{{ formatPrice(level.price) }}</strong>
            <em>{{ formatVolume(level.volume) }}</em>
          </div>
        </div>
      </section>

      <section class="detail-block">
        <div class="detail-header">
          <span>指标</span>
          <div class="mini-tabs">
            <button v-for="item in indicatorTabs" :key="item.key" type="button" :class="{ active: indicatorTab === item.key }" @click="emit('update:indicator-tab', item.key)">
              {{ item.label }}
            </button>
          </div>
        </div>
        <div class="indicator-stack">
          <div v-for="item in visibleIndicators" :key="item.label">
            <span>{{ item.label }}</span>
            <strong :class="item.tone">{{ item.value }}</strong>
          </div>
        </div>
      </section>

      <section class="detail-block">
        <div class="detail-header">
          <span>提醒</span>
          <button class="icon-button mini" type="button" title="管理提醒" :class="{ active: alertRuleCount > 0 }" @click="emit('open-alert-center', instrument.meta.code)">
            <Bell :size="14" />
          </button>
        </div>
        <div class="selected-alert-summary">
          <div><strong>{{ alertRuleCount }}</strong><span>启用规则</span></div>
          <div><strong>{{ latestAlert ? formatAlertAge(latestAlert.occurredAt, now) : '--' }}</strong><span>最近触发</span></div>
          <button class="command-button" type="button" @click="emit('open-alert-center', instrument.meta.code)"><Plus :size="13" />新增</button>
        </div>
      </section>

      <section class="detail-block adapter-block">
        <div class="detail-header">
          <span>扩展</span>
          <Pin :size="14" />
        </div>
        <div class="adapter-row">
          <span>MarketDataProvider</span>
          <strong>{{ providerName }}</strong>
        </div>
        <div class="adapter-row">
          <span>刷新</span>
          <strong>{{ refreshLabel }}</strong>
        </div>
      </section>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Bell, PanelRightClose, PanelRightOpen, Pin, Plus, TrendingDown, TrendingUp } from '@lucide/vue';
import type { AlertHistoryItem } from '@/types/alerts';
import type { InstrumentState } from '@/types/market';
import type { IndicatorTab } from '@/types/workspace';
import { formatAlertAge, formatAmount, formatNullable, formatPct, formatPrice, formatVolume, priceClass } from '@/utils/marketFormatters';

const props = defineProps<{
  instrument: InstrumentState;
  collapsed: boolean;
  indicatorTab: IndicatorTab;
  alertRuleCount: number;
  latestAlert: AlertHistoryItem | null;
  providerName: string;
  refreshLabel: string;
  now: number;
}>();

const emit = defineEmits<{
  'update:indicator-tab': [value: IndicatorTab];
  'toggle-collapse': [];
  'open-alert-center': [code: string];
}>();

const indicatorTabs: Array<{ key: IndicatorTab; label: string }> = [
  { key: 'trend', label: '趋势' },
  { key: 'macd', label: 'MACD' },
  { key: 'risk', label: '风控' }
];

const spread = computed(() => {
  const ask = props.instrument.quote.ask[0]?.price;
  const bid = props.instrument.quote.bid[0]?.price;
  return ask === undefined || bid === undefined ? null : ask - bid;
});

const visibleIndicators = computed(() => {
  const { quote, indicators } = props.instrument;

  if (props.indicatorTab === 'macd') {
    return [
      { label: 'DIF', value: formatNullable(indicators.dif, 3), tone: priceClass(indicators.dif) },
      { label: 'DEA', value: formatNullable(indicators.dea, 3), tone: priceClass(indicators.dea) },
      { label: 'BAR', value: formatNullable(indicators.macd, 3), tone: priceClass(indicators.macd) }
    ];
  }

  if (props.indicatorTab === 'risk') {
    return [
      { label: 'RSI6', value: formatNullable(indicators.rsi6, 1), tone: (indicators.rsi6 ?? 50) > 75 ? 'down' : (indicators.rsi6 ?? 50) < 25 ? 'up' : '' },
      { label: '振幅', value: `${quote.amplitude.toFixed(2)}%`, tone: quote.amplitude > 5 ? 'watch' : '' },
      { label: '量比', value: formatNullable(indicators.volumeRatio, 2), tone: (indicators.volumeRatio ?? 0) > 1.4 ? 'up' : '' }
    ];
  }

  return [
    { label: 'MA5', value: formatNullable(indicators.ma5, 2), tone: quote.price >= (indicators.ma5 ?? Infinity) ? 'up' : 'down' },
    { label: 'MA10', value: formatNullable(indicators.ma10, 2), tone: quote.price >= (indicators.ma10 ?? Infinity) ? 'up' : 'down' },
    { label: 'MA20', value: formatNullable(indicators.ma20, 2), tone: quote.price >= (indicators.ma20 ?? Infinity) ? 'up' : 'down' }
  ];
});
</script>
