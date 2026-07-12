import type { Candle, IndicatorSummary, Quote, Signal } from '@/types/market';

const last = <T>(items: T[]): T | null => (items.length ? items[items.length - 1] : null);

export function simpleMovingAverage(candles: Candle[], period: number): Array<number | null> {
  const values: Array<number | null> = [];
  let sum = 0;

  candles.forEach((candle, index) => {
    sum += candle.close;
    if (index >= period) {
      sum -= candles[index - period].close;
    }

    values.push(index >= period - 1 ? sum / period : null);
  });

  return values;
}

export function exponentialMovingAverage(values: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);

  values.forEach((value, index) => {
    if (index === 0) {
      result.push(value);
      return;
    }

    result.push(value * k + result[index - 1] * (1 - k));
  });

  return result;
}

export function macd(candles: Candle[]) {
  const closes = candles.map((candle) => candle.close);
  const ema12 = exponentialMovingAverage(closes, 12);
  const ema26 = exponentialMovingAverage(closes, 26);
  const dif = closes.map((_, index) => ema12[index] - ema26[index]);
  const dea = exponentialMovingAverage(dif, 9);
  const bars = dif.map((value, index) => (value - dea[index]) * 2);

  return { dif, dea, bars };
}

export function rsi(candles: Candle[], period: number): Array<number | null> {
  const values: Array<number | null> = [null];
  let gains = 0;
  let losses = 0;

  for (let index = 1; index < candles.length; index += 1) {
    const delta = candles[index].close - candles[index - 1].close;
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);

    if (index <= period) {
      gains += gain;
      losses += loss;
      values.push(index === period ? toRsi(gains / period, losses / period) : null);
      continue;
    }

    gains = (gains * (period - 1) + gain) / period;
    losses = (losses * (period - 1) + loss) / period;
    values.push(toRsi(gains, losses));
  }

  return values;
}

export function kdj(candles: Candle[], period = 9) {
  const k: Array<number | null> = [];
  const d: Array<number | null> = [];
  const j: Array<number | null> = [];
  let previousK = 50;
  let previousD = 50;

  candles.forEach((candle, index) => {
    if (index < period - 1) {
      k.push(null);
      d.push(null);
      j.push(null);
      return;
    }

    const range = candles.slice(index - period + 1, index + 1);
    const low = Math.min(...range.map((item) => item.low));
    const high = Math.max(...range.map((item) => item.high));
    const rsv = high > low ? ((candle.close - low) / (high - low)) * 100 : 50;
    const currentK = (2 / 3) * previousK + (1 / 3) * rsv;
    const currentD = (2 / 3) * previousD + (1 / 3) * currentK;
    const currentJ = 3 * currentK - 2 * currentD;
    k.push(currentK);
    d.push(currentD);
    j.push(currentJ);
    previousK = currentK;
    previousD = currentD;
  });

  return { k, d, j };
}

export function summarizeIndicators(candles: Candle[]): IndicatorSummary {
  const ma5 = last(simpleMovingAverage(candles, 5));
  const ma10 = last(simpleMovingAverage(candles, 10));
  const ma20 = last(simpleMovingAverage(candles, 20));
  const rsi6 = last(rsi(candles, 6));
  const macdSeries = macd(candles);
  const dif = last(macdSeries.dif);
  const dea = last(macdSeries.dea);
  const macdBar = last(macdSeries.bars);
  const recent = candles.slice(-20);
  const currentVolume = last(candles)?.volume ?? 0;
  const avgVolume = recent.reduce((sum, candle) => sum + candle.volume, 0) / Math.max(recent.length, 1);
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : null;
  const trendLabel = getTrendLabel(ma5, ma10, ma20, dif, dea);

  return {
    ma5,
    ma10,
    ma20,
    rsi6,
    dif,
    dea,
    macd: macdBar,
    volumeRatio,
    trendLabel
  };
}

export function buildSignals(quote: Quote, candles: Candle[], indicators: IndicatorSummary): Signal[] {
  const close = quote.price;
  const lastCandle = last(candles);
  const previousCandle = candles.length > 1 ? candles[candles.length - 2] : null;
  const volumeRatio = indicators.volumeRatio ?? 0;
  const maBull = Boolean(indicators.ma5 && indicators.ma10 && indicators.ma20 && indicators.ma5 > indicators.ma10 && indicators.ma10 > indicators.ma20 && close > indicators.ma5);
  const macdCross = Boolean(indicators.dif && indicators.dea && indicators.macd && indicators.dif > indicators.dea && indicators.macd > 0);
  const pricePulse = Math.abs(quote.speed) > 0.42 || Math.abs(quote.changePct) > 2.4;
  const breakout = Boolean(previousCandle && lastCandle && close > previousCandle.high && volumeRatio > 1.15);

  return [
    {
      id: 'volume-break',
      label: '放量突破',
      detail: `${formatPercent(quote.changePct)} / 量比 ${volumeRatio.toFixed(2)}`,
      tone: breakout ? 'hot' : 'calm',
      active: breakout,
      weight: breakout ? 92 : 20
    },
    {
      id: 'ma-bull',
      label: '均线多头',
      detail: indicators.ma5 && indicators.ma10 ? `MA5 ${indicators.ma5.toFixed(2)} > MA10 ${indicators.ma10.toFixed(2)}` : '等待数据',
      tone: maBull ? 'watch' : 'calm',
      active: maBull,
      weight: maBull ? 72 : 18
    },
    {
      id: 'macd-cross',
      label: 'MACD强势',
      detail: indicators.dif && indicators.dea ? `DIF ${indicators.dif.toFixed(3)} / DEA ${indicators.dea.toFixed(3)}` : '等待数据',
      tone: macdCross ? 'watch' : 'calm',
      active: macdCross,
      weight: macdCross ? 68 : 16
    },
    {
      id: 'speed',
      label: quote.speed >= 0 ? '盘口急拉' : '盘口急杀',
      detail: `瞬时 ${formatPercent(quote.speed)}`,
      tone: pricePulse ? 'hot' : 'calm',
      active: pricePulse,
      weight: pricePulse ? 84 : 12
    }
  ];
}

function toRsi(avgGain: number, avgLoss: number) {
  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function getTrendLabel(ma5: number | null, ma10: number | null, ma20: number | null, dif: number | null, dea: number | null) {
  if (ma5 && ma10 && ma20 && ma5 > ma10 && ma10 > ma20 && dif && dea && dif > dea) {
    return '进攻';
  }

  if (ma5 && ma10 && ma5 > ma10) {
    return '修复';
  }

  if (ma5 && ma20 && ma5 < ma20) {
    return '防守';
  }

  return '震荡';
}

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
