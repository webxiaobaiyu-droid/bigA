<template>
  <section class="sentiment-radar-panel">
    <header>
      <div><strong>结构雷达</strong><span>五维情绪强度</span></div>
      <em :class="tone">{{ snapshot.label }}</em>
    </header>
    <div ref="chartElement" class="sentiment-radar-chart" />
    <footer>
      <span><i class="strong-dot" />强项 {{ strongest.name }} {{ strongest.value.toFixed(0) }}</span>
      <span><i class="weak-dot" />短板 {{ weakest.name }} {{ weakest.value.toFixed(0) }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { RadarChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsOption } from 'echarts';
import type { MarketSentimentSnapshot } from '@/types/marketMonitor';
import { chartThemeTokens } from '@/services/appearance';

echarts.use([RadarChart, TooltipComponent, CanvasRenderer]);

const props = defineProps<{ snapshot: MarketSentimentSnapshot }>();
const chartElement = ref<HTMLDivElement | null>(null);
let chart: ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const dimensions = computed(() => {
  const total = Math.max(props.snapshot.total, 1);
  const limitTotal = Math.max(props.snapshot.limitUp + props.snapshot.limitDown, 1);
  const averageIndexChange = props.snapshot.indices.length
    ? props.snapshot.indices.reduce((sum, row) => sum + row.changePct, 0) / props.snapshot.indices.length
    : 0;
  return [
    { name: '红盘广度', value: clamp((props.snapshot.up / total) * 100) },
    { name: '涨停优势', value: clamp(50 + ((props.snapshot.limitUp - props.snapshot.limitDown) / limitTotal) * 50) },
    { name: '封板质量', value: clamp(props.snapshot.sealRate) },
    { name: '连板高度', value: clamp((props.snapshot.maxStreak / 5) * 100) },
    { name: '指数动能', value: clamp(50 + averageIndexChange * 10) }
  ];
});
const strongest = computed(() => [...dimensions.value].sort((a, b) => b.value - a.value)[0] ?? { name: '--', value: 0 });
const weakest = computed(() => [...dimensions.value].sort((a, b) => a.value - b.value)[0] ?? { name: '--', value: 0 });
const tone = computed(() => props.snapshot.score >= 60 ? 'up' : props.snapshot.score < 40 ? 'down' : 'watch');

function renderChart() {
  if (!chartElement.value) return;
  chart ??= echarts.init(chartElement.value, undefined, { renderer: 'canvas' });
  const theme = chartThemeTokens();
  chart.setOption({
    animationDuration: 320,
    tooltip: {
      trigger: 'item',
      backgroundColor: theme.tooltip,
      borderColor: theme.border,
      textStyle: { color: theme.tooltipText, fontSize: 10 },
      formatter: () => dimensions.value.map((item) => `${item.name}<b style="float:right;margin-left:16px">${item.value.toFixed(1)}</b>`).join('<br/>')
    },
    radar: {
      center: ['50%', '50%'],
      radius: '70%',
      startAngle: 90,
      splitNumber: 4,
      shape: 'polygon',
      indicator: dimensions.value.map((item) => ({ name: item.name, max: 100 })),
      axisName: { color: theme.muted, fontSize: 9 },
      splitArea: { areaStyle: { color: [theme.panel, theme.elevated] } },
      splitLine: { lineStyle: { color: theme.border } },
      axisLine: { lineStyle: { color: theme.grid } }
    },
    series: [{
      type: 'radar',
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { width: 2, color: theme.accent },
      itemStyle: { color: theme.accentBright },
      areaStyle: { color: theme.accentSoft },
      data: [{ value: dimensions.value.map((item) => item.value), name: '市场结构' }]
    }]
  } as EChartsOption, { notMerge: true });
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

onMounted(() => {
  window.addEventListener('biga-theme-change', renderChart);
  nextTick(renderChart);
  if (chartElement.value) {
    resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(chartElement.value);
  }
});

watch(() => props.snapshot, () => nextTick(renderChart), { deep: true });

onBeforeUnmount(() => {
  window.removeEventListener('biga-theme-change', renderChart);
  resizeObserver?.disconnect();
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.sentiment-radar-panel { min-width: 0; min-height: 190px; display: grid; grid-template-rows: 34px minmax(0,1fr) 28px; border-top: 1px solid rgba(var(--border-rgb), .07); background: var(--bg-panel-alt); }
.sentiment-radar-panel header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 12px; }
.sentiment-radar-panel header div { min-width: 0; display: flex; align-items: baseline; gap: 7px; }
.sentiment-radar-panel header strong { color: var(--text-strong); font-size: 11px; }
.sentiment-radar-panel header span { color: var(--text-faint); font-size: 8px; }
.sentiment-radar-panel header em { padding: 2px 5px; border-radius: 3px; background: rgba(var(--border-rgb), .035); font-size: 9px; font-style: normal; }
.sentiment-radar-panel header em.up { color: var(--market-up); }
.sentiment-radar-panel header em.down { color: var(--market-down); }
.sentiment-radar-panel header em.watch { color: var(--accent); }
.sentiment-radar-chart { width: 100%; min-width: 0; min-height: 0; }
.sentiment-radar-panel footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 11px; border-top: 1px solid rgba(var(--border-rgb), .045); color: var(--text-subtle); font-size: 8px; }
.sentiment-radar-panel footer span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.sentiment-radar-panel footer i { width: 5px; height: 5px; border-radius: 50%; }
.strong-dot { background: var(--market-up); }
.weak-dot { background: var(--market-down); }
</style>
