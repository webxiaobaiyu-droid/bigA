<template>
  <main class="tab-page sector-page">
    <section class="tab-hero sector-shell market-workbench-shell">
      <div class="tab-heading sector-heading">
        <div class="heading-title"><TrendingUp :size="20" /><strong>热门板块</strong><span>{{ status }}</span></div>
        <div class="sector-actions">
          <div class="mini-tabs sector-tabs">
            <button v-for="item in sectorModeOptions" :key="item.key" type="button" :class="{ active: mode === item.key }" @click="emit('update:mode', item.key)">{{ item.label }}</button>
          </div>
          <div class="mini-tabs sector-tabs hot-sector-tabs">
            <button v-for="item in sortOptions" :key="item.key" type="button" :class="{ active: sort === item.key }" @click="emit('update:sort', item.key)">{{ item.label }}</button>
          </div>
          <button class="icon-button mini" :class="{ active: loading }" type="button" title="刷新热门板块" @click="emit('refresh')"><RefreshCw :size="14" /></button>
        </div>
      </div>

      <div v-if="loading && !rows.length" class="tab-empty"><RefreshCw :size="26" class="spin" /><strong>计算板块热度中</strong></div>
      <div v-else-if="!rows.length" class="tab-empty"><Layers3 :size="26" /><strong>暂无热门板块</strong></div>
      <div v-else class="market-workbench hot-sector-workbench">
        <div class="market-pulse-strip hot-pulse-strip">
          <div><span>当前主线</span><strong>{{ stats.leader?.name || '--' }}</strong><em :class="priceClass(stats.leader?.changePct)">{{ stats.leader ? formatPct(stats.leader.changePct) : '--' }}</em></div>
          <div><span>主线强度</span><strong>{{ stats.leader ? heatScore(stats.leader) : 0 }}</strong><em>综合热度</em></div>
          <div><span>强势板块</span><strong>{{ stats.strongCount }}</strong><em>热度 ≥ 60</em></div>
          <div><span>涨幅活跃</span><strong>{{ stats.activeCount }}</strong><em>涨幅 ≥ 1%</em></div>
          <div><span>前20成交</span><strong>{{ formatAmount(stats.totalAmount) }}</strong><em>活跃方向</em></div>
        </div>

        <div class="sector-workbench-grid">
          <div class="sector-scan-table hot-sector-table">
            <div class="sector-scan-row head"><span>#</span><span>热门板块</span><span>热度</span><span>涨幅</span><span>覆盖度</span><span>龙头确认</span></div>
            <button v-for="(row, index) in rows" :key="row.code" type="button" class="sector-scan-row" :class="{ selected: selectedSector?.code === row.code }" @click="emit('select-sector', row)">
              <span class="rank-index hot-rank">{{ index + 1 }}</span>
              <span class="rank-name"><strong>{{ row.name }}</strong><em>{{ heatLabel(row) }} · {{ sectorPulseLabel(row) }}</em></span>
              <span class="sector-heat"><strong>{{ heatScore(row) }}</strong><i><b :style="{ width: `${heatScore(row)}%` }" /></i></span>
              <strong :class="priceClass(row.changePct)">{{ formatPct(row.changePct) }}</strong>
              <span class="sector-breadth-cell"><strong>{{ sectorBreadthText(row) }}</strong><i v-if="sectorBreadthRatio(row) !== null"><b class="up-bg" :style="{ width: `${(sectorBreadthRatio(row) ?? 0) * 100}%` }" /></i></span>
              <span class="rank-leader"><strong>{{ row.leaderName }}</strong><em :class="priceClass(row.leaderChangePct)">{{ formatPct(row.leaderChangePct) }}</em></span>
            </button>
          </div>
          <SectorDetailPanel :sector="selectedSector" :stocks="constituents" :loading="constituentsLoading" @select-stock="emit('select-stock', $event)" />
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { Layers3, RefreshCw, TrendingUp } from '@lucide/vue';
import SectorDetailPanel from '@/components/SectorDetailPanel.vue';
import type { HotStockRow, SectorMode, SectorRow } from '@/types/sector';
import {
  sectorBreadthRatio,
  sectorBreadthText,
  sectorHeatLabel,
  sectorHeatScore,
  sectorPulseLabel,
  type HotSectorSortKey
} from '@/utils/marketRanking';
import { formatAmount, formatPct, priceClass } from '@/utils/marketFormatters';

interface HotSectorStats {
  leader: SectorRow | null;
  strongCount: number;
  activeCount: number;
  totalAmount: number;
}

const props = defineProps<{
  status: string;
  loading: boolean;
  mode: SectorMode;
  sort: HotSectorSortKey;
  rows: SectorRow[];
  stats: HotSectorStats;
  selectedSector: SectorRow | null;
  constituents: HotStockRow[];
  constituentsLoading: boolean;
  maxSectorFlow: number;
  maxSectorAmount: number;
}>();

const emit = defineEmits<{
  'update:mode': [value: SectorMode];
  'update:sort': [value: HotSectorSortKey];
  refresh: [];
  'select-sector': [row: SectorRow];
  'select-stock': [row: HotStockRow];
}>();

const sectorModeOptions: Array<{ key: SectorMode; label: string }> = [
  { key: 'industry', label: '行业' },
  { key: 'concept', label: '概念' }
];

const sortOptions: Array<{ key: HotSectorSortKey; label: string }> = [
  { key: 'heat', label: '综合热度' },
  { key: 'change', label: '涨幅' },
  { key: 'money', label: '资金' },
  { key: 'breadth', label: '扩散' }
];

function heatScore(row: SectorRow) {
  return sectorHeatScore(row, props.maxSectorFlow, props.maxSectorAmount);
}

function heatLabel(row: SectorRow) {
  return sectorHeatLabel(row, props.maxSectorFlow, props.maxSectorAmount);
}
</script>
