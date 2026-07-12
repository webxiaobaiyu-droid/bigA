<template>
  <aside class="sector-focus-panel">
    <div v-if="sector" class="sector-focus-content">
      <header class="sector-focus-header">
        <div>
          <span>{{ sector.mode === 'industry' ? '行业板块' : '概念板块' }}</span>
          <strong>{{ sector.name }}</strong>
        </div>
        <strong :class="priceClass(sector.changePct)">{{ formatPct(sector.changePct) }}</strong>
      </header>

      <div class="sector-focus-metrics">
        <div><span>成交额</span><strong>{{ formatAmount(sector.amount) }}</strong></div>
        <div><span>主力净额</span><strong :class="priceClass(sector.mainNetInflow)">{{ sector.source === 'eastmoney' ? formatAmount(sector.mainNetInflow) : '--' }}</strong></div>
        <div><span>{{ hasBreadth ? '上涨覆盖' : '成分数量' }}</span><strong>{{ hasBreadth ? `${breadthPct.toFixed(0)}%` : memberCount }}</strong></div>
      </div>

      <div class="sector-focus-label">
        <span>成分股强度</span>
        <em>{{ sector.source === 'eastmoney' ? '东方财富' : '新浪行情' }}</em>
      </div>

      <div v-if="loading && !stocks.length" class="sector-focus-state">
        <RefreshCw :size="15" class="spin" />
        <span>同步成分股中</span>
      </div>
      <div v-else-if="!stocks.length" class="sector-focus-state">
        <span>暂无成分股数据</span>
      </div>
      <div v-else class="sector-constituent-list">
        <div class="sector-constituent-row head">
          <span>股票</span><span>涨幅</span><span>现价</span><span>换手</span>
        </div>
        <button v-for="stock in stocks.slice(0, 20)" :key="stock.code" type="button" class="sector-constituent-row" @click="emit('select-stock', stock)">
          <span><strong>{{ stock.name }}</strong><em>{{ stock.code }}</em></span>
          <strong :class="priceClass(stock.changePct)">{{ formatPct(stock.changePct) }}</strong>
          <span>{{ formatPrice(stock.price) }}</span>
          <span>{{ stock.turnoverRate.toFixed(1) }}%</span>
        </button>
      </div>
    </div>
    <div v-else class="sector-focus-state">
      <span>选择板块查看成分股</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RefreshCw } from '@lucide/vue';
import type { HotStockRow, SectorRow } from '@/types/sector';

const props = defineProps<{
  sector: SectorRow | null;
  stocks: HotStockRow[];
  loading: boolean;
}>();

const emit = defineEmits<{
  'select-stock': [stock: HotStockRow];
}>();

const hasBreadth = computed(() => (props.sector?.upCount ?? 0) + (props.sector?.downCount ?? 0) > 0);
const breadthTotal = computed(() => (props.sector?.upCount ?? 0) + (props.sector?.downCount ?? 0) + (props.sector?.flatCount ?? 0));
const breadthPct = computed(() => breadthTotal.value ? ((props.sector?.upCount ?? 0) / breadthTotal.value) * 100 : 0);
const memberCount = computed(() => props.stocks.length || props.sector?.flatCount || 0);

function priceClass(value: number) {
  return value > 0 ? 'up' : value < 0 ? 'down' : '';
}

function formatPct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatPrice(value: number) {
  return value > 0 ? value.toFixed(value >= 1000 ? 2 : 3) : '--';
}

function formatAmount(value: number) {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}亿`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)}万`;
  return value ? value.toFixed(0) : '--';
}
</script>
