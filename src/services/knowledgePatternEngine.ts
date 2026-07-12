import { fetchHotStockRows, fetchSectorRows, fetchStockCandles } from '@/services/sectorProvider';
import type { Candle, ChartGuide } from '@/types/market';
import type {
  KnowledgeMarketDataset,
  KnowledgePatternDefinition,
  KnowledgePatternEvent,
  KnowledgePatternEvidence,
  KnowledgePatternId,
  KnowledgePatternOutcome,
  KnowledgePatternSnapshot,
  KnowledgeRuleConfig,
  KnowledgeScannedStock,
  KnowledgeSectorContext
} from '@/types/knowledge';
import type { HotStockRow, SectorRow } from '@/types/sector';

export const KNOWLEDGE_RULE_VERSION = '2026.07-v1';

export const DEFAULT_KNOWLEDGE_RULES: KnowledgeRuleConfig = {
  minRisePct: 1.5,
  volumeRiseRatio: 1.35,
  breakoutDays: 20,
  breakoutVolumeRatio: 1.2,
  pullbackVolumeRatio: 0.82,
  stallVolumeRatio: 1.8,
  trendDays: 20,
  sectorRisePct: 1,
  sectorBreadthRatio: 0.6
};

export const KNOWLEDGE_PATTERNS: KnowledgePatternDefinition[] = [
  { id: 'volumePriceRise', label: '量价齐升', shortLabel: '量价', tone: 'red', description: '价格上涨、成交量放大且收盘位于日内相对高位。', falsification: '高位巨量长上影、次日无承接或量能仅为一次性脉冲。' },
  { id: 'volumeBreakout', label: '放量突破', shortLabel: '突破', tone: 'gold', description: '收盘越过阶段前高，同时成交量高于短期常态。', falsification: '盘中越过但收盘跌回，或突破后快速回到原平台。' },
  { id: 'lowVolumePullback', label: '缩量回踩', shortLabel: '回踩', tone: 'green', description: '上涨结构中的回落缩量，且关键趋势参考尚未失守。', falsification: '缩量阴跌但价格重心持续下移，或收盘已跌破趋势参考。' },
  { id: 'highVolumeStall', label: '高位放量滞涨', shortLabel: '滞涨', tone: 'orange', description: '价格位于阶段高位，成交异常放大但推进效率下降。', falsification: '放量后收在高位并继续扩展趋势，可能是有效换手而非滞涨。' },
  { id: 'trendBreak', label: '趋势破位', shortLabel: '破位', tone: 'violet', description: '收盘跌破趋势均价或阶段低点，结构由强转弱。', falsification: '盘中跌破后快速收回，或次日重新站上关键结构。' },
  { id: 'sectorResonance', label: '板块共振', shortLabel: '共振', tone: 'cyan', description: '个股与所属行业同步走强，且板块上涨具有一定覆盖度。', falsification: '仅龙头独涨、后排不跟，或板块冲高后覆盖度迅速下降。' }
];

const DATASET_CACHE_MS = 5 * 60_000;
let datasetCache: { expiresAt: number; request: Promise<KnowledgeMarketDataset> } | null = null;

export function fetchKnowledgeMarketDataset(force = false) {
  if (!force && datasetCache && datasetCache.expiresAt > Date.now()) return datasetCache.request;
  const request = loadKnowledgeMarketDataset().catch((error) => {
    datasetCache = null;
    throw error;
  });
  datasetCache = { expiresAt: Date.now() + DATASET_CACHE_MS, request };
  return request;
}

export function analyzeKnowledgePatterns(dataset: KnowledgeMarketDataset, rules: KnowledgeRuleConfig): KnowledgePatternSnapshot {
  const events = dataset.stocks.flatMap((stock) => scanStock(stock, rules));
  return {
    updatedAt: Date.now(),
    tradeDate: dataset.tradeDate,
    stocks: dataset.stocks,
    events: events.sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score),
    currentEvents: events.filter((event) => event.current && event.matched).sort((a, b) => b.score - a.score)
  };
}

export function patternDefinition(id: KnowledgePatternId) {
  return KNOWLEDGE_PATTERNS.find((pattern) => pattern.id === id) ?? KNOWLEDGE_PATTERNS[0];
}

async function loadKnowledgeMarketDataset(): Promise<KnowledgeMarketDataset> {
  const [hotResult, sectorResult] = await Promise.allSettled([
    fetchHotStockRows('amount'),
    fetchSectorRows('industry', 'breadth')
  ]);
  const hotRows = hotResult.status === 'fulfilled' ? hotResult.value.slice(0, 18) : [];
  const sectors = sectorResult.status === 'fulfilled' ? sectorResult.value.slice(0, 8) : [];
  const seeds = buildSeeds(hotRows, sectors).slice(0, 24);
  const loaded = await mapWithConcurrency(seeds, 5, async (seed) => {
    const candles = await fetchStockCandles(seed.code, '1d');
    if (candles.length < 40) return null;
    const normalized = candles.slice(-180);
    return {
      code: seed.code,
      name: seed.name,
      quote: seed.quote ?? quoteFromCandles(seed.code, seed.name, normalized),
      candles: normalized,
      sector: seed.sector
    } satisfies KnowledgeScannedStock;
  });
  const stocks = loaded.filter((stock): stock is KnowledgeScannedStock => Boolean(stock));
  if (!stocks.length) throw new Error('No knowledge market samples available');
  const tradeDate = stocks.map((stock) => dateKey(stock.candles.at(-1)?.time ?? 0)).sort((a, b) => b.localeCompare(a))[0] ?? '';
  return { updatedAt: Date.now(), tradeDate, stocks, sourceLabel: '东方财富活跃榜 / 新浪日K回退' };
}

interface StockSeed {
  code: string;
  name: string;
  quote: HotStockRow | null;
  sector: KnowledgeSectorContext | null;
}

function buildSeeds(hotRows: HotStockRow[], sectors: SectorRow[]) {
  const byCode = new Map<string, StockSeed>();
  hotRows.forEach((quote) => byCode.set(quote.code, { code: quote.code, name: quote.name, quote, sector: null }));
  sectors.forEach((sector) => {
    if (!sector.leaderCode) return;
    const context = sectorContext(sector);
    const existing = byCode.get(sector.leaderCode);
    if (existing) existing.sector = context;
    else byCode.set(sector.leaderCode, { code: sector.leaderCode, name: sector.leaderName, quote: null, sector: context });
  });
  return [...byCode.values()];
}

function sectorContext(sector: SectorRow): KnowledgeSectorContext {
  const total = sector.upCount + sector.downCount + sector.flatCount;
  return {
    name: sector.name,
    changePct: sector.changePct,
    breadthRatio: total > 0 ? sector.upCount / total : null
  };
}

function scanStock(stock: KnowledgeScannedStock, rules: KnowledgeRuleConfig) {
  return KNOWLEDGE_PATTERNS.flatMap((pattern) => scanPattern(stock, pattern.id, rules));
}

function scanPattern(stock: KnowledgeScannedStock, patternId: KnowledgePatternId, rules: KnowledgeRuleConfig) {
  const candles = stock.candles;
  const start = Math.max(Math.max(rules.breakoutDays, rules.trendDays, 10) + 2, candles.length - 100);
  const candidates: KnowledgePatternEvent[] = [];
  const firstIndex = patternId === 'sectorResonance' ? candles.length - 1 : start;

  for (let index = firstIndex; index < candles.length; index += 1) {
    const evaluation = evaluatePattern(stock, patternId, index, rules);
    if (!evaluation || (!evaluation.matched && evaluation.passedCount < evaluation.requiredCount - 1)) continue;
    candidates.push(buildPatternEvent(stock, patternId, index, evaluation));
  }

  const current = candidates.filter((event) => event.current);
  const historical = candidates.filter((event) => !event.current);
  const matched = historical.filter((event) => event.matched).slice(-4);
  const nearMisses = historical.filter((event) => !event.matched).slice(-2);
  return uniqueEvents([...current, ...matched, ...nearMisses]);
}

interface PatternEvaluation {
  matched: boolean;
  passedCount: number;
  requiredCount: number;
  score: number;
  summary: string;
  evidence: KnowledgePatternEvidence[];
  guides: ChartGuide[];
  markerPosition: 'aboveBar' | 'belowBar';
  markerText: string;
}

function evaluatePattern(stock: KnowledgeScannedStock, patternId: KnowledgePatternId, index: number, rules: KnowledgeRuleConfig): PatternEvaluation | null {
  const candles = stock.candles;
  const candle = candles[index];
  const previous = candles[index - 1];
  if (!candle || !previous || previous.close <= 0) return null;
  const changePct = ((candle.close - previous.close) / previous.close) * 100;
  const averageVolume5 = average(candles.slice(index - 5, index).map((item) => item.volume));
  const volumeRatio = averageVolume5 > 0 ? candle.volume / averageVolume5 : 0;
  const closePosition = candle.high > candle.low ? (candle.close - candle.low) / (candle.high - candle.low) : 0.5;
  const ma = average(candles.slice(index - rules.trendDays + 1, index + 1).map((item) => item.close));
  const previousMa = average(candles.slice(index - rules.trendDays, index).map((item) => item.close));
  const priorHigh = Math.max(...candles.slice(index - rules.breakoutDays, index).map((item) => item.high));
  const priorLow10 = Math.min(...candles.slice(index - 10, index).map((item) => item.low));
  const priceAboveMaPct = ma > 0 ? ((candle.close - ma) / ma) * 100 : 0;

  if (patternId === 'volumePriceRise') return result([
    evidence('价格上涨', signedPct(changePct), changePct >= rules.minRisePct),
    evidence('相对量能', `${volumeRatio.toFixed(2)}x`, volumeRatio >= rules.volumeRiseRatio),
    evidence('收盘位置', `${(closePosition * 100).toFixed(0)}%`, closePosition >= 0.65)
  ], `涨幅 ${signedPct(changePct)}，量能 ${volumeRatio.toFixed(2)}x`, [], 'belowBar', `量价 ${volumeRatio.toFixed(1)}x`);

  if (patternId === 'volumeBreakout') return result([
    evidence(`${rules.breakoutDays}日新高`, `${candle.close.toFixed(2)} / ${priorHigh.toFixed(2)}`, candle.close > priorHigh),
    evidence('突破量能', `${volumeRatio.toFixed(2)}x`, volumeRatio >= rules.breakoutVolumeRatio),
    evidence('收盘确认', `${(closePosition * 100).toFixed(0)}%`, closePosition >= 0.6)
  ], `收盘相对前高 ${signedPct(((candle.close - priorHigh) / priorHigh) * 100)}`, [{ price: priorHigh, color: 'rgba(217,79,79,.72)', title: '突破前高', lineStyle: 'dashed' }], 'belowBar', '突破观察');

  if (patternId === 'lowVolumePullback') return result([
    evidence('价格回落', signedPct(changePct), changePct < 0 && changePct >= -4),
    evidence('成交收缩', `${volumeRatio.toFixed(2)}x`, volumeRatio <= rules.pullbackVolumeRatio),
    evidence('趋势未破', `${candle.close.toFixed(2)} / ${ma.toFixed(2)}`, candle.close >= ma),
    evidence('此前偏强', `${previous.close.toFixed(2)} / ${previousMa.toFixed(2)}`, previous.close >= previousMa)
  ], `回落 ${signedPct(changePct)}，量能缩至 ${volumeRatio.toFixed(2)}x`, [{ price: ma, color: 'rgba(65,198,195,.72)', title: `${rules.trendDays}日均价`, lineStyle: 'dashed' }], 'aboveBar', '缩量回踩');

  if (patternId === 'highVolumeStall') return result([
    evidence('阶段高位', `高于均价 ${signedPct(priceAboveMaPct)}`, priceAboveMaPct >= 6),
    evidence('异常放量', `${volumeRatio.toFixed(2)}x`, volumeRatio >= rules.stallVolumeRatio),
    evidence('推进受阻', `${signedPct(changePct)} / 收盘${(closePosition * 100).toFixed(0)}%`, changePct <= 2 && closePosition < 0.68)
  ], `高于趋势均价 ${signedPct(priceAboveMaPct)}，但价格推进有限`, [{ price: candle.high, color: 'rgba(215,166,66,.65)', title: '放量日高点', lineStyle: 'dotted', axisLabelVisible: false }], 'aboveBar', '放量滞涨?');

  if (patternId === 'trendBreak') return result([
    evidence('跌破均价', `${candle.close.toFixed(2)} / ${ma.toFixed(2)}`, candle.close < ma),
    evidence('结构转弱', `${candle.close.toFixed(2)} / ${priorLow10.toFixed(2)}`, candle.close < priorLow10 || previous.close >= previousMa),
    evidence('卖压确认', `${volumeRatio.toFixed(2)}x`, volumeRatio >= 1)
  ], `收盘低于 ${rules.trendDays} 日均价 ${signedPct(((candle.close - ma) / ma) * 100)}`, [{ price: ma, color: 'rgba(167,149,208,.72)', title: `${rules.trendDays}日均价`, lineStyle: 'dashed' }], 'aboveBar', '趋势破位');

  if (patternId === 'sectorResonance') {
    if (!stock.sector) return null;
    const breadthPassed = stock.sector.breadthRatio === null
      ? stock.sector.changePct >= rules.sectorRisePct * 1.5
      : stock.sector.breadthRatio >= rules.sectorBreadthRatio;
    return result([
      evidence('个股走强', signedPct(changePct), changePct >= rules.minRisePct),
      evidence(`${stock.sector.name}涨幅`, signedPct(stock.sector.changePct), stock.sector.changePct >= rules.sectorRisePct),
      evidence('板块覆盖', stock.sector.breadthRatio === null ? '数据源未提供' : `${(stock.sector.breadthRatio * 100).toFixed(0)}%`, breadthPassed)
    ], `${stock.sector.name}与个股同步走强`, [{ price: candle.close, color: 'rgba(65,198,195,.66)', title: '共振日收盘', lineStyle: 'dotted', axisLabelVisible: false }], 'belowBar', '板块共振');
  }
  return null;
}

function result(evidenceRows: KnowledgePatternEvidence[], summary: string, guides: ChartGuide[], markerPosition: 'aboveBar' | 'belowBar', markerText: string): PatternEvaluation {
  const passedCount = evidenceRows.filter((item) => item.passed).length;
  const requiredCount = evidenceRows.length;
  return {
    matched: passedCount === requiredCount,
    passedCount,
    requiredCount,
    score: Math.round(45 + (passedCount / requiredCount) * 50),
    summary,
    evidence: evidenceRows,
    guides,
    markerPosition,
    markerText
  };
}

function buildPatternEvent(stock: KnowledgeScannedStock, patternId: KnowledgePatternId, index: number, evaluation: PatternEvaluation): KnowledgePatternEvent {
  const candle = stock.candles[index];
  const current = index === stock.candles.length - 1;
  const date = dateKey(candle.time);
  return {
    id: `${patternId}:${stock.code}:${date}`,
    patternId,
    code: stock.code,
    name: stock.name,
    date,
    candleIndex: index,
    matched: evaluation.matched,
    score: evaluation.score,
    current,
    summary: evaluation.summary,
    evidence: evaluation.evidence,
    outcome: calculateOutcome(stock.candles, index),
    markers: [{ time: candle.time, position: evaluation.markerPosition, color: evaluation.matched ? '#d94f4f' : '#d7a642', shape: evaluation.markerPosition === 'belowBar' ? 'arrowUp' : 'arrowDown', text: evaluation.markerText, size: 1 }],
    guides: evaluation.guides
  };
}

function calculateOutcome(candles: Candle[], index: number): KnowledgePatternOutcome {
  const base = candles[index]?.close ?? 0;
  const changeAt = (offset: number) => candles[index + offset] && base > 0 ? ((candles[index + offset].close - base) / base) * 100 : null;
  const next5 = candles.slice(index + 1, index + 6);
  return {
    day1: changeAt(1),
    day3: changeAt(3),
    day5: changeAt(5),
    day10: changeAt(10),
    maxFavorable5: next5.length && base > 0 ? ((Math.max(...next5.map((item) => item.high)) - base) / base) * 100 : null,
    maxAdverse5: next5.length && base > 0 ? ((Math.min(...next5.map((item) => item.low)) - base) / base) * 100 : null
  };
}

function quoteFromCandles(code: string, name: string, candles: Candle[]): HotStockRow {
  const latest = candles.at(-1)!;
  const previous = candles.at(-2) ?? latest;
  const change = latest.close - previous.close;
  const changePct = previous.close > 0 ? (change / previous.close) * 100 : 0;
  return { code, name, price: latest.close, prevClose: previous.close, open: latest.open, high: latest.high, low: latest.low, change, changePct, amplitude: previous.close > 0 ? ((latest.high - latest.low) / previous.close) * 100 : 0, volume: latest.volume, amount: 0, turnoverRate: 0, pe: 0, volumeRatio: 0, marketCap: 0, floatMarketCap: 0, mainNetInflow: 0, mainNetInflowPct: 0, speed: 0, updatedAt: latest.time * 1000, fetchedAt: Date.now() };
}

function evidence(label: string, value: string, passed: boolean): KnowledgePatternEvidence {
  return { label, value, passed };
}

function uniqueEvents(events: KnowledgePatternEvent[]) {
  return [...new Map(events.map((event) => [event.id, event])).values()];
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await mapper(items[index]);
      } catch {
        results[index] = null as R;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function dateKey(timestamp: number) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function signedPct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
