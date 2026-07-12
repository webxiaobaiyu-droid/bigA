import { fetchHotStockRows } from '@/services/sectorProvider';
import type { Candle, ChartGuide, ChartMarker } from '@/types/market';
import type { KnowledgeCaseAnalysis, KnowledgeCaseCandidate, KnowledgeObservation } from '@/types/knowledge';
import type { HotStockRow, HotStockSortKey } from '@/types/sector';

const CASE_RULE_LABELS: Record<string, string> = {
  'volume-price-rise': '价涨 + 相对放量',
  'volume-breakout': '突破 20 日高点 + 放量',
  'low-volume-pullback': '缩量回落 + 结构未破',
  'volume-price-divergence': '价格走强 + 量能未确认',
  'high-volume': '阶段异常巨量',
  'price-rise-volume-fall': '价格上涨 + 成交缩减',
  'price-fall-volume-rise': '价格下跌 + 成交放大',
  'volume-cluster': '连续量能台阶',
  'turnover-rate': '高换手活跃样本',
  'volume-ratio': '量比异动样本',
  amplitude: '高振幅样本',
  'limit-up': '接近价格涨停限制',
  'large-order-flow': '大单方向模型样本',
  'price-speed': '盘中涨速异动',
  'support-resistance': '近 20 日支撑压力区',
  trend: '高低点与均线趋势结构'
};

export function supportsKnowledgeCase(termId: string) {
  return termId in CASE_RULE_LABELS;
}

export function knowledgeCaseRuleLabel(termId: string) {
  return CASE_RULE_LABELS[termId] ?? '行情结构样本';
}

export async function fetchKnowledgeCaseCandidates(termId: string): Promise<KnowledgeCaseCandidate[]> {
  if (!supportsKnowledgeCase(termId)) return [];
  const rows = await fetchHotStockRows(candidateSortKey(termId));
  return rows
    .map((row) => scoreCandidate(termId, row))
    .filter((row) => row.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore || b.amount - a.amount)
    .slice(0, 12);
}

export function analyzeKnowledgeCase(termId: string, sourceCandles: Candle[], quote: HotStockRow): KnowledgeCaseAnalysis {
  const candles = sourceCandles.slice(-100);
  const fallbackIndex = Math.max(0, candles.length - 1);
  const signalIndex = findSignalIndex(termId, candles, quote) ?? fallbackIndex;
  const signal = candles[signalIndex];
  const previous = candles[Math.max(0, signalIndex - 1)] ?? signal;
  const volumeAverage5 = average(candles.slice(Math.max(0, signalIndex - 5), signalIndex).map((item) => item.volume));
  const volumeRatio = volumeAverage5 > 0 ? signal.volume / volumeAverage5 : quote.volumeRatio;
  const changePct = previous.close > 0 ? ((signal.close - previous.close) / previous.close) * 100 : quote.changePct;
  const amplitude = signal.open > 0 ? ((signal.high - signal.low) / previous.close) * 100 : quote.amplitude;
  const prior20 = candles.slice(Math.max(0, signalIndex - 20), signalIndex);
  const priorHigh = prior20.length ? Math.max(...prior20.map((item) => item.high)) : signal.high;
  const priorLow = prior20.length ? Math.min(...prior20.map((item) => item.low)) : signal.low;
  const rule = evaluateRule(termId, { signal, previous, volumeRatio, changePct, amplitude, priorHigh, priorLow, quote, candles, signalIndex });
  const markers: ChartMarker[] = [{
    time: signal.time,
    position: rule.markerPosition,
    color: rule.matched ? '#d94f4f' : '#d7a642',
    shape: rule.markerPosition === 'belowBar' ? 'arrowUp' : 'arrowDown',
    text: rule.markerText,
    size: 1
  }];
  const guides = buildGuides(termId, signal, priorHigh, priorLow, candles, signalIndex);

  return {
    matched: rule.matched,
    confidence: rule.confidence,
    signalDate: formatDate(signal.time),
    ruleLabel: knowledgeCaseRuleLabel(termId),
    ruleDescription: rule.description,
    candles,
    markers,
    guides,
    observations: buildObservations(changePct, volumeRatio, amplitude, quote),
    explanations: rule.explanations,
    caveat: '标签由当前行情与历史 K 线规则识别，只用于演示概念。它不识别账户身份，也不预测后续涨跌。'
  };
}

interface RuleContext {
  signal: Candle;
  previous: Candle;
  volumeRatio: number;
  changePct: number;
  amplitude: number;
  priorHigh: number;
  priorLow: number;
  quote: HotStockRow;
  candles: Candle[];
  signalIndex: number;
}

interface RuleResult {
  matched: boolean;
  confidence: number;
  markerPosition: 'aboveBar' | 'belowBar';
  markerText: string;
  description: string;
  explanations: string[];
}

function evaluateRule(termId: string, context: RuleContext): RuleResult {
  const { signal, previous, volumeRatio, changePct, amplitude, priorHigh, priorLow, quote, candles, signalIndex } = context;
  const bullish = signal.close > previous.close;
  const base = {
    markerPosition: (bullish ? 'belowBar' : 'aboveBar') as 'aboveBar' | 'belowBar',
    confidence: 65,
    matched: true
  };

  if (termId === 'volume-price-rise') {
    const matched = changePct > 0.8 && volumeRatio >= 1.25;
    return { ...base, matched, confidence: scoreConfidence([changePct > 0.8, volumeRatio >= 1.25, signal.close >= signal.open]), markerText: `量增 ${volumeRatio.toFixed(1)}x`, description: '收盘上涨且成交量高于前 5 日均量，价格与参与度同步增强。', explanations: [`当日涨幅 ${signedPct(changePct)}，价格方向为${changePct > 0 ? '上行' : '下行'}。`, `成交量约为前 5 日均量的 ${volumeRatio.toFixed(2)} 倍。`, signal.close >= signal.open ? '收盘不低于开盘，日内承接相对完整。' : '收盘低于开盘，说明上涨过程中仍有明显抛压。'] };
  }
  if (termId === 'volume-breakout') {
    const distance = priorHigh > 0 ? ((signal.close - priorHigh) / priorHigh) * 100 : 0;
    const matched = signal.close > priorHigh && volumeRatio >= 1.2;
    return { ...base, matched, confidence: scoreConfidence([signal.close > priorHigh, volumeRatio >= 1.2, signal.close >= signal.open]), markerText: matched ? '突破前高' : '测试前高', description: '用前 20 个交易日最高价作为压力参考，检查收盘是否放量越过。', explanations: [`前 20 日压力参考为 ${priorHigh.toFixed(2)}，收盘相对该位置 ${signedPct(distance)}。`, `成交量约为前 5 日均量的 ${volumeRatio.toFixed(2)} 倍。`, matched ? '价格和量能同时满足规则，但仍需观察后续是否跌回突破区。' : '尚未同时满足站上前高与放量条件，只能作为接近样本。'] };
  }
  if (termId === 'low-volume-pullback') {
    const ma20 = average(candles.slice(Math.max(0, signalIndex - 19), signalIndex + 1).map((item) => item.close));
    const matched = changePct < 0 && volumeRatio < 0.85 && signal.close >= ma20;
    return { ...base, markerPosition: 'aboveBar', matched, confidence: scoreConfidence([changePct < 0, volumeRatio < 0.85, signal.close >= ma20]), markerText: `缩量 ${volumeRatio.toFixed(1)}x`, description: '价格回落、成交量收缩，同时收盘仍在 20 日均价附近或上方。', explanations: [`当日涨跌 ${signedPct(changePct)}，属于${changePct < 0 ? '回落' : '上涨'}。`, `量能为前 5 日均量的 ${volumeRatio.toFixed(2)} 倍。`, `20 日平均收盘约 ${ma20.toFixed(2)}，信号日收盘 ${signal.close.toFixed(2)}。`] };
  }
  if (termId === 'volume-price-divergence' || termId === 'price-rise-volume-fall') {
    const matched = changePct > 0 && volumeRatio < 0.9;
    return { ...base, matched, confidence: scoreConfidence([changePct > 0, volumeRatio < 0.9, signal.close > signal.open]), markerText: '价涨量缩', description: '价格上涨但成交量低于前 5 日均量，量能没有同步确认价格。', explanations: [`价格当日上涨 ${Math.max(0, changePct).toFixed(2)}%。`, `量能仅为前 5 日均量的 ${volumeRatio.toFixed(2)} 倍。`, '这是一项警示条件，不等于价格会立即反转。'] };
  }
  if (termId === 'price-fall-volume-rise') {
    const matched = changePct < 0 && volumeRatio > 1.25;
    return { ...base, markerPosition: 'aboveBar', matched, confidence: scoreConfidence([changePct < 0, volumeRatio > 1.25, signal.close < signal.open]), markerText: '放量下跌', description: '价格下跌且成交量高于短期均量，说明抛压和分歧同步增加。', explanations: [`价格当日变化 ${signedPct(changePct)}。`, `成交量为前 5 日均量的 ${volumeRatio.toFixed(2)} 倍。`, signal.close < priorLow ? '收盘跌破前 20 日低点，结构压力更明显。' : '尚未跌破前 20 日低点，需要结合后续反馈。'] };
  }
  if (termId === 'high-volume') {
    const volumes = candles.slice(Math.max(0, signalIndex - 60), signalIndex + 1).map((item) => item.volume).sort((a, b) => a - b);
    const percentile = volumes.length ? volumes.filter((value) => value <= signal.volume).length / volumes.length : 0;
    const matched = percentile >= 0.9;
    return { ...base, matched, confidence: Math.round(percentile * 100), markerText: `量能P${Math.round(percentile * 100)}`, description: '将信号日成交量放入近 60 日分布，观察是否处于极高分位。', explanations: [`该日成交量位于近 60 日约 ${(percentile * 100).toFixed(0)}% 分位。`, `相对前 5 日均量为 ${volumeRatio.toFixed(2)} 倍。`, '天量只代表筹码交换异常，方向要结合 K 线位置与后续走势。'] };
  }
  if (termId === 'volume-ratio') {
    const matched = volumeRatio >= 1.5;
    return { ...base, matched, confidence: clamp(Math.round(50 + volumeRatio * 18), 52, 95), markerText: `量比 ${volumeRatio.toFixed(1)}`, description: '用信号日成交量除以前 5 日平均成交量，演示相对量能放大。', explanations: [`历史 K 线计算的相对量能为 ${volumeRatio.toFixed(2)} 倍。`, `信号日价格变化 ${signedPct(changePct)}。`, '盘中软件量比常使用同期分钟量，和这里的日 K 教学口径不同。'] };
  }
  if (termId === 'amplitude') {
    const matched = amplitude >= 7;
    return { ...base, matched, confidence: clamp(Math.round(50 + amplitude * 3), 52, 94), markerText: `振幅 ${amplitude.toFixed(1)}%`, description: '以信号日最高价和最低价相对前收盘计算日振幅。', explanations: [`信号日振幅 ${amplitude.toFixed(2)}%。`, `当日价格变化 ${signedPct(changePct)}。`, '振幅只描述波动范围，不单独代表上涨或下跌趋势。'] };
  }
  if (termId === 'limit-up') {
    const threshold = stockLimitThreshold(quote.code, quote.name);
    const matched = changePct >= threshold - 0.5;
    return { ...base, matched, confidence: matched ? 90 : 58, markerText: matched ? '涨停附近' : '大幅上涨', description: `按该股票约 ${threshold}% 的日涨跌幅限制识别历史触板附近样本。`, explanations: [`信号日涨幅 ${signedPct(changePct)}。`, `依据代码与名称估算该股涨跌幅限制约为 ${threshold}%。`, '是否真正封板还需要分钟成交和收盘状态，日 K 只能确认价格幅度。'] };
  }
  if (termId === 'volume-cluster') {
    const recent5 = average(candles.slice(Math.max(0, signalIndex - 4), signalIndex + 1).map((item) => item.volume));
    const earlier20 = average(candles.slice(Math.max(0, signalIndex - 25), Math.max(0, signalIndex - 5)).map((item) => item.volume));
    const ratio = earlier20 > 0 ? recent5 / earlier20 : 0;
    const matched = ratio >= 1.35;
    return { ...base, matched, confidence: clamp(Math.round(55 + ratio * 15), 55, 94), markerText: `堆量 ${ratio.toFixed(1)}x`, description: '比较最近 5 日均量与此前 20 日均量，识别连续量能台阶。', explanations: [`最近 5 日均量约为此前 20 日的 ${ratio.toFixed(2)} 倍。`, `信号日价格变化 ${signedPct(changePct)}。`, ratio >= 1.35 ? '量能具有连续性，仍需确认价格重心是否同步抬升。' : '连续放量程度不足，更接近单日异动。'] };
  }
  if (termId === 'support-resistance') {
    return { ...base, matched: true, confidence: 70, markerText: '观察位置', description: '用前 20 日最高与最低价画出教学参考区，而非精确买卖点。', explanations: [`上方压力参考 ${priorHigh.toFixed(2)}。`, `下方支撑参考 ${priorLow.toFixed(2)}。`, `当前收盘位于区间 ${rangePosition(signal.close, priorLow, priorHigh).toFixed(0)}% 位置。`] };
  }
  if (termId === 'trend') {
    const ma20 = average(candles.slice(Math.max(0, signalIndex - 19), signalIndex + 1).map((item) => item.close));
    const ma5 = average(candles.slice(Math.max(0, signalIndex - 4), signalIndex + 1).map((item) => item.close));
    const matched = signal.close > ma20 && ma5 > ma20;
    return { ...base, matched, confidence: scoreConfidence([signal.close > ma20, ma5 > ma20, signal.close > previous.close]), markerText: matched ? '趋势向上' : '趋势观察', description: '用价格相对 20 日均价以及 5 日、20 日均价关系辅助观察趋势。', explanations: [`5 日平均收盘 ${ma5.toFixed(2)}，20 日平均收盘 ${ma20.toFixed(2)}。`, `当前收盘 ${signal.close.toFixed(2)}，位于 20 日均价${signal.close >= ma20 ? '上方' : '下方'}。`, '均线只描述历史价格，趋势仍需结合高低点结构。'] };
  }

  const matched = candidateMatches(termId, quote);
  const latestText: Record<string, string> = { 'turnover-rate': `换手 ${quote.turnoverRate.toFixed(1)}%`, 'volume-ratio': `量比 ${quote.volumeRatio.toFixed(2)}`, amplitude: `振幅 ${quote.amplitude.toFixed(1)}%`, 'limit-up': '涨停幅度', 'large-order-flow': '资金方向', 'price-speed': `涨速 ${signedPct(quote.speed)}` };
  return { ...base, matched, confidence: matched ? 78 : 55, markerText: latestText[termId] ?? '行情样本', description: '候选由当日实时指标初筛，K 线用于观察它所处的历史位置。', explanations: candidateReasons(termId, quote) };
}

function buildGuides(termId: string, signal: Candle, priorHigh: number, priorLow: number, candles: Candle[], signalIndex: number): ChartGuide[] {
  if (termId === 'volume-breakout' || termId === 'support-resistance') {
    return [
      { price: priorHigh, color: 'rgba(217,79,79,.72)', title: '前高压力', lineStyle: 'dashed' },
      { price: priorLow, color: 'rgba(34,160,107,.65)', title: '前低支撑', lineStyle: 'dotted' }
    ];
  }
  if (termId === 'low-volume-pullback' || termId === 'trend') {
    const ma20 = average(candles.slice(Math.max(0, signalIndex - 19), signalIndex + 1).map((item) => item.close));
    return ma20 > 0 ? [{ price: ma20, color: 'rgba(65,198,195,.72)', title: '20日均价', lineStyle: 'dashed' }] : [];
  }
  return [{ price: signal.close, color: 'rgba(215,166,66,.58)', title: '信号收盘', lineStyle: 'dotted', axisLabelVisible: false }];
}

function buildObservations(changePct: number, volumeRatio: number, amplitude: number, quote: HotStockRow): KnowledgeObservation[] {
  return [
    { label: '信号涨跌', value: signedPct(changePct), tone: changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'neutral' },
    { label: '相对量能', value: `${volumeRatio.toFixed(2)}x`, tone: volumeRatio >= 1.2 ? 'watch' : 'neutral' },
    { label: '信号振幅', value: `${amplitude.toFixed(2)}%`, tone: amplitude >= 7 ? 'watch' : 'neutral' },
    { label: '当前换手', value: `${quote.turnoverRate.toFixed(2)}%`, tone: quote.turnoverRate >= 10 ? 'watch' : 'neutral' }
  ];
}

function findSignalIndex(termId: string, candles: Candle[], quote: HotStockRow) {
  for (let index = candles.length - 1; index >= Math.max(20, candles.length - 60); index -= 1) {
    const signal = candles[index];
    const previous = candles[index - 1];
    if (!previous) continue;
    const avg5 = average(candles.slice(index - 5, index).map((item) => item.volume));
    const volumeRatio = avg5 > 0 ? signal.volume / avg5 : 0;
    const change = ((signal.close - previous.close) / previous.close) * 100;
    const prior20 = candles.slice(index - 20, index);
    const priorHigh = Math.max(...prior20.map((item) => item.high));
    const ma20 = average(candles.slice(index - 19, index + 1).map((item) => item.close));
    if (termId === 'volume-price-rise' && change > 0.8 && volumeRatio >= 1.25) return index;
    if (termId === 'volume-breakout' && signal.close > priorHigh && volumeRatio >= 1.2) return index;
    if (termId === 'low-volume-pullback' && change < 0 && volumeRatio < 0.85 && signal.close >= ma20) return index;
    if ((termId === 'volume-price-divergence' || termId === 'price-rise-volume-fall') && change > 0 && volumeRatio < 0.9) return index;
    if (termId === 'price-fall-volume-rise' && change < 0 && volumeRatio > 1.25) return index;
    if (termId === 'high-volume' && volumeRatio > 1.8) return index;
    if (termId === 'volume-ratio' && volumeRatio >= 1.5) return index;
    if (termId === 'amplitude' && ((signal.high - signal.low) / previous.close) * 100 >= 7) return index;
    if (termId === 'limit-up' && change >= stockLimitThreshold(quote.code, quote.name) - 0.5) return index;
    if (termId === 'volume-cluster') {
      const recent5 = average(candles.slice(index - 4, index + 1).map((item) => item.volume));
      const earlier20 = average(candles.slice(index - 25, index - 5).map((item) => item.volume));
      if (earlier20 > 0 && recent5 / earlier20 >= 1.35) return index;
    }
  }
  return candidateMatches(termId, quote) ? candles.length - 1 : null;
}

function scoreCandidate(termId: string, row: HotStockRow): KnowledgeCaseCandidate {
  const reasons = candidateReasons(termId, row);
  const hasVolumeRatio = row.volumeRatio > 0;
  let score = 0;
  if (termId === 'volume-price-rise' || termId === 'volume-breakout') score = 12 + positive(row.changePct) * 4 + (hasVolumeRatio ? positive(row.volumeRatio - 1) * 24 : 8) + liquidityScore(row);
  else if (termId === 'low-volume-pullback') score = 12 + (row.changePct <= 0 && row.changePct >= -4 ? 43 : 0) + (hasVolumeRatio ? positive(1 - row.volumeRatio) * 25 : 8) + liquidityScore(row);
  else if (termId === 'volume-price-divergence' || termId === 'price-rise-volume-fall') score = 12 + (row.changePct > 0 && (!hasVolumeRatio || row.volumeRatio < 1) ? 48 + row.changePct * 3 : 0) + liquidityScore(row);
  else if (termId === 'price-fall-volume-rise') score = 12 + (row.changePct < 0 && (!hasVolumeRatio || row.volumeRatio > 1.15) ? 43 + Math.abs(row.changePct) * 3 : 0) + (hasVolumeRatio ? row.volumeRatio * 8 : liquidityScore(row));
  else if (termId === 'high-volume' || termId === 'volume-cluster' || termId === 'volume-ratio') score = !hasVolumeRatio || row.volumeRatio > 1 ? 45 + (hasVolumeRatio ? row.volumeRatio * 15 : liquidityScore(row) + 12) : 0;
  else if (termId === 'turnover-rate') score = row.turnoverRate > 3 ? 45 + row.turnoverRate * 2 + liquidityScore(row) : 0;
  else if (termId === 'amplitude') score = row.amplitude > 4 ? 45 + row.amplitude * 3 + liquidityScore(row) : 0;
  else if (termId === 'limit-up') score = row.changePct > 4 ? 45 + row.changePct * 5 : 0;
  else if (termId === 'large-order-flow') score = row.mainNetInflow > 0 ? 50 + positive(row.mainNetInflowPct) * 2 + liquidityScore(row) : 0;
  else if (termId === 'price-speed') score = row.speed > 0 ? 50 + row.speed * 12 + liquidityScore(row) : 0;
  else score = 50 + liquidityScore(row) + Math.abs(row.changePct);
  return { ...row, matchScore: clamp(Math.round(score), 0, 99), matchReasons: reasons };
}

function candidateMatches(termId: string, row: HotStockRow) {
  if (termId === 'turnover-rate') return row.turnoverRate >= 8;
  if (termId === 'volume-ratio') return row.volumeRatio >= 1.5;
  if (termId === 'amplitude') return row.amplitude >= 7;
  if (termId === 'limit-up') return row.changePct >= stockLimitThreshold(row.code, row.name) - 0.5;
  if (termId === 'large-order-flow') return row.mainNetInflow > 0 && row.mainNetInflowPct > 0;
  if (termId === 'price-speed') return row.speed >= 1;
  return true;
}

function candidateReasons(termId: string, row: HotStockRow) {
  if (termId === 'turnover-rate') return [`当前换手 ${row.turnoverRate.toFixed(2)}%`, `成交额 ${compactAmount(row.amount)}`];
  if (termId === 'volume-ratio' || termId === 'high-volume' || termId === 'volume-cluster') return [row.volumeRatio > 0 ? `当前量比 ${row.volumeRatio.toFixed(2)}` : '量能由日K计算', `成交额 ${compactAmount(row.amount)}`];
  if (termId === 'amplitude') return [`当前振幅 ${row.amplitude.toFixed(2)}%`, `换手 ${row.turnoverRate.toFixed(2)}%`];
  if (termId === 'large-order-flow') return [`大单净额 ${compactAmount(row.mainNetInflow)}`, `净占比 ${signedPct(row.mainNetInflowPct)}`];
  if (termId === 'price-speed') return [`涨速 ${signedPct(row.speed)}`, `当前涨幅 ${signedPct(row.changePct)}`];
  if (termId === 'low-volume-pullback') return [`当前涨跌 ${signedPct(row.changePct)}`, `量比 ${row.volumeRatio.toFixed(2)}`];
  return [`当前涨幅 ${signedPct(row.changePct)}`, row.volumeRatio > 0 ? `量比 ${row.volumeRatio.toFixed(2)}` : '量能由日K计算', `成交额 ${compactAmount(row.amount)}`];
}

function candidateSortKey(termId: string): HotStockSortKey {
  if (termId === 'turnover-rate' || termId === 'amplitude') return 'turnover';
  if (termId === 'limit-up' || termId === 'price-speed') return 'change';
  return 'amount';
}

function stockLimitThreshold(code: string, name: string) {
  if (name.toUpperCase().includes('ST')) return 5;
  if (code.startsWith('8') || code.startsWith('4') || code.startsWith('920')) return 30;
  if (code.startsWith('300') || code.startsWith('301') || code.startsWith('688')) return 20;
  return 10;
}

function scoreConfidence(checks: boolean[]) {
  return Math.round(52 + (checks.filter(Boolean).length / checks.length) * 43);
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function positive(value: number) {
  return Math.max(0, value);
}

function liquidityScore(row: HotStockRow) {
  return clamp(Math.log10(Math.max(row.amount, 1)) * 2 - 12, 0, 15);
}

function rangePosition(price: number, low: number, high: number) {
  return high > low ? clamp(((price - low) / (high - low)) * 100, 0, 100) : 50;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function signedPct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function compactAmount(value: number) {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${sign}${(absolute / 100_000_000).toFixed(1)}亿`;
  if (absolute >= 10_000) return `${sign}${(absolute / 10_000).toFixed(0)}万`;
  return `${Math.round(value)}`;
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
