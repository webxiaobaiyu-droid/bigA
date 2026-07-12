<template>
  <section class="sentiment-dashboard">
    <article class="sentiment-chart-panel score-panel">
      <header><strong>市场温度</strong><span>{{ snapshot.tradeDate || '--' }}</span></header>
      <div ref="scoreChartEl" class="sentiment-chart" />
      <div class="score-state"><strong :class="scoreTone">{{ snapshot.label }}</strong><span>{{ snapshot.score }}分</span></div>
    </article>

    <article class="sentiment-chart-panel breadth-panel">
      <header><strong>涨跌分布</strong><span>{{ snapshot.total }} 只样本</span></header>
      <div ref="breadthChartEl" class="sentiment-chart" />
      <div class="sentiment-chart-legend">
        <span><i class="up-dot" />上涨 <b>{{ snapshot.up }}</b></span>
        <span><i class="flat-dot" />平盘 <b>{{ snapshot.flat }}</b></span>
        <span><i class="down-dot" />下跌 <b>{{ snapshot.down }}</b></span>
      </div>
    </article>

    <article class="sentiment-chart-panel limit-panel">
      <header><strong>封板质量</strong><span>封板率 {{ snapshot.sealRate.toFixed(1) }}%</span></header>
      <div ref="limitChartEl" class="sentiment-chart" />
    </article>

    <article class="sentiment-chart-panel streak-panel">
      <header><strong>连板核心</strong><span>高度 {{ snapshot.maxStreak }}板</span></header>
      <div ref="streakChartEl" class="sentiment-chart" />
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, GaugeChart, PieChart } from 'echarts/charts';
import { GraphicComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsOption } from 'echarts';
import type { MarketSentimentSnapshot } from '@/types/marketMonitor';
import { chartThemeTokens } from '@/services/appearance';

echarts.use([BarChart, GaugeChart, PieChart, GraphicComponent, GridComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps<{ snapshot: MarketSentimentSnapshot }>();
const scoreChartEl = ref<HTMLDivElement | null>(null);
const breadthChartEl = ref<HTMLDivElement | null>(null);
const limitChartEl = ref<HTMLDivElement | null>(null);
const streakChartEl = ref<HTMLDivElement | null>(null);
const charts: ECharts[] = [];
let resizeObserver: ResizeObserver | null = null;

const scoreTone = computed(() => props.snapshot.score >= 60 ? 'up' : props.snapshot.score < 40 ? 'down' : 'watch');

function renderCharts() {
  const scoreChart = ensureChart(scoreChartEl.value, 0);
  const breadthChart = ensureChart(breadthChartEl.value, 1);
  const limitChart = ensureChart(limitChartEl.value, 2);
  const streakChart = ensureChart(streakChartEl.value, 3);
  if (!scoreChart || !breadthChart || !limitChart || !streakChart) return;

  const theme = chartThemeTokens();
  const scoreColor = props.snapshot.score >= 60 ? theme.up : props.snapshot.score < 40 ? theme.down : theme.accent;
  scoreChart.setOption({
    animationDuration: 320,
    series: [{
      type: 'gauge',
      min: 0,
      max: 100,
      startAngle: 205,
      endAngle: -25,
      center: ['50%', '66%'],
      radius: '96%',
      splitNumber: 5,
      axisLine: { lineStyle: { width: 8, color: [[0.4, theme.down], [0.6, theme.accent], [1, theme.up]] } },
      progress: { show: true, width: 8, roundCap: true, itemStyle: { color: scoreColor } },
      pointer: { show: true, length: '50%', width: 3, itemStyle: { color: theme.text } },
      anchor: { show: true, size: 7, itemStyle: { color: theme.text } },
      axisTick: { show: false },
      splitLine: { distance: -12, length: 5, lineStyle: { color: theme.muted, width: 1 } },
      axisLabel: { distance: -25, color: theme.faint, fontSize: 8 },
      title: { show: false },
      detail: { valueAnimation: true, offsetCenter: [0, '27%'], color: theme.text, fontSize: 24, fontWeight: 800, formatter: '{value}' },
      data: [{ value: props.snapshot.score }]
    }]
  } as EChartsOption, { notMerge: true });

  breadthChart.setOption({
    animationDuration: 320,
    tooltip: { trigger: 'item', backgroundColor: theme.tooltip, borderColor: theme.border, textStyle: { color: theme.tooltipText, fontSize: 10 } },
    series: [{
      type: 'pie',
      radius: ['54%', '78%'],
      center: ['50%', '47%'],
      startAngle: 90,
      avoidLabelOverlap: true,
      label: { show: false },
      emphasis: { scaleSize: 4 },
      itemStyle: { borderColor: theme.panel, borderWidth: 2 },
      data: [
        { name: '上涨', value: props.snapshot.up, itemStyle: { color: theme.up } },
        { name: '平盘', value: props.snapshot.flat, itemStyle: { color: theme.faint } },
        { name: '下跌', value: props.snapshot.down, itemStyle: { color: theme.down } }
      ]
    }],
    graphic: [{
      type: 'text',
      left: 'center',
      top: '35%',
      style: { text: `${breadthRate()}%\n红盘`, fill: theme.text, font: '700 13px Inter', textAlign: 'center', lineHeight: 17 }
    }]
  } as EChartsOption, { notMerge: true });

  limitChart.setOption({
    animationDuration: 320,
    grid: { left: 28, right: 10, top: 20, bottom: 24 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: theme.tooltip, borderColor: theme.border, textStyle: { color: theme.tooltipText, fontSize: 10 } },
    xAxis: { type: 'category', data: ['涨停', '炸板', '跌停'], axisLine: { lineStyle: { color: theme.border } }, axisTick: { show: false }, axisLabel: { color: theme.muted, fontSize: 9 } },
    yAxis: { type: 'value', minInterval: 1, splitNumber: 2, axisLabel: { color: theme.faint, fontSize: 8 }, splitLine: { lineStyle: { color: theme.grid } } },
    series: [{
      type: 'bar',
      barMaxWidth: 30,
      label: { show: true, position: 'top', color: theme.text, fontSize: 9 },
      data: [
        { value: props.snapshot.limitUp, itemStyle: { color: theme.up, borderRadius: [3, 3, 0, 0] } },
        { value: props.snapshot.brokenLimit, itemStyle: { color: theme.accent, borderRadius: [3, 3, 0, 0] } },
        { value: props.snapshot.limitDown, itemStyle: { color: theme.down, borderRadius: [3, 3, 0, 0] } }
      ]
    }]
  } as EChartsOption, { notMerge: true });

  const leaders = [...props.snapshot.leaders]
    .sort((a, b) => b.streak - a.streak || b.amount - a.amount)
    .slice(0, 5)
    .reverse();
  streakChart.setOption({
    animationDuration: 320,
    grid: { left: 62, right: 30, top: 8, bottom: 12 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: theme.tooltip, borderColor: theme.border, textStyle: { color: theme.tooltipText, fontSize: 10 } },
    xAxis: { type: 'value', min: 0, max: Math.max(3, props.snapshot.maxStreak + 1), minInterval: 1, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: theme.grid } } },
    yAxis: { type: 'category', data: leaders.map((row) => row.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: theme.muted, fontSize: 9, width: 52, overflow: 'truncate' } },
    series: [{
      type: 'bar',
      barWidth: 9,
      data: leaders.map((row) => ({ value: row.streak, itemStyle: { color: row.streak >= 2 ? theme.up : theme.accent, borderRadius: [0, 3, 3, 0] } })),
      label: { show: true, position: 'right', color: theme.accentBright, fontSize: 9, formatter: '{c}板' }
    }]
  } as EChartsOption, { notMerge: true });
}

function ensureChart(element: HTMLDivElement | null, index: number) {
  if (!element) return null;
  if (!charts[index]) charts[index] = echarts.init(element, undefined, { renderer: 'canvas' });
  return charts[index];
}

function breadthRate() {
  return props.snapshot.total ? ((props.snapshot.up / props.snapshot.total) * 100).toFixed(1) : '0.0';
}

onMounted(() => {
  window.addEventListener('biga-theme-change', renderCharts);
  nextTick(renderCharts);
  const element = scoreChartEl.value?.parentElement?.parentElement;
  if (element) {
    resizeObserver = new ResizeObserver(() => charts.forEach((chart) => chart.resize()));
    resizeObserver.observe(element);
  }
});

watch(() => props.snapshot, () => nextTick(renderCharts), { deep: true });

onBeforeUnmount(() => {
  window.removeEventListener('biga-theme-change', renderCharts);
  resizeObserver?.disconnect();
  charts.forEach((chart) => chart.dispose());
  charts.length = 0;
});
</script>

<style scoped>
.sentiment-dashboard { min-width: 0; height: 168px; display: grid; grid-template-columns: .9fr 1fr 1.05fr 1.35fr; border-bottom: 1px solid rgba(var(--border-rgb), .08); background: var(--bg-app); }
.sentiment-chart-panel { position: relative; min-width: 0; min-height: 0; display: grid; grid-template-rows: 30px minmax(0,1fr); border-right: 1px solid rgba(var(--border-rgb), .07); background: var(--bg-panel-alt); }
.sentiment-chart-panel:last-child { border-right: 0; }
.sentiment-chart-panel header { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 11px; border-bottom: 1px solid rgba(var(--border-rgb), .045); }
.sentiment-chart-panel header strong { color: var(--text-strong); font-size: 11px; }
.sentiment-chart-panel header span { overflow: hidden; color: var(--text-subtle); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.sentiment-chart { width: 100%; min-width: 0; min-height: 0; }
.score-state { position: absolute; right: 9px; bottom: 7px; display: grid; justify-items: end; gap: 2px; }
.score-state strong { font-size: 10px; }
.score-state span { color: var(--text-muted); font-size: 8px; }
.up { color: var(--market-up); }
.down { color: var(--market-down); }
.watch { color: var(--accent); }
.sentiment-chart-legend { position: absolute; right: 9px; bottom: 7px; left: 9px; display: flex; justify-content: space-between; gap: 5px; color: var(--text-muted); font-size: 8px; }
.sentiment-chart-legend span { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
.sentiment-chart-legend b { color: var(--text-secondary); }
.sentiment-chart-legend i { width: 5px; height: 5px; border-radius: 1px; }
.up-dot { background: var(--market-up); }
.flat-dot { background: var(--text-disabled); }
.down-dot { background: var(--market-down); }
@media (max-width: 1260px) {
  .sentiment-dashboard { grid-template-columns: .85fr 1fr 1fr 1.2fr; }
}
</style>
