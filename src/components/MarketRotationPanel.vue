<template>
  <section class="rotation-panel">
    <div class="rotation-heatmap-shell">
      <header><div><strong>行业轮动热图</strong><span>净流入占比 · 本机采集</span></div><em>{{ points.length }} 个快照</em></header>
      <div v-if="chartRows.length && points.length" ref="chartElement" class="rotation-chart" />
      <div v-else class="rotation-empty">至少需要一个资金流向快照</div>
    </div>
    <div class="rotation-table-shell">
      <div class="rotation-table-title"><div><strong>轮动强度</strong><span>连续性、加速度与排名变化</span></div><em>{{ current?.tradeDate || '--' }}</em></div>
      <div class="rotation-row head"><span>#</span><span>行业</span><span>状态</span><span>连续</span><span>当前净额</span><span>加速度</span><span>排名</span></div>
      <div v-for="(row, index) in rows.slice(0, 16)" :key="row.code" class="rotation-row">
        <span class="rank-index">{{ index + 1 }}</span>
        <span class="rotation-name"><strong>{{ row.name }}</strong><em>{{ formatPct(row.changePct) }}</em></span>
        <span class="rotation-state" :class="stateTone(row.state)">{{ stateLabel(row.state) }}</span>
        <span>{{ row.inflowStreakDays ? `${row.inflowStreakDays}日流入` : row.outflowStreakDays ? `${row.outflowStreakDays}日流出` : '--' }}</span>
        <strong :class="priceClass(row.netAmount)">{{ formatAmount(row.netAmount) }}</strong>
        <span :class="priceClass(row.momentum)">{{ signedAmount(row.momentum) }}</span>
        <span :class="priceClass(row.rankChange)">{{ row.rankChange ? `${row.rankChange > 0 ? '↑' : '↓'}${Math.abs(row.rankChange)}` : '--' }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { HeatmapChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsOption } from 'echarts';
import { analyzeSectorRotation } from '@/services/marketHistory';
import { chartThemeTokens } from '@/services/appearance';
import type { FundFlowHistoryPoint, MarketFundFlowSnapshot, SectorRotationRow } from '@/types/marketMonitor';

echarts.use([HeatmapChart, DataZoomComponent, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

const props = defineProps<{ points: FundFlowHistoryPoint[]; current: MarketFundFlowSnapshot | null }>();
const chartElement = ref<HTMLDivElement | null>(null);
let chart: ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const rows = computed(() => analyzeSectorRotation(props.points, props.current));
const chartRows = computed(() => rows.value.slice(0, 10));
const visiblePoints = computed(() => props.points.slice(-18));

function renderChart() {
  if (!chartElement.value || !chartRows.value.length || !visiblePoints.value.length) return;
  chart ??= echarts.init(chartElement.value, undefined, { renderer: 'canvas' });
  const theme = chartThemeTokens();
  const sectors = chartRows.value.map((row) => row.name);
  const labels = visiblePoints.value.map((point) => formatTime(point.updatedAt));
  const values = visiblePoints.value.flatMap((point, x) => sectors.map((name, y) => {
    const value = point.sectors.find((row) => row.name === name)?.netRatio ?? 0;
    return [x, y, Math.max(-20, Math.min(20, Number(value.toFixed(2))))];
  }));
  chart.setOption({
    animationDuration: 180,
    grid: { left: 74, right: 26, top: 20, bottom: 46 },
    tooltip: { position: 'top', backgroundColor: theme.tooltip, borderColor: theme.border, textStyle: { color: theme.tooltipText, fontSize: 10 }, formatter: (params: unknown) => {
      const value = (params as { value?: [number, number, number] }).value ?? [0, 0, 0];
      return `${sectors[value[1]]}<br/>${labels[value[0]]}　<b>${value[2] >= 0 ? '+' : ''}${value[2].toFixed(2)}%</b>`;
    } },
    xAxis: { type: 'category', data: labels, splitArea: { show: true }, axisLine: { lineStyle: { color: theme.border } }, axisLabel: { color: theme.faint, fontSize: 9, hideOverlap: true } },
    yAxis: { type: 'category', data: sectors, splitArea: { show: true }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: theme.muted, fontSize: 9, width: 62, overflow: 'truncate' } },
    visualMap: { min: -20, max: 20, calculable: false, orient: 'horizontal', left: 'center', bottom: 5, itemWidth: 130, itemHeight: 6, text: ['流入', '流出'], textStyle: { color: theme.faint, fontSize: 8 }, inRange: { color: [theme.down, theme.elevated, theme.up] } },
    dataZoom: [{ type: 'inside', zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: false }],
    series: [{ type: 'heatmap', data: values, label: { show: false }, itemStyle: { borderColor: theme.panel, borderWidth: 2 }, emphasis: { itemStyle: { borderColor: theme.accent, borderWidth: 1 } } }]
  } as EChartsOption, { notMerge: true });
}

function formatAmount(value: number) {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}亿`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)}万`;
  return `${Math.round(value)}`;
}
function signedAmount(value: number) { return `${value > 0 ? '+' : ''}${formatAmount(value)}`; }
function formatPct(value: number) { return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`; }
function formatTime(value: number) { return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Shanghai' }).format(value); }
function priceClass(value: number) { return value > 0 ? 'up' : value < 0 ? 'down' : ''; }
function stateLabel(state: SectorRotationRow['state']) { return ({ entering: '新进入', strengthening: '增强', weakening: '减弱', leaving: '转流出', neutral: '观望' } as const)[state]; }
function stateTone(state: SectorRotationRow['state']) { return state === 'entering' || state === 'strengthening' ? 'up' : state === 'leaving' ? 'down' : state === 'weakening' ? 'watch' : ''; }

onMounted(() => {
  window.addEventListener('biga-theme-change', renderChart);
  nextTick(renderChart);
  if (chartElement.value) { resizeObserver = new ResizeObserver(() => chart?.resize()); resizeObserver.observe(chartElement.value); }
});
watch([() => props.points, () => props.current], () => nextTick(renderChart), { deep: true });
onBeforeUnmount(() => { window.removeEventListener('biga-theme-change', renderChart); resizeObserver?.disconnect(); chart?.dispose(); chart = null; });
</script>

<style scoped>
.rotation-panel { min-width: 0; min-height: 0; display: grid; grid-template-columns: minmax(420px, .9fr) minmax(520px, 1.1fr); background: var(--bg-app); }
.rotation-heatmap-shell, .rotation-table-shell { min-width: 0; min-height: 0; }
.rotation-heatmap-shell { display: grid; grid-template-rows: 40px minmax(0, 1fr); border-right: 1px solid rgba(var(--border-rgb), .08); }
.rotation-heatmap-shell header, .rotation-table-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 12px; border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.rotation-heatmap-shell header div, .rotation-table-title div { min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.rotation-heatmap-shell strong, .rotation-table-title strong { color: var(--text-primary); font-size: 12px; }
.rotation-heatmap-shell span, .rotation-table-title span, .rotation-heatmap-shell em, .rotation-table-title em { color: var(--text-subtle); font-size: 9px; font-style: normal; }
.rotation-chart { width: 100%; min-width: 0; min-height: 0; }
.rotation-empty { display: grid; place-items: center; color: var(--text-subtle); font-size: 11px; }
.rotation-table-shell { overflow-y: auto; }
.rotation-table-title { position: sticky; z-index: 3; top: 0; height: 40px; background: var(--bg-panel); }
.rotation-row { min-width: 610px; min-height: 39px; display: grid; grid-template-columns: 30px minmax(105px, 1fr) 58px 64px 82px 82px 50px; align-items: center; gap: 7px; padding: 0 10px; border-bottom: 1px solid rgba(var(--border-rgb), .05); color: var(--text-secondary); font-size: 9px; text-align: right; }
.rotation-row.head { position: sticky; z-index: 3; top: 40px; min-height: 28px; background: var(--bg-elevated); color: var(--text-faint); font-weight: 700; }
.rotation-row > span:nth-child(2), .rotation-name { text-align: left; }
.rotation-name { min-width: 0; display: grid; gap: 3px; }
.rotation-name strong { overflow: hidden; color: var(--text-strong); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.rotation-name em { color: var(--text-subtle); font-size: 8px; font-style: normal; }
.rotation-state { justify-self: end; padding: 3px 5px; border-radius: 3px; background: rgba(var(--border-rgb), .04); }
.rank-index { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 4px; background: var(--bg-muted); color: var(--accent-bright); font-weight: 800; }
.up { color: var(--market-up) !important; }.down { color: var(--market-down) !important; }.watch { color: var(--accent) !important; }
@media (max-width: 1260px) { .rotation-panel { grid-template-columns: minmax(360px,.8fr) minmax(500px,1.2fr); } }
</style>
