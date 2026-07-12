<template>
  <section class="finance-trend">
    <div class="finance-metric-strip" role="tablist" aria-label="财务指标">
      <button
        v-for="item in metrics"
        :key="item.key"
        type="button"
        :class="{ active: metricKey === item.key }"
        :title="item.label"
        @click="selectMetric(item.key)"
      >
        <span>{{ item.shortLabel }}</span>
        <strong>{{ formatValue(metricLatestValue(item), item.unit) }}</strong>
        <em v-if="item.growthKey" :class="growthClass(metricLatestGrowth(item))">{{ formatGrowth(metricLatestGrowth(item)) }}</em>
        <em v-else>{{ latestReport?.reportName ?? '--' }}</em>
      </button>
    </div>

    <div class="finance-trend-toolbar">
      <div class="finance-trend-title">
        <strong>{{ activeMetric.label }}</strong>
        <span>{{ activeModeLabel }} · {{ chartPoints.length }}期</span>
      </div>
      <span class="finance-trend-signal" :class="trendSignal.tone">{{ trendSignal.label }}</span>
      <div class="finance-period-tabs" role="tablist" aria-label="财务口径">
        <button
          v-for="item in availableModes"
          :key="item.key"
          type="button"
          :class="{ active: mode === item.key }"
          @click="mode = item.key"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <div class="finance-chart-head">
      <div>
        <i class="value-dot" />
        <span>{{ activeMetric.shortLabel }}</span>
        <strong>{{ latestPoint ? formatValue(latestPoint.value, activeMetric.unit) : '--' }}</strong>
      </div>
      <div v-if="activeMetric.growthKey">
        <i class="growth-line" />
        <span>同比</span>
        <strong :class="growthClass(latestPoint?.growth ?? null)">{{ formatGrowth(latestPoint?.growth ?? null) }}</strong>
      </div>
      <em>{{ latestPoint?.fullLabel ?? '--' }}</em>
    </div>

    <div ref="chartElement" class="finance-chart-canvas" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsOption } from 'echarts';
import type { StockFinancialReport } from '@/types/stockInfo';
import { chartThemeTokens } from '@/services/appearance';

echarts.use([BarChart, LineChart, DataZoomComponent, GridComponent, TooltipComponent, CanvasRenderer]);

type MetricKey = 'revenue' | 'netProfit' | 'roe' | 'grossMargin' | 'debtRatio' | 'eps' | 'operatingCashflowPerShare';
type PeriodMode = 'quarter' | 'cumulative' | 'annual';
type MetricUnit = 'amount' | 'percent' | 'perShare';

interface MetricDefinition {
  key: MetricKey;
  label: string;
  shortLabel: string;
  unit: MetricUnit;
  growthKey?: 'revenueGrowth' | 'netProfitGrowth';
}

interface ChartPoint {
  label: string;
  fullLabel: string;
  value: number | null;
  growth: number | null;
}

interface TooltipSeriesParam {
  seriesName?: string;
  value?: number | null;
  axisValueLabel?: string;
  marker?: string;
}

const props = defineProps<{ reports: StockFinancialReport[] }>();

const metrics: MetricDefinition[] = [
  { key: 'revenue', label: '营业收入', shortLabel: '营收', unit: 'amount', growthKey: 'revenueGrowth' },
  { key: 'netProfit', label: '归母净利润', shortLabel: '归母净利', unit: 'amount', growthKey: 'netProfitGrowth' },
  { key: 'roe', label: '净资产收益率', shortLabel: 'ROE', unit: 'percent' },
  { key: 'grossMargin', label: '销售毛利率', shortLabel: '毛利率', unit: 'percent' },
  { key: 'debtRatio', label: '资产负债率', shortLabel: '负债率', unit: 'percent' },
  { key: 'eps', label: '每股收益', shortLabel: 'EPS', unit: 'perShare' },
  { key: 'operatingCashflowPerShare', label: '每股经营现金流', shortLabel: '每股现金流', unit: 'perShare' }
];

const amountModes: Array<{ key: PeriodMode; label: string }> = [
  { key: 'quarter', label: '单季度' },
  { key: 'cumulative', label: '累计' },
  { key: 'annual', label: '年度' }
];
const ratioModes: Array<{ key: PeriodMode; label: string }> = [
  { key: 'cumulative', label: '报告期' },
  { key: 'annual', label: '年度' }
];

const chartElement = ref<HTMLDivElement | null>(null);
const metricKey = ref<MetricKey>('revenue');
const mode = ref<PeriodMode>('quarter');
let chart: ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const activeMetric = computed(() => metrics.find((item) => item.key === metricKey.value) ?? metrics[0]);
const availableModes = computed(() => activeMetric.value.unit === 'amount' ? amountModes : ratioModes);
const chartPoints = computed(() => buildChartPoints(props.reports, activeMetric.value, mode.value));
const latestPoint = computed(() => chartPoints.value.at(-1) ?? null);
const latestReport = computed(() => [...props.reports].sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0] ?? null);
const activeModeLabel = computed(() => availableModes.value.find((item) => item.key === mode.value)?.label ?? '报告期');
const trendSignal = computed(() => {
  const points = chartPoints.value;
  if (activeMetric.value.growthKey) {
    const growthValues = points.map((item) => item.growth).filter((value): value is number => value !== null).slice(-2);
    const currentGrowth = growthValues.at(-1);
    if (currentGrowth === undefined) return { label: '同比 --', tone: '' };
    const previousGrowth = growthValues.at(-2);
    const improving = previousGrowth !== undefined && currentGrowth - previousGrowth >= 1;
    const label = improving
      ? `增速改善 ${formatGrowth(currentGrowth)}`
      : `${currentGrowth >= 0 ? '同比增长' : '同比下降'} ${formatGrowth(currentGrowth)}`;
    return { label, tone: currentGrowth >= 0 ? 'up' : 'down' };
  }

  const values = points.map((item) => item.value).filter((value): value is number => value !== null).slice(-2);
  if (values.length < 2) return { label: '数据不足', tone: '' };
  const previous = values.at(-2) ?? 0;
  const current = values.at(-1) ?? 0;
  const difference = current - previous;
  const delta = previous === 0 ? null : (difference / Math.abs(previous)) * 100;
  if (delta === null) return { label: '较上期 --', tone: '' };
  const label = activeMetric.value.unit === 'percent'
    ? `较上期 ${difference > 0 ? '+' : ''}${difference.toFixed(2)}pct`
    : `较上期 ${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
  return { label, tone: difference >= 0 ? 'up' : 'down' };
});

function selectMetric(key: MetricKey) {
  metricKey.value = key;
  const metric = metrics.find((item) => item.key === key);
  if (metric?.unit !== 'amount' && mode.value === 'quarter') {
    mode.value = 'cumulative';
  }
}

function metricLatestValue(metric: MetricDefinition) {
  return latestReport.value ? nullableMetric(latestReport.value, metric.key) : null;
}

function metricLatestGrowth(metric: MetricDefinition) {
  if (!latestReport.value || !metric.growthKey) return null;
  return latestReport.value[metric.growthKey];
}

function renderChart() {
  if (!chartElement.value) return;
  chart ??= echarts.init(chartElement.value, undefined, { renderer: 'canvas' });
  const theme = chartThemeTokens();

  const metric = activeMetric.value;
  const points = chartPoints.value;
  const hasGrowth = Boolean(metric.growthKey);
  const visibleCount = Math.min(mode.value === 'annual' ? 8 : 12, points.length);
  const start = points.length > visibleCount ? ((points.length - visibleCount) / points.length) * 100 : 0;

  const option = {
    animationDuration: 280,
    grid: { left: 58, right: hasGrowth ? 54 : 22, top: 25, bottom: 48, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.tooltip,
      borderColor: theme.border,
      textStyle: { color: theme.tooltipText, fontSize: 11 },
      axisPointer: { type: 'line', lineStyle: { color: theme.border, type: 'dashed' } },
      formatter: (params: unknown) => {
        const rows = (Array.isArray(params) ? params : [params]) as TooltipSeriesParam[];
        const title = rows[0]?.axisValueLabel ?? '';
        return [title, ...rows.map((row) => {
          const value = typeof row.value === 'number' ? row.value : null;
          const text = row.seriesName === '同比' ? formatGrowth(value) : formatValue(value, metric.unit);
          return `${row.marker ?? ''}${row.seriesName ?? ''}<b style="float:right;margin-left:18px">${text}</b>`;
        })].join('<br/>');
      }
    },
    xAxis: {
      type: 'category',
      data: points.map((item) => item.label),
      axisLine: { lineStyle: { color: theme.border } },
      axisTick: { show: false },
      axisLabel: {
        color: theme.muted,
        fontSize: 10,
        lineHeight: 11,
        interval: 0,
        hideOverlap: true,
        formatter: (value: string) => value.includes('Q') ? value.replace('Q', '\nQ') : value
      }
    },
    yAxis: [
      {
        type: 'value',
        scale: metric.unit !== 'amount',
        splitNumber: 3,
        axisLabel: { color: theme.faint, fontSize: 9, formatter: (value: number) => formatAxisValue(value, metric.unit) },
        splitLine: { lineStyle: { color: theme.grid } }
      },
      {
        type: 'value',
        show: hasGrowth,
        scale: true,
        splitNumber: 3,
        axisLabel: { color: theme.accent, fontSize: 9, formatter: (value: number) => `${value.toFixed(0)}%` },
        splitLine: { show: false }
      }
    ],
    dataZoom: points.length > 6 ? [{
      type: 'slider',
      height: 12,
      bottom: 5,
      start,
      end: 100,
      showDetail: false,
      showDataShadow: false,
      borderColor: 'transparent',
      backgroundColor: theme.elevated,
      fillerColor: theme.accentSoft,
      handleSize: 10,
      handleStyle: { color: theme.faint, borderColor: theme.muted },
      moveHandleStyle: { color: theme.faint }
    }] : [],
    series: [
      {
        name: metric.label,
        type: 'bar',
        yAxisIndex: 0,
        barMaxWidth: 34,
        data: points.map((item) => item.value),
        label: {
          show: true,
          position: 'top',
          distance: 3,
          color: theme.muted,
          fontSize: 8,
          formatter: (params: { value?: unknown }) => typeof params.value === 'number' ? formatCompactValue(params.value, metric.unit) : ''
        },
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: (params: { value?: unknown }) => (typeof params.value === 'number' ? params.value : 0) >= 0 ? theme.info : theme.down
        },
        emphasis: { itemStyle: { color: theme.accentBright } },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: theme.border, type: 'dashed' }, data: [{ yAxis: 0 }] }
      },
      ...(hasGrowth ? [{
        name: '同比',
        type: 'line' as const,
        yAxisIndex: 1,
        data: points.map((item) => item.growth),
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { width: 2, color: theme.accent },
        itemStyle: { color: theme.accent }
      }] : [])
    ]
  } as EChartsOption;

  chart.setOption(option, { notMerge: true });
}

function buildChartPoints(reports: StockFinancialReport[], metric: MetricDefinition, periodMode: PeriodMode): ChartPoint[] {
  const ordered = [...reports]
    .filter((item) => item.reportDate)
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate));

  if (periodMode === 'annual') {
    return ordered.filter((item) => reportQuarter(item.reportDate) === 4).map((item) => rawPoint(item, metric, '年报'));
  }

  if (periodMode !== 'quarter' || metric.unit !== 'amount') {
    return ordered.map((item) => rawPoint(item, metric, quarterLabel(item.reportDate)));
  }

  const byPeriod = new Map(ordered.map((item) => [periodKey(item.reportDate), item]));
  const singleQuarterValues = new Map<string, number | null>();

  ordered.forEach((item) => {
    const year = reportYear(item.reportDate);
    const quarter = reportQuarter(item.reportDate);
    const current = nullableMetric(item, metric.key);
    const previous = quarter > 1 ? byPeriod.get(`${year}-Q${quarter - 1}`) : null;
    const previousValue = previous ? nullableMetric(previous, metric.key) : null;
    singleQuarterValues.set(`${year}-Q${quarter}`, current === null || (quarter > 1 && previousValue === null) ? null : current - (previousValue ?? 0));
  });

  return ordered.map((item) => {
    const year = reportYear(item.reportDate);
    const quarter = reportQuarter(item.reportDate);
    const value = singleQuarterValues.get(`${year}-Q${quarter}`) ?? null;
    const lastYearValue = singleQuarterValues.get(`${year - 1}-Q${quarter}`) ?? null;
    return {
      label: `${String(year).slice(2)}Q${quarter}`,
      fullLabel: `${year}年Q${quarter}单季`,
      value,
      growth: value === null || lastYearValue === null || lastYearValue === 0 ? null : ((value / Math.abs(lastYearValue)) - Math.sign(lastYearValue)) * 100
    };
  });
}

function rawPoint(report: StockFinancialReport, metric: MetricDefinition, suffix: string): ChartPoint {
  const year = reportYear(report.reportDate);
  const growth = metric.growthKey ? report[metric.growthKey] : null;
  return {
    label: suffix === '年报' ? String(year) : `${String(year).slice(2)}${suffix}`,
    fullLabel: report.reportName,
    value: nullableMetric(report, metric.key),
    growth
  };
}

function nullableMetric(report: StockFinancialReport, key: MetricKey) {
  const value = report[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function reportYear(date: string) {
  return Number(date.slice(0, 4));
}

function reportQuarter(date: string) {
  const month = Number(date.slice(5, 7));
  return Math.max(1, Math.min(4, Math.ceil(month / 3)));
}

function periodKey(date: string) {
  return `${reportYear(date)}-Q${reportQuarter(date)}`;
}

function quarterLabel(date: string) {
  return `Q${reportQuarter(date)}`;
}

function formatAxisValue(value: number, unit: MetricUnit) {
  if (unit === 'percent') return `${value.toFixed(0)}%`;
  if (unit === 'perShare') return value.toFixed(1);
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(abs >= 1_000_000_000 ? 0 : 1)}亿`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(0)}万`;
  return value.toFixed(0);
}

function formatCompactValue(value: number, unit: MetricUnit) {
  if (unit === 'percent') return `${value.toFixed(1)}%`;
  if (unit === 'perShare') return value.toFixed(2);
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(0)}亿`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(0)}万`;
  return value.toFixed(0);
}

function formatValue(value: number | null, unit: MetricUnit) {
  if (value === null || !Number.isFinite(value)) return '--';
  if (unit === 'percent') return `${value.toFixed(2)}%`;
  if (unit === 'perShare') return `${value.toFixed(3)}元`;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(2)}亿`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)}万`;
  return value.toFixed(0);
}

function formatGrowth(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function growthClass(value: number | null) {
  if (value === null || value === 0) return '';
  return value > 0 ? 'up' : 'down';
}

onMounted(() => {
  window.addEventListener('biga-theme-change', renderChart);
  nextTick(renderChart);
  if (chartElement.value) {
    resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(chartElement.value);
  }
});

watch([() => props.reports, metricKey, mode], () => nextTick(renderChart), { deep: true });

onBeforeUnmount(() => {
  window.removeEventListener('biga-theme-change', renderChart);
  resizeObserver?.disconnect();
  chart?.dispose();
  chart = null;
});
</script>
