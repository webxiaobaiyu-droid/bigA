<template>
  <div class="workspace-modal-backdrop" @click.self="emit('close')">
    <section class="workspace-modal data-source-health" role="dialog" aria-modal="true" aria-label="数据源健康">
      <header class="workspace-modal-header">
        <div><strong>数据源健康</strong><span>{{ activeTab === 'live' ? '本次运行请求质量' : '近 90 日本机质量趋势' }}</span></div>
        <div class="source-health-tabs"><button type="button" :class="{ active: activeTab === 'live' }" @click="activeTab = 'live'">现场</button><button type="button" :class="{ active: activeTab === 'trend' }" @click="activeTab = 'trend'">趋势</button></div>
        <button class="icon-button" type="button" title="关闭" @click="emit('close')"><X :size="16" /></button>
      </header>
      <template v-if="activeTab === 'live'">
        <div class="source-health-summary">
          <div><span>已观测主机</span><strong>{{ stats.length }}</strong><em>行情与资讯链路</em></div>
          <div><span>请求成功率</span><strong :class="overallRate >= 95 ? 'healthy' : overallRate < 80 ? 'down' : 'watch'">{{ overallRate.toFixed(1) }}%</strong><em>{{ totals.successes }} / {{ totals.requests }}</em></div>
          <div><span>平均延迟</span><strong>{{ Math.round(averageLatency) }}ms</strong><em>成功请求</em></div>
          <div><span>重试</span><strong :class="totals.retries ? 'watch' : ''">{{ totals.retries }}</strong><em>短延迟重试</em></div>
          <div><span>熔断中</span><strong :class="openCircuitCount ? 'down' : 'healthy'">{{ openCircuitCount }}</strong><em>15 秒自动恢复</em></div>
        </div>
        <div class="source-health-table">
          <div class="source-health-row head"><span>数据主机</span><span>状态</span><span>请求</span><span>成功率</span><span>平均延迟</span><span>最近延迟</span><span>重试</span><span>最近成功</span></div>
          <div v-if="!stats.length" class="manager-empty">尚未产生行情请求</div>
          <div v-for="row in stats" :key="row.host" class="source-health-row" :title="row.lastError">
            <strong>{{ row.host }}</strong>
            <span class="source-status" :class="statusTone(row)"><i />{{ statusLabel(row) }}</span>
            <span>{{ row.requests }}</span>
            <strong :class="row.successRate >= 95 ? 'healthy' : row.successRate < 80 ? 'down' : 'watch'">{{ row.successRate.toFixed(1) }}%</strong>
            <span>{{ Math.round(row.averageLatencyMs) }}ms</span>
            <span>{{ Math.round(row.lastLatencyMs) }}ms</span>
            <span>{{ row.retries }}</span>
            <time>{{ row.lastSuccessAt ? formatTime(row.lastSuccessAt) : '--' }}</time>
          </div>
        </div>
      </template>
      <div v-else class="source-trend-view">
        <div class="source-trend-toolbar"><label>数据主机<select v-model="selectedHost"><option v-for="host in historyHosts" :key="host" :value="host">{{ host }}</option></select></label><span>{{ selectedHistory.length }} 个交易日 · 保留 90 天</span></div>
        <div v-if="selectedHost && selectedHistory.length" ref="historyChartEl" class="source-trend-chart" />
        <div v-else class="manager-empty">等待数据源请求积累历史</div>
        <div v-if="selectedHistory.length" class="source-history-table"><div class="source-history-row head"><span>日期</span><span>请求</span><span>成功率</span><span>平均延迟</span><span>重试</span><span>异常</span></div><div v-for="row in [...selectedHistory].reverse()" :key="row.date" class="source-history-row"><time>{{ row.date }}</time><span>{{ row.requests }}</span><strong :class="row.successRate >= 95 ? 'healthy' : row.successRate < 80 ? 'down' : 'watch'">{{ row.successRate.toFixed(1) }}%</strong><span>{{ Math.round(row.averageLatencyMs) }}ms</span><span>{{ row.retries }}</span><span :class="row.failures ? 'down' : 'healthy'">{{ row.failures }}</span></div></div>
      </div>
      <footer class="workspace-modal-footer"><span>{{ activeTab === 'live' ? '现场统计从本次应用启动开始，不包含供应商内部延迟' : '趋势为当前设备本地聚合，不包含未开启 BigA 时的数据' }}</span></footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { X } from '@lucide/vue';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsOption } from 'echarts';
import { getMarketTransportHistory, getMarketTransportStats, type MarketTransportDailyStat, type MarketTransportStat } from '@/services/marketTransport';
import { chartThemeTokens } from '@/services/appearance';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const emit = defineEmits<{ close: [] }>();
const stats = ref<MarketTransportStat[]>([]);
const history = ref<MarketTransportDailyStat[]>([]);
const activeTab = ref<'live' | 'trend'>('live');
const selectedHost = ref('');
const historyChartEl = ref<HTMLDivElement | null>(null);
let timer: number | undefined;
let chart: ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
const now = ref(Date.now());

const totals = computed(() => stats.value.reduce((result, row) => ({ requests: result.requests + row.requests, successes: result.successes + row.successes, retries: result.retries + row.retries }), { requests: 0, successes: 0, retries: 0 }));
const overallRate = computed(() => totals.value.requests ? (totals.value.successes / totals.value.requests) * 100 : 0);
const averageLatency = computed(() => {
  const successful = stats.value.filter((row) => row.successes);
  const count = successful.reduce((sum, row) => sum + row.successes, 0);
  return count ? successful.reduce((sum, row) => sum + row.averageLatencyMs * row.successes, 0) / count : 0;
});
const openCircuitCount = computed(() => stats.value.filter((row) => row.circuitOpenUntil > now.value).length);
const historyHosts = computed(() => [...new Set([...history.value.map((row) => row.host), ...stats.value.map((row) => row.host)])].sort());
const selectedHistory = computed(() => history.value.filter((row) => row.host === selectedHost.value));

function refresh() {
  now.value = Date.now();
  stats.value = getMarketTransportStats();
  history.value = getMarketTransportHistory();
  if (!selectedHost.value || !historyHosts.value.includes(selectedHost.value)) selectedHost.value = historyHosts.value[0] ?? '';
}
function statusLabel(row: MarketTransportStat) { if (row.circuitOpenUntil > now.value) return '熔断'; if (row.successRate >= 95) return '稳定'; if (row.successRate >= 80) return '波动'; return '异常'; }
function statusTone(row: MarketTransportStat) { if (row.circuitOpenUntil > now.value || row.successRate < 80) return 'down'; if (row.successRate < 95) return 'watch'; return 'healthy'; }
function formatTime(value: number) { return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(value); }

function renderHistoryChart() {
  if (!historyChartEl.value || !selectedHistory.value.length) return;
  chart ??= echarts.init(historyChartEl.value, undefined, { renderer: 'canvas' });
  const theme = chartThemeTokens();
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(historyChartEl.value);
  }
  chart.setOption({
    animationDuration: 220,
    grid: { left: 48, right: 52, top: 42, bottom: 34 },
    legend: { top: 11, right: 12, textStyle: { color: theme.muted, fontSize: 9 }, itemWidth: 13, itemHeight: 7, data: ['成功率', '平均延迟'] },
    tooltip: { trigger: 'axis', backgroundColor: theme.tooltip, borderColor: theme.border, textStyle: { color: theme.tooltipText, fontSize: 10 } },
    xAxis: { type: 'category', data: selectedHistory.value.map((row) => row.date.slice(5)), axisLine: { lineStyle: { color: theme.border } }, axisTick: { show: false }, axisLabel: { color: theme.faint, fontSize: 9 } },
    yAxis: [{ type: 'value', min: 0, max: 100, axisLabel: { color: theme.faint, fontSize: 9, formatter: '{value}%' }, splitLine: { lineStyle: { color: theme.grid } } }, { type: 'value', min: 0, axisLabel: { color: theme.faint, fontSize: 9, formatter: '{value}ms' }, splitLine: { show: false } }],
    series: [
      { name: '成功率', type: 'line', yAxisIndex: 0, data: selectedHistory.value.map((row) => Number(row.successRate.toFixed(2))), symbolSize: 5, lineStyle: { width: 2, color: theme.info }, itemStyle: { color: theme.info }, areaStyle: { color: theme.grid } },
      { name: '平均延迟', type: 'line', yAxisIndex: 1, data: selectedHistory.value.map((row) => Math.round(row.averageLatencyMs)), symbolSize: 5, lineStyle: { width: 2, color: theme.accent }, itemStyle: { color: theme.accentBright } }
    ]
  } as EChartsOption, { notMerge: true });
}

onMounted(() => { window.addEventListener('biga-theme-change', renderHistoryChart); refresh(); timer = window.setInterval(refresh, 1_000); });
watch([activeTab, selectedHost, selectedHistory], () => nextTick(renderHistoryChart), { deep: true });
onBeforeUnmount(() => { window.removeEventListener('biga-theme-change', renderHistoryChart); if (timer) window.clearInterval(timer); resizeObserver?.disconnect(); chart?.dispose(); chart = null; });
</script>

<style scoped>
.data-source-health { width: min(1060px, calc(100vw - 72px)); grid-template-rows: 52px minmax(0, 1fr) 44px; }
.source-health-tabs { display: flex; align-self: stretch; gap: 14px; }
.source-health-tabs button { position: relative; border: 0; background: transparent; color: var(--text-muted); font-size: 11px; cursor: pointer; }
.source-health-tabs button.active { color: var(--accent-bright); }
.source-health-tabs button.active::after { position: absolute; right: 1px; bottom: 0; left: 1px; height: 2px; background: var(--accent); content: ''; }
.source-health-summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border-bottom: 1px solid rgba(var(--border-rgb), .08); background: var(--bg-panel-alt); }
.source-health-summary div { min-width: 0; display: grid; align-content: center; gap: 5px; padding: 0 14px; border-right: 1px solid rgba(var(--border-rgb), .07); }
.source-health-summary div:last-child { border-right: 0; }
.source-health-summary span, .source-health-summary em { color: var(--text-subtle); font-size: 9px; font-style: normal; }
.source-health-summary strong { color: var(--text-primary); font-size: 20px; }
.source-health-table { min-width: 0; min-height: 0; overflow-y: auto; }
.source-health-row { min-width: 860px; min-height: 44px; display: grid; grid-template-columns: minmax(200px, 1fr) 72px 55px 70px 82px 82px 54px 82px; align-items: center; gap: 10px; padding: 0 14px; border-bottom: 1px solid rgba(var(--border-rgb), .055); color: var(--text-secondary); font-size: 10px; text-align: right; }
.source-health-row.head { position: sticky; z-index: 2; top: 0; min-height: 30px; background: var(--bg-header); color: var(--text-muted); font-weight: 700; }
.source-health-row > :first-child { overflow: hidden; color: var(--text-primary); text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.source-status { display: inline-flex; align-items: center; justify-content: flex-end; gap: 5px; }
.source-status i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.source-health-row time { color: var(--text-subtle); }
.source-trend-view { min-width: 0; min-height: 0; display: grid; grid-template-rows: 42px minmax(170px, .9fr) minmax(120px, .6fr); }
.source-trend-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 13px; border-bottom: 1px solid rgba(var(--border-rgb), .07); background: var(--bg-panel-alt); color: var(--text-subtle); font-size: 10px; }
.source-trend-toolbar label { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); }
.source-trend-toolbar select { width: 250px; height: 28px; border: 1px solid rgba(var(--border-rgb), .1); border-radius: 5px; padding: 0 8px; outline: 0; background: var(--bg-elevated); color: var(--text-strong); font-size: 10px; }
.source-trend-chart { width: 100%; min-width: 0; min-height: 0; border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.source-history-table { min-width: 0; min-height: 0; overflow-y: auto; }
.source-history-row { min-height: 34px; display: grid; grid-template-columns: minmax(120px, 1fr) 90px 100px 120px 90px 90px; align-items: center; gap: 8px; padding: 0 14px; border-bottom: 1px solid rgba(var(--border-rgb), .05); color: var(--text-secondary); font-size: 10px; text-align: right; }
.source-history-row.head { position: sticky; z-index: 2; top: 0; min-height: 28px; background: var(--bg-header); color: var(--text-muted); font-weight: 700; }
.source-history-row > :first-child { text-align: left; }
.healthy { color: var(--info) !important; }.down { color: #d96f6f !important; }.watch { color: var(--accent) !important; }
</style>
