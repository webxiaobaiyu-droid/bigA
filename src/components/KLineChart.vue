<template>
  <div ref="containerEl" class="kline-chart" tabindex="0" @keydown="handleChartKeydown">
    <div ref="chartEl" class="kline-chart-canvas" />
    <div v-if="mode !== 'intraday' && activeDetail" class="candle-hover-strip" :class="{ pinned: pinnedIndex !== null }">
      <strong>{{ activeDetail.date }}</strong>
      <span>开 <b>{{ activeDetail.open }}</b></span>
      <span>高 <b class="up">{{ activeDetail.high }}</b></span>
      <span>低 <b class="down">{{ activeDetail.low }}</b></span>
      <span>收 <b :class="activeDetail.changeClass">{{ activeDetail.close }}</b></span>
      <span>涨跌 <b :class="activeDetail.changeClass">{{ activeDetail.changePct }}</b></span>
      <span>量 <b>{{ activeDetail.volume }}</b></span>
      <span>额 <b>{{ activeDetail.amount }}</b></span>
      <em>{{ pinnedIndex !== null ? '已锁定 · ← → 切换' : '单击固定' }}</em>
    </div>
    <aside v-if="mode !== 'intraday' && pinnedIndex !== null && activeDetail" class="candle-detail-panel">
      <header>
        <div><Pin :size="13" /><strong>{{ activeDetail.date }}</strong><span>{{ activeDetail.weekday }}</span></div>
        <button type="button" title="取消锁定" @click="clearPinnedCandle"><X :size="13" /></button>
      </header>
      <div class="candle-detail-price">
        <strong :class="activeDetail.changeClass">{{ activeDetail.close }}</strong>
        <span :class="activeDetail.changeClass">{{ activeDetail.change }} / {{ activeDetail.changePct }}</span>
      </div>
      <div class="candle-detail-grid">
        <div><span>开盘</span><strong>{{ activeDetail.open }}</strong></div>
        <div><span>最高</span><strong class="up">{{ activeDetail.high }}</strong></div>
        <div><span>最低</span><strong class="down">{{ activeDetail.low }}</strong></div>
        <div><span>振幅</span><strong>{{ activeDetail.amplitude }}</strong></div>
        <div><span>成交量</span><strong>{{ activeDetail.volume }}</strong></div>
        <div><span>成交额</span><strong>{{ activeDetail.amount }}</strong></div>
        <div><span>换手率</span><strong>{{ activeDetail.turnoverRate }}</strong></div>
        <div><span>相对5日量</span><strong>{{ activeDetail.relativeVolume }}</strong></div>
      </div>
      <div class="candle-structure">
        <div><span>实体</span><strong>{{ activeDetail.bodyPct }}</strong></div>
        <div><span>上影</span><strong>{{ activeDetail.upperShadowPct }}</strong></div>
        <div><span>下影</span><strong>{{ activeDetail.lowerShadowPct }}</strong></div>
      </div>
      <div class="candle-ma-list">
        <span><i class="ma5-dot" />MA5 <strong>{{ activeDetail.ma5 }}</strong></span>
        <span><i class="ma10-dot" />MA10 <strong>{{ activeDetail.ma10 }}</strong></span>
        <span><i class="ma20-dot" />MA20 <strong>{{ activeDetail.ma20 }}</strong></span>
      </div>
      <div class="candle-indicator-detail">
        <span v-for="item in activeDetail.indicators" :key="item.label" :style="{ color: item.color }">{{ item.label }} <strong>{{ item.value }}</strong></span>
      </div>
      <footer><span>← → 前后周期</span><span>Esc 取消</span></footer>
    </aside>
    <div v-if="mode !== 'intraday' && showVolume" class="chart-indicator-tools">
      <div class="chart-indicator-switch" aria-label="K线副图指标">
        <button v-for="item in indicatorOptions" :key="item.key" type="button" :class="{ active: selectedIndicator === item.key }" @click="selectedIndicator = item.key">{{ item.label }}</button>
      </div>
      <div class="chart-indicator-legend">
        <span v-for="item in indicatorLegend" :key="item.label" :style="{ color: item.color }">{{ item.label }} {{ item.value }}</span>
      </div>
    </div>
    <div v-if="mode === 'intraday'" class="intraday-time-axis" aria-hidden="true">
      <span v-for="item in intradayTimeLabels" :key="item.label" :style="{ left: `${item.position}%` }">{{ item.label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Pin, X } from '@lucide/vue';
import {
  ColorType,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  LineStyle,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
  type WhitespaceData
} from 'lightweight-charts';
import { kdj, macd, rsi, simpleMovingAverage } from '@/services/indicators';
import { chartThemeTokens } from '@/services/appearance';
import type { Candle, ChartGuide, ChartMarker } from '@/types/market';

const props = withDefaults(
  defineProps<{
    candles: Candle[];
    mode?: 'kline' | 'intraday';
    showMa?: boolean;
    showVolume?: boolean;
    referencePrice?: number | null;
    priceLimitPct?: number | null;
    markers?: ChartMarker[];
    guides?: ChartGuide[];
    indicator?: ChartIndicator;
  }>(),
  {
    mode: 'kline',
    showMa: true,
    showVolume: true,
    referencePrice: null,
    priceLimitPct: null,
    markers: () => [],
    guides: () => [],
    indicator: 'volume'
  }
);

type HistogramPoint = HistogramData | WhitespaceData;
type ChartIndicator = 'volume' | 'macd' | 'rsi' | 'kdj';

const indicatorOptions: Array<{ key: ChartIndicator; label: string }> = [
  { key: 'volume', label: 'VOL' },
  { key: 'macd', label: 'MACD' },
  { key: 'rsi', label: 'RSI' },
  { key: 'kdj', label: 'KDJ' }
];
const intradayTimeLabels = [
  { label: '09:30', position: 0 },
  { label: '09:45', position: 6.25 },
  { label: '10:00', position: 12.5 },
  { label: '10:15', position: 18.75 },
  { label: '10:30', position: 25 },
  { label: '10:45', position: 31.25 },
  { label: '11:00', position: 37.5 },
  { label: '11:15', position: 43.75 },
  { label: '11:30/13:00', position: 50 },
  { label: '13:15', position: 56.25 },
  { label: '13:30', position: 62.5 },
  { label: '13:45', position: 68.75 },
  { label: '14:00', position: 75 },
  { label: '14:15', position: 81.25 },
  { label: '14:30', position: 87.5 },
  { label: '14:45', position: 93.75 },
  { label: '15:00', position: 100 }
];
const CHART_INDICATOR_STORAGE_KEY = 'biga.chart-indicator.v1';

const MORNING_START_MINUTE = 9 * 60 + 30;
const MORNING_END_MINUTE = 11 * 60 + 30;
const AFTERNOON_START_MINUTE = 13 * 60;
const AFTERNOON_END_MINUTE = 15 * 60;
const COMPRESSED_NOON_GAP_MINUTES = AFTERNOON_START_MINUTE - MORNING_END_MINUTE;
const AFTERNOON_RENDER_OFFSET_SECONDS = 1;

let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<'Candlestick'> | null = null;
let volumeSeries: ISeriesApi<'Histogram'> | null = null;
let ma5Series: ISeriesApi<'Line'> | null = null;
let ma10Series: ISeriesApi<'Line'> | null = null;
let ma20Series: ISeriesApi<'Line'> | null = null;
let intradayPriceSeries: ISeriesApi<'Line'> | null = null;
let intradayAverageSeries: ISeriesApi<'Line'> | null = null;
let macdHistogramSeries: ISeriesApi<'Histogram'> | null = null;
let macdDifSeries: ISeriesApi<'Line'> | null = null;
let macdDeaSeries: ISeriesApi<'Line'> | null = null;
let rsi6Series: ISeriesApi<'Line'> | null = null;
let rsi12Series: ISeriesApi<'Line'> | null = null;
let kdjKSeries: ISeriesApi<'Line'> | null = null;
let kdjDSeries: ISeriesApi<'Line'> | null = null;
let kdjJSeries: ISeriesApi<'Line'> | null = null;
let zeroPriceLine: IPriceLine | null = null;
let chartGuides: IPriceLine[] = [];
let resizeObserver: ResizeObserver | null = null;
let resizeFrame = 0;

const chartEl = ref<HTMLDivElement | null>(null);
const containerEl = ref<HTMLDivElement | null>(null);
const hoveredIndex = ref<number | null>(null);
const pinnedIndex = ref<number | null>(null);
const selectedIndicator = ref<ChartIndicator>(loadChartIndicator(props.indicator));
const detailSeries = computed(() => ({
  ma5: simpleMovingAverage(props.candles, 5),
  ma10: simpleMovingAverage(props.candles, 10),
  ma20: simpleMovingAverage(props.candles, 20),
  macd: macd(props.candles),
  rsi6: rsi(props.candles, 6),
  rsi12: rsi(props.candles, 12),
  kdj: kdj(props.candles)
}));
const activeDetail = computed(() => {
  const index = pinnedIndex.value ?? hoveredIndex.value;
  return index === null ? null : buildCandleDetail(index);
});
const indicatorLegend = computed(() => {
  if (!props.candles.length) return [];
  if (selectedIndicator.value === 'volume') return [{ label: 'VOL', value: formatIndicatorVolume(props.candles.at(-1)?.volume ?? 0), color: 'var(--text-muted)' }];
  if (selectedIndicator.value === 'macd') {
    const values = macd(props.candles);
    return [
      { label: 'DIF', value: formatIndicatorValue(values.dif.at(-1)), color: 'var(--accent-bright)' },
      { label: 'DEA', value: formatIndicatorValue(values.dea.at(-1)), color: '#41c6c3' },
      { label: 'BAR', value: formatIndicatorValue(values.bars.at(-1)), color: (values.bars.at(-1) ?? 0) >= 0 ? 'var(--market-up)' : 'var(--market-down)' }
    ];
  }
  if (selectedIndicator.value === 'rsi') {
    return [
      { label: 'RSI6', value: formatIndicatorValue(rsi(props.candles, 6).at(-1), 1), color: 'var(--accent-bright)' },
      { label: 'RSI12', value: formatIndicatorValue(rsi(props.candles, 12).at(-1), 1), color: '#a795d0' }
    ];
  }
  const values = kdj(props.candles);
  return [
    { label: 'K', value: formatIndicatorValue(values.k.at(-1), 1), color: 'var(--accent-bright)' },
    { label: 'D', value: formatIndicatorValue(values.d.at(-1), 1), color: '#41c6c3' },
    { label: 'J', value: formatIndicatorValue(values.j.at(-1), 1), color: 'var(--market-up)' }
  ];
});
const intradayTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});
const dayFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

onMounted(() => {
  window.addEventListener('biga-theme-change', handleThemeChange);
  void mountChart();
});

onBeforeUnmount(() => {
  window.removeEventListener('biga-theme-change', handleThemeChange);
  if (resizeFrame) {
    window.cancelAnimationFrame(resizeFrame);
  }
  resizeObserver?.disconnect();
  chart?.unsubscribeCrosshairMove(handleCrosshairMove);
  chart?.unsubscribeClick(handleChartClick);
  chart?.remove();
});

watch(
  () => [props.candles, props.mode, props.showMa, props.showVolume, props.markers, props.guides, props.indicator, selectedIndicator.value],
  () => queueSyncChart(),
  { deep: true }
);
watch(() => props.indicator, (indicator) => {
  if (!localStorage.getItem(CHART_INDICATOR_STORAGE_KEY)) selectedIndicator.value = indicator;
});
watch(selectedIndicator, (indicator) => {
  localStorage.setItem(CHART_INDICATOR_STORAGE_KEY, indicator);
});

async function mountChart() {
  await nextTick();

  if (!chartEl.value) {
    return;
  }

  const size = measureChart();
  const theme = chartThemeTokens();
  chart = createChart(chartEl.value, {
    width: size.width,
    height: size.height,
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: theme.muted,
      fontFamily: 'Inter, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif'
    },
    localization: {
      timeFormatter: formatChartTime
    },
    grid: {
      vertLines: { color: theme.grid },
      horzLines: { color: theme.grid }
    },
    crosshair: {
      vertLine: { color: theme.accent },
      horzLine: { color: theme.accent }
    },
    handleScale: {
      mouseWheel: false,
      pinch: false,
      axisPressedMouseMove: false,
      axisDoubleClickReset: false
    },
    handleScroll: {
      mouseWheel: false,
      pressedMouseMove: false,
      horzTouchDrag: false,
      vertTouchDrag: false
    },
    kineticScroll: {
      touch: false,
      mouse: false
    },
    rightPriceScale: {
      borderColor: theme.border,
      scaleMargins: { top: 0.08, bottom: 0.22 }
    },
    timeScale: {
      borderColor: theme.border,
      rightOffset: 3,
      barSpacing: 7,
      fixLeftEdge: true,
      timeVisible: true,
      secondsVisible: false,
      tickMarkFormatter: (time: Time) => props.mode === 'intraday' ? '' : formatChartTime(time)
    }
  });

  candleSeries = chart.addCandlestickSeries({
    upColor: theme.up,
    downColor: theme.down,
    borderUpColor: theme.up,
    borderDownColor: theme.down,
    wickUpColor: theme.up,
    wickDownColor: theme.down,
    priceLineColor: theme.accent
  });

  ma5Series = chart.addLineSeries({ color: '#f4c84a', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  ma10Series = chart.addLineSeries({ color: '#41c6c3', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  ma20Series = chart.addLineSeries({ color: '#b38bff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  intradayPriceSeries = chart.addLineSeries({
    color: theme.accentBright,
    lineWidth: 2,
    priceLineColor: theme.accent,
    autoscaleInfoProvider: intradayAutoscaleInfo
  });
  intradayAverageSeries = chart.addLineSeries({
    color: '#41c6c3',
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    autoscaleInfoProvider: intradayAutoscaleInfo
  });

  volumeSeries = chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
    lastValueVisible: false,
    priceLineVisible: false
  });
  volumeSeries.priceScale().applyOptions({
    scaleMargins: {
      top: 0.78,
      bottom: 0
    }
  });

  macdHistogramSeries = chart.addHistogramSeries({ priceScaleId: 'indicator', priceLineVisible: false, lastValueVisible: false });
  macdDifSeries = chart.addLineSeries({ priceScaleId: 'indicator', color: theme.accentBright, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  macdDeaSeries = chart.addLineSeries({ priceScaleId: 'indicator', color: '#41c6c3', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  rsi6Series = chart.addLineSeries({ priceScaleId: 'indicator', color: theme.accentBright, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  rsi12Series = chart.addLineSeries({ priceScaleId: 'indicator', color: '#a795d0', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  kdjKSeries = chart.addLineSeries({ priceScaleId: 'indicator', color: theme.accentBright, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  kdjDSeries = chart.addLineSeries({ priceScaleId: 'indicator', color: '#41c6c3', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  kdjJSeries = chart.addLineSeries({ priceScaleId: 'indicator', color: theme.up, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  chart.priceScale('indicator').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 }, borderVisible: false });

  macdDifSeries.createPriceLine({ price: 0, color: theme.border, lineWidth: 1, lineStyle: LineStyle.Dotted, lineVisible: true, axisLabelVisible: false, title: '' });
  [30, 70].forEach((price) => rsi6Series!.createPriceLine({ price, color: theme.border, lineWidth: 1, lineStyle: LineStyle.Dashed, lineVisible: true, axisLabelVisible: false, title: `${price}` }));
  [20, 80].forEach((price) => kdjKSeries!.createPriceLine({ price, color: theme.border, lineWidth: 1, lineStyle: LineStyle.Dashed, lineVisible: true, axisLabelVisible: false, title: `${price}` }));

  resizeObserver = new ResizeObserver(([entry]) => {
    const width = Math.max(1, Math.floor(entry.contentRect.width));
    const height = Math.max(1, Math.floor(entry.contentRect.height));
    chart?.resize(width, height);
    queueSyncChart();
  });
  resizeObserver.observe(chartEl.value);
  chart.subscribeCrosshairMove(handleCrosshairMove);
  chart.subscribeClick(handleChartClick);
  resizeChart();
  syncChart();
}

function syncChart() {
  if (
    !candleSeries ||
    !volumeSeries ||
    !ma5Series ||
    !ma10Series ||
    !ma20Series ||
    !intradayPriceSeries ||
    !intradayAverageSeries ||
    !macdHistogramSeries ||
    !macdDifSeries ||
    !macdDeaSeries ||
    !rsi6Series ||
    !rsi12Series ||
    !kdjKSeries ||
    !kdjDSeries ||
    !kdjJSeries
  ) {
    return;
  }

  if (!props.candles.length) {
    candleSeries.setData([]);
    volumeSeries.setData([]);
    ma5Series.setData([]);
    ma10Series.setData([]);
    ma20Series.setData([]);
    intradayPriceSeries.setData([]);
    intradayAverageSeries.setData([]);
    macdHistogramSeries.setData([]);
    macdDifSeries.setData([]);
    macdDeaSeries.setData([]);
    rsi6Series.setData([]);
    rsi12Series.setData([]);
    kdjKSeries.setData([]);
    kdjDSeries.setData([]);
    kdjJSeries.setData([]);
    candleSeries.setMarkers([]);
    intradayPriceSeries.setMarkers([]);
    clearChartGuides();
    return;
  }

  const candleData: CandlestickData[] = props.candles.map((candle) => ({
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  }));
  const isIntraday = props.mode === 'intraday';
  const activeIndicator = isIntraday ? (props.showVolume ? 'volume' : 'none') : (props.showVolume ? selectedIndicator.value : 'none');

  volumeSeries.setData(activeIndicator === 'volume' ? (isIntraday ? toIntradayVolumeData() : toVolumeData()) : []);
  candleSeries.setData(isIntraday ? [] : candleData);
  ma5Series.setData(!isIntraday && props.showMa ? toMaData(5) : []);
  ma10Series.setData(!isIntraday && props.showMa ? toMaData(10) : []);
  ma20Series.setData(!isIntraday && props.showMa ? toMaData(20) : []);
  intradayPriceSeries.setData(isIntraday ? toIntradayPriceData() : []);
  intradayAverageSeries.setData(isIntraday ? toIntradayAverageData() : []);
  syncIndicatorData(activeIndicator);
  candleSeries.setMarkers(isIntraday ? [] : props.markers.map((marker) => ({
    time: marker.time as UTCTimestamp,
    position: marker.position,
    color: marker.color,
    shape: marker.shape,
    text: marker.text,
    size: marker.size ?? 1
  })));
  intradayPriceSeries.setMarkers(isIntraday ? props.markers.flatMap((marker) => {
    const time = toIntradayRenderTime(marker.time);
    return time === null ? [] : [{
      time,
      position: marker.position,
      color: marker.color,
      shape: marker.shape,
      text: marker.text,
      size: marker.size ?? 1
    }];
  }) : []);

  candleSeries.applyOptions({ visible: !isIntraday });
  ma5Series.applyOptions({ visible: !isIntraday && props.showMa });
  ma10Series.applyOptions({ visible: !isIntraday && props.showMa });
  ma20Series.applyOptions({ visible: !isIntraday && props.showMa });
  intradayPriceSeries.applyOptions({ visible: isIntraday, autoscaleInfoProvider: isIntraday ? intradayAutoscaleInfo : undefined });
  intradayAverageSeries.applyOptions({ visible: isIntraday, autoscaleInfoProvider: isIntraday ? intradayAutoscaleInfo : undefined });
  volumeSeries.applyOptions({ visible: activeIndicator === 'volume' });
  macdHistogramSeries.applyOptions({ visible: activeIndicator === 'macd' });
  macdDifSeries.applyOptions({ visible: activeIndicator === 'macd' });
  macdDeaSeries.applyOptions({ visible: activeIndicator === 'macd' });
  rsi6Series.applyOptions({ visible: activeIndicator === 'rsi' });
  rsi12Series.applyOptions({ visible: activeIndicator === 'rsi' });
  kdjKSeries.applyOptions({ visible: activeIndicator === 'kdj' });
  kdjDSeries.applyOptions({ visible: activeIndicator === 'kdj' });
  kdjJSeries.applyOptions({ visible: activeIndicator === 'kdj' });
  chart?.priceScale('right').applyOptions({
    scaleMargins: isIntraday ? { top: 0, bottom: 0 } : activeIndicator === 'none' ? { top: 0.08, bottom: 0.08 } : { top: 0.08, bottom: 0.24 }
  });
  syncChartGuides(isIntraday);
  syncZeroPriceLine(isIntraday);
  syncVisibleRange(isIntraday);
}

function syncChartGuides(isIntraday: boolean) {
  clearChartGuides();
  if (!candleSeries || isIntraday) return;

  const theme = chartThemeTokens();
  chartGuides = props.guides
    .filter((guide) => Number.isFinite(guide.price) && guide.price > 0)
    .map((guide) => candleSeries!.createPriceLine({
      price: guide.price,
      color: guide.color,
      lineWidth: 1,
      lineStyle: guide.lineStyle === 'solid'
        ? LineStyle.Solid
        : guide.lineStyle === 'dotted' ? LineStyle.Dotted : LineStyle.Dashed,
      lineVisible: true,
      axisLabelVisible: guide.axisLabelVisible ?? true,
      title: guide.title,
      axisLabelColor: theme.elevated,
      axisLabelTextColor: theme.text
    }));
}

function syncIndicatorData(indicator: ChartIndicator | 'none') {
  if (!macdHistogramSeries || !macdDifSeries || !macdDeaSeries || !rsi6Series || !rsi12Series || !kdjKSeries || !kdjDSeries || !kdjJSeries) return;
  macdHistogramSeries.setData([]);
  macdDifSeries.setData([]);
  macdDeaSeries.setData([]);
  rsi6Series.setData([]);
  rsi12Series.setData([]);
  kdjKSeries.setData([]);
  kdjDSeries.setData([]);
  kdjJSeries.setData([]);

  if (indicator === 'macd') {
    const values = macd(props.candles);
    const theme = chartThemeTokens();
    macdHistogramSeries.setData(props.candles.map((candle, index) => ({
      time: candle.time as UTCTimestamp,
      value: values.bars[index],
      color: values.bars[index] >= 0 ? theme.up : theme.down
    })));
    macdDifSeries.setData(indicatorLineData(values.dif));
    macdDeaSeries.setData(indicatorLineData(values.dea));
    return;
  }

  if (indicator === 'rsi') {
    rsi6Series.setData(indicatorLineData(rsi(props.candles, 6)));
    rsi12Series.setData(indicatorLineData(rsi(props.candles, 12)));
    return;
  }

  if (indicator === 'kdj') {
    const values = kdj(props.candles);
    kdjKSeries.setData(indicatorLineData(values.k));
    kdjDSeries.setData(indicatorLineData(values.d));
    kdjJSeries.setData(indicatorLineData(values.j));
  }
}

function indicatorLineData(values: Array<number | null>) {
  return values.flatMap((value, index): LineData[] => value === null || !Number.isFinite(value) ? [] : [{
    time: props.candles[index].time as UTCTimestamp,
    value
  }]);
}

function clearChartGuides() {
  if (candleSeries) {
    chartGuides.forEach((guide) => candleSeries!.removePriceLine(guide));
  }
  chartGuides = [];
}

function queueSyncChart() {
  if (resizeFrame) {
    window.cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0;
    resizeChart();
    syncChart();
  });
}

function resizeChart() {
  if (!chart) {
    return;
  }

  const size = measureChart();
  chart.resize(size.width, size.height);
}

function measureChart() {
  const rect = chartEl.value?.getBoundingClientRect();
  const width = Math.floor(rect?.width || chartEl.value?.clientWidth || 320);
  const height = Math.floor(rect?.height || chartEl.value?.clientHeight || 320);

  return {
    width: Math.max(1, width),
    height: Math.max(1, height)
  };
}

function handleCrosshairMove(param: MouseEventParams<Time>) {
  if (props.mode === 'intraday') return;
  hoveredIndex.value = candleIndexForTime(param.time);
}

function handleChartClick(param: MouseEventParams<Time>) {
  if (props.mode === 'intraday') return;
  const index = candleIndexForTime(param.time);
  pinnedIndex.value = index;
  containerEl.value?.focus({ preventScroll: true });
}

function handleChartKeydown(event: KeyboardEvent) {
  if (props.mode === 'intraday' || pinnedIndex.value === null) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    clearPinnedCandle();
    return;
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const offset = event.key === 'ArrowLeft' ? -1 : 1;
  pinnedIndex.value = Math.min(props.candles.length - 1, Math.max(0, pinnedIndex.value + offset));
  const candle = props.candles[pinnedIndex.value];
  if (chart && candleSeries && candle) chart.setCrosshairPosition(candle.close, candle.time as UTCTimestamp, candleSeries);
}

function clearPinnedCandle() {
  pinnedIndex.value = null;
  hoveredIndex.value = null;
  chart?.clearCrosshairPosition();
}

function candleIndexForTime(time: Time | undefined) {
  if (time === undefined) return null;
  if (typeof time === 'number') {
    const index = props.candles.findIndex((candle) => candle.time === Number(time));
    return index >= 0 ? index : null;
  }
  const key = typeof time === 'string'
    ? time.slice(0, 10)
    : `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
  const index = props.candles.findIndex((candle) => candleDateKey(candle.time) === key);
  return index >= 0 ? index : null;
}

function buildCandleDetail(index: number) {
  const candle = props.candles[index];
  if (!candle) return null;
  const previousClose = props.candles[index - 1]?.close;
  const change = candle.change ?? (previousClose !== undefined ? candle.close - previousClose : null);
  const changePct = candle.changePct ?? (previousClose && previousClose > 0 && change !== null ? (change / previousClose) * 100 : null);
  const amplitude = candle.amplitude ?? (previousClose && previousClose > 0 ? ((candle.high - candle.low) / previousClose) * 100 : null);
  const recentVolumes = props.candles.slice(Math.max(0, index - 5), index).map((item) => item.volume);
  const averageVolume = recentVolumes.length ? recentVolumes.reduce((sum, value) => sum + value, 0) / recentVolumes.length : 0;
  const range = candle.high - candle.low;
  const bodyHigh = Math.max(candle.open, candle.close);
  const bodyLow = Math.min(candle.open, candle.close);
  const date = new Date(candle.time * 1000);
  return {
    date: candleDateKey(candle.time).replace(/-/g, '/'),
    weekday: new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date),
    open: formatCandlePrice(candle.open),
    high: formatCandlePrice(candle.high),
    low: formatCandlePrice(candle.low),
    close: formatCandlePrice(candle.close),
    change: change === null ? '--' : `${change >= 0 ? '+' : ''}${formatCandlePrice(change)}`,
    changePct: formatOptionalPct(changePct),
    changeClass: changeClass(changePct),
    amplitude: formatOptionalPct(amplitude, false),
    volume: formatIndicatorVolume(candle.volume),
    amount: formatOptionalAmount(candle.amount),
    turnoverRate: formatOptionalPct(candle.turnoverRate, false),
    relativeVolume: averageVolume > 0 ? `${(candle.volume / averageVolume).toFixed(2)}x` : '--',
    bodyPct: range > 0 ? `${(Math.abs(candle.close - candle.open) / range * 100).toFixed(1)}%` : '--',
    upperShadowPct: range > 0 ? `${((candle.high - bodyHigh) / range * 100).toFixed(1)}%` : '--',
    lowerShadowPct: range > 0 ? `${((bodyLow - candle.low) / range * 100).toFixed(1)}%` : '--',
    ma5: formatIndicatorValue(detailSeries.value.ma5[index], 2),
    ma10: formatIndicatorValue(detailSeries.value.ma10[index], 2),
    ma20: formatIndicatorValue(detailSeries.value.ma20[index], 2),
    indicators: indicatorDetailsAt(index)
  };
}

function indicatorDetailsAt(index: number) {
  if (selectedIndicator.value === 'volume') return [{ label: 'VOL', value: formatIndicatorVolume(props.candles[index]?.volume ?? 0), color: 'var(--text-muted)' }];
  if (selectedIndicator.value === 'macd') return [
    { label: 'DIF', value: formatIndicatorValue(detailSeries.value.macd.dif[index]), color: 'var(--accent-bright)' },
    { label: 'DEA', value: formatIndicatorValue(detailSeries.value.macd.dea[index]), color: '#41c6c3' },
    { label: 'BAR', value: formatIndicatorValue(detailSeries.value.macd.bars[index]), color: (detailSeries.value.macd.bars[index] ?? 0) >= 0 ? 'var(--market-up)' : 'var(--market-down)' }
  ];
  if (selectedIndicator.value === 'rsi') return [
    { label: 'RSI6', value: formatIndicatorValue(detailSeries.value.rsi6[index], 1), color: 'var(--accent-bright)' },
    { label: 'RSI12', value: formatIndicatorValue(detailSeries.value.rsi12[index], 1), color: '#a795d0' }
  ];
  return [
    { label: 'K', value: formatIndicatorValue(detailSeries.value.kdj.k[index], 1), color: 'var(--accent-bright)' },
    { label: 'D', value: formatIndicatorValue(detailSeries.value.kdj.d[index], 1), color: '#41c6c3' },
    { label: 'J', value: formatIndicatorValue(detailSeries.value.kdj.j[index], 1), color: 'var(--market-up)' }
  ];
}

function formatChartTime(time: Time) {
  if (props.mode === 'intraday') {
    return formatIntradayChartTime(time);
  }

  if (typeof time === 'string') {
    return time.slice(0, 10).replace(/-/g, '/');
  }

  if (typeof time === 'object') {
    return `${time.year}/${String(time.month).padStart(2, '0')}/${String(time.day).padStart(2, '0')}`;
  }

  const date = new Date(time * 1000);
  return dayFormatter.format(date);
}

function toMaData(period: number): LineData[] {
  const ma = simpleMovingAverage(props.candles, period);
  const data: LineData[] = [];

  props.candles.forEach((candle, index) => {
    const value = ma[index];
    if (value !== null) {
      data.push({ time: candle.time as UTCTimestamp, value });
    }
  });

  return data;
}

function toVolumeData(): HistogramData[] {
  return props.candles.map((candle, index) => ({
    time: candle.time as UTCTimestamp,
    value: candle.volume,
    color: volumeColor(candle, props.candles[index - 1])
  }));
}

function toIntradayPriceData(): LineData[] {
  return props.candles
    .reduce<LineData[]>((data, candle) => {
      const time = toIntradayRenderTime(candle.time);
      if (time !== null) {
        data.push({ time, value: candle.close });
      }
      return data;
    }, [])
    .sort((a, b) => Number(a.time) - Number(b.time));
}

function toIntradayAverageData(): LineData[] {
  return props.candles
    .reduce<LineData[]>((data, candle) => {
      const time = toIntradayRenderTime(candle.time);
      if (time !== null && candle.average !== undefined && Number.isFinite(candle.average)) {
        data.push({ time, value: candle.average });
      }
      return data;
    }, [])
    .sort((a, b) => Number(a.time) - Number(b.time));
}

function toIntradayVolumeData(): HistogramPoint[] {
  const candleByTime = intradayCandleMap();
  let previous: Candle | undefined;

  return ashareIntradayTimeline().map((time) => {
    const candle = candleByTime.get(time);
    if (!candle) {
      return { time };
    }

    const point = {
      time,
      value: candle.volume,
      color: volumeColor(candle, previous)
    };
    previous = candle;
    return point;
  });
}

function intradayCandleMap() {
  return props.candles.reduce<Map<UTCTimestamp, Candle>>((map, candle) => {
    const renderTime = toIntradayRenderTime(candle.time);
    if (renderTime !== null) {
      map.set(renderTime, candle);
    }
    return map;
  }, new Map());
}

function ashareIntradayTimeline() {
  const first = props.candles[0];
  if (!first) {
    return [];
  }

  const date = new Date(first.time * 1000);
  const times: UTCTimestamp[] = [];
  for (let minute = MORNING_START_MINUTE; minute <= MORNING_END_MINUTE; minute += 1) {
    times.push(minuteTimestamp(date, minute));
  }
  for (let minute = AFTERNOON_START_MINUTE; minute <= AFTERNOON_END_MINUTE; minute += 1) {
    times.push((minuteTimestamp(date, minute) - COMPRESSED_NOON_GAP_MINUTES * 60 + AFTERNOON_RENDER_OFFSET_SECONDS) as UTCTimestamp);
  }

  return times;
}

function syncVisibleRange(isIntraday: boolean) {
  if (!chart) {
    return;
  }

  if (!isIntraday) {
    chart.timeScale().fitContent();
    return;
  }

  const range = ashareIntradayRange();
  if (range) {
    chart.timeScale().setVisibleRange(range);
  }
}

function syncZeroPriceLine(isIntraday: boolean) {
  if (!intradayPriceSeries) {
    return;
  }

  const referencePrice = normalizedReferencePrice();
  if (!isIntraday || referencePrice === null) {
    if (zeroPriceLine) {
      intradayPriceSeries.removePriceLine(zeroPriceLine);
      zeroPriceLine = null;
    }
    return;
  }

  const theme = chartThemeTokens();
  const options = {
    price: referencePrice,
    color: theme.accent,
    lineWidth: 1 as const,
    lineStyle: LineStyle.Dashed,
    lineVisible: true,
    axisLabelVisible: true,
    title: '0.00%',
    axisLabelColor: theme.elevated,
    axisLabelTextColor: theme.accentBright
  };

  if (!zeroPriceLine) {
    zeroPriceLine = intradayPriceSeries.createPriceLine(options);
    return;
  }

  zeroPriceLine.applyOptions(options);
}

function handleThemeChange() {
  window.requestAnimationFrame(() => {
    if (!chart) return;
    const theme = chartThemeTokens();
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: theme.muted },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      crosshair: { vertLine: { color: theme.accent }, horzLine: { color: theme.accent } },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border }
    });
    candleSeries?.applyOptions({ upColor: theme.up, downColor: theme.down, borderUpColor: theme.up, borderDownColor: theme.down, wickUpColor: theme.up, wickDownColor: theme.down, priceLineColor: theme.accent });
    intradayPriceSeries?.applyOptions({ color: theme.accentBright, priceLineColor: theme.accent });
    macdDifSeries?.applyOptions({ color: theme.accentBright });
    rsi6Series?.applyOptions({ color: theme.accentBright });
    kdjKSeries?.applyOptions({ color: theme.accentBright });
    kdjJSeries?.applyOptions({ color: theme.up });
    syncChart();
  });
}

function intradayAutoscaleInfo() {
  const range = intradayPriceRange();
  if (!range) {
    return null;
  }

  return {
    priceRange: {
      minValue: range.lower,
      maxValue: range.upper
    },
    margins: {
      above: 0,
      below: 0
    }
  };
}

function intradayPriceRange() {
  const referencePrice = normalizedReferencePrice();
  if (referencePrice === null) {
    return null;
  }

  const limitPct = normalizedLimitPct();
  const upper = roundPrice(referencePrice * (1 + limitPct / 100));
  const lower = roundPrice(referencePrice * (1 - limitPct / 100));

  return { upper, lower };
}

function normalizedReferencePrice() {
  const value = Number(props.referencePrice);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizedLimitPct() {
  const value = Number(props.priceLimitPct);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

function ashareIntradayRange() {
  const first = props.candles[0];
  if (!first) {
    return null;
  }

  const date = new Date(first.time * 1000);
  const from = minuteTimestamp(date, MORNING_START_MINUTE);
  const to = (minuteTimestamp(date, AFTERNOON_END_MINUTE - COMPRESSED_NOON_GAP_MINUTES) + AFTERNOON_RENDER_OFFSET_SECONDS) as UTCTimestamp;

  return {
    from,
    to
  };
}

function normalizeMinute(time: number) {
  return (Math.floor(time / 60) * 60) as UTCTimestamp;
}

function toIntradayRenderTime(time: number) {
  const date = new Date(time * 1000);
  const minute = date.getHours() * 60 + date.getMinutes();
  const normalizedMinute = normalizeMinute(time);

  if (minute >= MORNING_START_MINUTE && minute <= MORNING_END_MINUTE) {
    return normalizedMinute;
  }

  if (minute >= AFTERNOON_START_MINUTE && minute <= AFTERNOON_END_MINUTE) {
    return (normalizedMinute - COMPRESSED_NOON_GAP_MINUTES * 60 + AFTERNOON_RENDER_OFFSET_SECONDS) as UTCTimestamp;
  }

  return null;
}

function fromIntradayRenderTime(time: number) {
  const date = new Date(time * 1000);
  const minute = date.getHours() * 60 + date.getMinutes();
  const actualMinute = minute > MORNING_END_MINUTE ? minute + COMPRESSED_NOON_GAP_MINUTES : minute;
  return minuteTimestamp(date, actualMinute);
}

function minuteTimestamp(date: Date, minute: number) {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minute / 60), minute % 60, 0, 0).getTime() / 1000) as UTCTimestamp;
}

function formatIntradayChartTime(time: Time) {
  if (typeof time === 'string') {
    return time.slice(11, 16) || time;
  }

  if (typeof time === 'object') {
    return `${String(time.month).padStart(2, '0')}/${String(time.day).padStart(2, '0')}`;
  }

  return intradayTimeFormatter.format(new Date(fromIntradayRenderTime(time) * 1000));
}

function roundPrice(value: number) {
  return Math.round(value * 100) / 100;
}

function volumeColor(candle: Candle, previous: Candle | undefined) {
  const baseline = previous?.close ?? candle.open;
  const theme = chartThemeTokens();
  return candle.close >= baseline ? theme.up : theme.down;
}

function formatIndicatorValue(value: number | null | undefined, digits = 3) {
  return value === null || value === undefined || !Number.isFinite(value) ? '--' : value.toFixed(digits);
}

function formatIndicatorVolume(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (absolute >= 10_000) return `${(value / 10_000).toFixed(0)}万`;
  return `${Math.round(value)}`;
}

function formatOptionalAmount(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return '--';
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (absolute >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return `${Math.round(value)}`;
}

function formatOptionalPct(value: number | null | undefined, signed = true) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return `${signed && value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatCandlePrice(value: number) {
  const absolute = Math.abs(value);
  return value.toFixed(absolute > 0 && absolute < 10 ? 3 : 2);
}

function changeClass(value: number | null | undefined) {
  if ((value ?? 0) > 0) return 'up';
  if ((value ?? 0) < 0) return 'down';
  return '';
}

function candleDateKey(timestamp: number) {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function loadChartIndicator(fallback: ChartIndicator): ChartIndicator {
  const stored = localStorage.getItem(CHART_INDICATOR_STORAGE_KEY);
  return stored === 'volume' || stored === 'macd' || stored === 'rsi' || stored === 'kdj' ? stored : fallback;
}
</script>

<style scoped>
.kline-chart { position: relative; min-width: 0; min-height: 0; outline: 0; container-type: inline-size; }
.kline-chart-canvas { width: 100%; height: 100%; overflow: hidden; }
.candle-hover-strip { max-width: calc(100% - 74px); height: 26px; position: absolute; z-index: 7; top: 6px; left: 7px; display: flex; align-items: center; gap: 9px; overflow: hidden; padding: 0 8px; border: 1px solid rgba(var(--border-rgb), .07); border-radius: 4px; background: var(--bg-floating); color: var(--text-muted); white-space: nowrap; pointer-events: none; }
.candle-hover-strip.pinned { border-color: rgba(var(--accent-rgb), .34); }
.candle-hover-strip > strong { color: var(--accent-bright); font-size: 9px; font-variant-numeric: tabular-nums; }
.candle-hover-strip span, .candle-hover-strip em { font-size: 8px; font-style: normal; }
.candle-hover-strip b { margin-left: 2px; color: var(--text-strong); font-weight: 700; font-variant-numeric: tabular-nums; }
.candle-hover-strip em { margin-left: auto; color: var(--text-faint); }
.candle-detail-panel { width: 276px; max-height: calc(100% - 48px); position: absolute; z-index: 8; top: 38px; right: 64px; overflow-y: auto; border: 1px solid rgba(var(--accent-rgb), .28); border-radius: 5px; background: var(--bg-floating); box-shadow: 0 10px 28px rgba(0,0,0,.34); }
.candle-detail-panel header { height: 33px; display: flex; align-items: center; justify-content: space-between; padding: 0 7px 0 9px; border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.candle-detail-panel header > div { display: flex; align-items: center; gap: 6px; color: var(--accent); }
.candle-detail-panel header strong { color: var(--text-primary); font-size: 10px; }.candle-detail-panel header span { color: var(--text-subtle); font-size: 8px; }
.candle-detail-panel header button { width: 22px; height: 22px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 3px; background: transparent; color: var(--text-subtle); cursor: pointer; }.candle-detail-panel header button:hover { background: var(--bg-muted); color: var(--text-primary); }
.candle-detail-price { height: 45px; display: flex; align-items: baseline; gap: 8px; padding: 9px 10px 0; border-bottom: 1px solid rgba(var(--border-rgb), .06); }.candle-detail-price > strong { font-size: 18px; }.candle-detail-price span { font-size: 9px; }
.candle-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-bottom: 1px solid rgba(var(--border-rgb), .06); }
.candle-detail-grid > div { min-width: 0; height: 31px; display: flex; align-items: center; justify-content: space-between; gap: 5px; padding: 0 9px; border-right: 1px solid rgba(var(--border-rgb), .045); border-bottom: 1px solid rgba(var(--border-rgb), .045); }.candle-detail-grid > div:nth-child(2n) { border-right: 0; }
.candle-detail-grid span { color: var(--text-faint); font-size: 8px; }.candle-detail-grid strong { overflow: hidden; color: var(--text-strong); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.candle-structure { height: 35px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid rgba(var(--border-rgb), .06); }.candle-structure > div { display: flex; align-items: center; justify-content: center; gap: 4px; border-right: 1px solid rgba(var(--border-rgb), .045); }.candle-structure > div:last-child { border-right: 0; }.candle-structure span { color: var(--text-faint); font-size: 8px; }.candle-structure strong { color: var(--text-secondary); font-size: 8px; }
.candle-ma-list { min-height: 31px; display: flex; align-items: center; justify-content: space-between; gap: 5px; padding: 0 9px; border-bottom: 1px solid rgba(var(--border-rgb), .06); }.candle-ma-list span { display: inline-flex; align-items: center; gap: 3px; color: var(--text-subtle); font-size: 7px; }.candle-ma-list i { width: 5px; height: 5px; border-radius: 50%; }.candle-ma-list strong { color: var(--text-secondary); font-size: 8px; }.ma5-dot { background: #f4c84a; }.ma10-dot { background: #41c6c3; }.ma20-dot { background: #a795d0; }
.candle-indicator-detail { min-height: 31px; display: flex; align-items: center; gap: 9px; overflow: hidden; padding: 0 9px; border-bottom: 1px solid rgba(var(--border-rgb), .06); white-space: nowrap; }.candle-indicator-detail span { font-size: 8px; }.candle-indicator-detail strong { font-variant-numeric: tabular-nums; }
.candle-detail-panel footer { height: 27px; display: flex; align-items: center; justify-content: space-between; padding: 0 9px; color: var(--text-faint); font-size: 7px; }
.chart-indicator-tools { max-width: calc(100% - 70px); position: absolute; z-index: 5; top: calc(78% + 5px); left: 7px; display: flex; align-items: center; gap: 8px; }
.chart-indicator-switch { flex: 0 0 auto; height: 21px; display: inline-flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid rgba(var(--border-rgb), .07); border-radius: 4px; background: var(--bg-floating); }
.chart-indicator-switch button { height: 15px; padding: 0 5px; border: 0; border-radius: 3px; background: transparent; color: var(--text-subtle); font-size: 8px; font-weight: 700; cursor: pointer; }
.chart-indicator-switch button:hover { color: var(--text-strong); }
.chart-indicator-switch button.active { background: var(--bg-muted); color: var(--accent-bright); }
.chart-indicator-legend { min-width: 0; display: flex; align-items: center; gap: 8px; overflow: hidden; padding: 3px 5px; border-radius: 3px; background: var(--bg-floating); white-space: nowrap; }
.chart-indicator-legend span { font-size: 8px; font-variant-numeric: tabular-nums; }
.intraday-time-axis { position: absolute; z-index: 4; right: 58px; bottom: 2px; left: 0; height: 18px; pointer-events: none; }
.intraday-time-axis span { position: absolute; bottom: 0; color: var(--text-muted); font-size: 8px; line-height: 16px; font-variant-numeric: tabular-nums; white-space: nowrap; transform: translateX(-50%); }
.intraday-time-axis span:first-child { transform: none; }
.intraday-time-axis span:last-child { transform: translateX(-100%); }
.intraday-time-axis span:nth-child(9) { padding: 0 2px; background: var(--bg-floating); color: var(--text-secondary); font-size: 7px; }
@container (max-width: 560px) {
  .candle-hover-strip span:nth-of-type(n+5), .candle-hover-strip em { display: none; }
  .candle-detail-panel { width: min(252px, calc(100% - 22px)); right: 11px; }
}
</style>
