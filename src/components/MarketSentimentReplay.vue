<template>
  <section class="sentiment-replay">
    <div class="replay-chart-shell">
      <header><div><strong>情绪轨迹</strong><span>本机每 5 分钟采集</span></div><em>{{ points.length }} 个快照</em></header>
      <div v-if="points.length" ref="chartElement" class="replay-chart" />
      <div v-else class="replay-empty">等待首个市场情绪快照</div>
    </div>
    <aside v-if="selected" class="replay-inspector">
      <header><div><strong>{{ selected.tradeDate }}</strong><span>{{ formatTime(selected.updatedAt) }}</span></div><em :class="scoreTone(selected.score)">{{ selected.label }}</em></header>
      <div class="replay-score"><span>市场温度</span><strong :class="scoreTone(selected.score)">{{ selected.score }}</strong><i><b :style="{ width: `${selected.score}%` }" /></i></div>
      <div class="replay-metrics">
        <div><span>红盘覆盖</span><strong :class="selected.upRatio >= 50 ? 'up' : 'down'">{{ selected.upRatio.toFixed(1) }}%</strong></div>
        <div><span>封板率</span><strong>{{ selected.sealRate.toFixed(1) }}%</strong></div>
        <div><span>涨停 / 跌停</span><strong><b class="up">{{ selected.limitUp }}</b> / <b class="down">{{ selected.limitDown }}</b></strong></div>
        <div><span>炸板</span><strong class="watch">{{ selected.brokenLimit }}</strong></div>
        <div><span>连板高度</span><strong>{{ selected.maxStreak }} 板</strong></div>
        <div><span>指数均值</span><strong :class="selected.indexChange >= 0 ? 'up' : 'down'">{{ formatPct(selected.indexChange) }}</strong></div>
      </div>
      <div class="replay-delta">
        <span>较前一快照</span>
        <strong :class="scoreDelta >= 0 ? 'up' : 'down'">{{ scoreDelta >= 0 ? '+' : '' }}{{ scoreDelta }} 分</strong>
        <em>{{ replayDiagnosis }}</em>
      </div>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsOption } from 'echarts';
import type { SentimentHistoryPoint } from '@/types/marketMonitor';
import { chartThemeTokens } from '@/services/appearance';

echarts.use([LineChart, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps<{ points: SentimentHistoryPoint[] }>();
const chartElement = ref<HTMLDivElement | null>(null);
const selectedId = ref('');
let chart: ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const selected = computed(() => props.points.find((point) => point.id === selectedId.value) ?? props.points[props.points.length - 1] ?? null);
const selectedIndex = computed(() => selected.value ? props.points.findIndex((point) => point.id === selected.value?.id) : -1);
const previous = computed(() => selectedIndex.value > 0 ? props.points[selectedIndex.value - 1] : null);
const scoreDelta = computed(() => selected.value ? selected.value.score - (previous.value?.score ?? selected.value.score) : 0);
const replayDiagnosis = computed(() => {
  if (!previous.value || !selected.value) return '首个采集点';
  if (scoreDelta.value >= 5 && selected.value.upRatio > previous.value.upRatio) return '情绪与广度同步升温';
  if (scoreDelta.value <= -5 && selected.value.sealRate < previous.value.sealRate) return '情绪回落且封板质量下降';
  if (selected.value.score >= 75) return '高热区，留意分歧放大';
  if (selected.value.score < 35) return '低温区，观察修复信号';
  return '结构变化有限';
});

function renderChart() {
  if (!chartElement.value || !props.points.length) return;
  chart ??= echarts.init(chartElement.value, undefined, { renderer: 'canvas' });
  const theme = chartThemeTokens();
  const labels = props.points.map((point) => `${point.tradeDate.slice(5)} ${formatTime(point.updatedAt)}`);
  chart.setOption({
    animationDuration: 220,
    grid: { left: 42, right: 24, top: 42, bottom: 48 },
    legend: { top: 10, right: 18, textStyle: { color: theme.muted, fontSize: 9 }, itemWidth: 14, itemHeight: 7, data: ['情绪分', '红盘覆盖', '封板率'] },
    tooltip: { trigger: 'axis', backgroundColor: theme.tooltip, borderColor: theme.border, textStyle: { color: theme.tooltipText, fontSize: 10 } },
    xAxis: { type: 'category', boundaryGap: false, data: labels, axisLine: { lineStyle: { color: theme.border } }, axisLabel: { color: theme.faint, fontSize: 9, hideOverlap: true } },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: theme.faint, fontSize: 9 }, splitLine: { lineStyle: { color: theme.grid } } },
    dataZoom: [{ type: 'inside', zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: false }, { type: 'slider', height: 12, bottom: 10, borderColor: 'transparent', backgroundColor: theme.elevated, fillerColor: theme.accentSoft, handleStyle: { color: theme.accent }, textStyle: { color: theme.faint } }],
    series: [
      { name: '情绪分', type: 'line', data: props.points.map((point) => point.score), symbolSize: 5, lineStyle: { width: 2, color: theme.accent }, itemStyle: { color: theme.accentBright } },
      { name: '红盘覆盖', type: 'line', data: props.points.map((point) => Number(point.upRatio.toFixed(2))), showSymbol: false, lineStyle: { width: 1.5, color: theme.up }, itemStyle: { color: theme.up } },
      { name: '封板率', type: 'line', data: props.points.map((point) => Number(point.sealRate.toFixed(2))), showSymbol: false, lineStyle: { width: 1.5, color: theme.info }, itemStyle: { color: theme.info } }
    ]
  } as EChartsOption, { notMerge: true });
  chart.off('click');
  chart.on('click', (event: { dataIndex?: number }) => {
    const point = props.points[event.dataIndex ?? -1];
    if (point) selectedId.value = point.id;
  });
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Shanghai' }).format(value);
}

function formatPct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function scoreTone(score: number) {
  return score >= 60 ? 'up' : score < 40 ? 'down' : 'watch';
}

onMounted(() => {
  window.addEventListener('biga-theme-change', renderChart);
  nextTick(renderChart);
  if (chartElement.value) {
    resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(chartElement.value);
  }
});
watch(() => props.points, () => nextTick(renderChart), { deep: true });
onBeforeUnmount(() => { window.removeEventListener('biga-theme-change', renderChart); resizeObserver?.disconnect(); chart?.dispose(); chart = null; });
</script>

<style scoped>
.sentiment-replay { min-width: 0; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 270px; background: var(--bg-app); }
.replay-chart-shell { min-width: 0; min-height: 0; display: grid; grid-template-rows: 40px minmax(0, 1fr); border-right: 1px solid rgba(var(--border-rgb), .08); }
.replay-chart-shell header, .replay-inspector header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 13px; border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.replay-chart-shell header div, .replay-inspector header div { min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.replay-chart-shell strong, .replay-inspector header strong { color: var(--text-primary); font-size: 12px; }
.replay-chart-shell span, .replay-chart-shell em, .replay-inspector header span { color: var(--text-subtle); font-size: 9px; font-style: normal; }
.replay-chart { width: 100%; min-width: 0; min-height: 0; }
.replay-empty { display: grid; place-items: center; color: var(--text-subtle); font-size: 11px; }
.replay-inspector { min-width: 0; min-height: 0; overflow-y: auto; background: var(--bg-panel-alt); }
.replay-inspector header { height: 40px; }
.replay-inspector header em { padding: 3px 6px; border-radius: 3px; background: rgba(var(--border-rgb), .04); font-size: 9px; font-style: normal; }
.replay-score { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 7px; padding: 15px 13px; border-bottom: 1px solid rgba(var(--border-rgb), .07); color: var(--text-muted); font-size: 10px; }
.replay-score strong { font-size: 24px; }
.replay-score i { grid-column: 1 / -1; height: 4px; overflow: hidden; border-radius: 2px; background: var(--bg-muted); }
.replay-score b { display: block; height: 100%; background: var(--accent); }
.replay-metrics { display: grid; grid-template-columns: 1fr 1fr; }
.replay-metrics div { min-height: 58px; display: grid; align-content: center; gap: 6px; padding: 0 12px; border-right: 1px solid rgba(var(--border-rgb), .06); border-bottom: 1px solid rgba(var(--border-rgb), .06); }
.replay-metrics div:nth-child(2n) { border-right: 0; }
.replay-metrics span { color: var(--text-subtle); font-size: 9px; }
.replay-metrics strong { color: var(--text-strong); font-size: 12px; }
.replay-metrics b { font-weight: 700; }
.replay-delta { display: grid; grid-template-columns: 1fr auto; gap: 6px; padding: 14px 13px; color: var(--text-subtle); font-size: 9px; }
.replay-delta strong { font-size: 12px; }
.replay-delta em { grid-column: 1 / -1; color: var(--text-secondary); font-style: normal; }
.up { color: var(--market-up) !important; }.down { color: var(--market-down) !important; }.watch { color: var(--accent) !important; }
@media (max-width: 1260px) { .sentiment-replay { grid-template-columns: minmax(0, 1fr) 240px; } }
</style>
