import type {
  AlertEvaluationInput,
  AlertEvaluationResult,
  AlertEvent,
  AlertRule,
  AlertRuntime,
  SectorChangeContext
} from '@/types/alerts';
import type { Candle, InstrumentState } from '@/types/market';

const DEFAULT_COOLDOWN_MS = 5 * 60_000;
const DEFAULT_VOLUME_LOOKBACK = 5;

interface RuleEvaluation {
  matched: boolean;
  value: number;
  threshold?: number;
}

export function createAlertRuntime(): AlertRuntime {
  return { entries: {} };
}

/**
 * Evaluate a snapshot without mutating the rules, instruments, or supplied runtime.
 * A rule emits only on a false-to-true edge and only when its cooldown has elapsed.
 */
export function evaluateAlerts(input: AlertEvaluationInput): AlertEvaluationResult;
export function evaluateAlerts(
  instruments: readonly InstrumentState[],
  rules: readonly AlertRule[],
  runtime: Readonly<AlertRuntime>,
  sectorChanges?: SectorChangeContext,
  now?: number | Date
): AlertEvaluationResult;
export function evaluateAlerts(
  inputOrInstruments: AlertEvaluationInput | readonly InstrumentState[],
  rules?: readonly AlertRule[],
  runtime?: Readonly<AlertRuntime>,
  sectorChanges?: SectorChangeContext,
  now?: number | Date
): AlertEvaluationResult {
  const input = normalizeInput(inputOrInstruments, rules, runtime, sectorChanges, now);
  const timestamp = normalizeNow(input.now);
  const nextRuntime: AlertRuntime = {
    entries: Object.fromEntries(Object.entries(input.runtime.entries ?? {}).map(([key, entry]) => [key, { ...entry }]))
  };
  const events: AlertEvent[] = [];

  for (const rule of input.rules) {
    if (!rule.enabled) continue;

    for (const instrument of input.instruments) {
      if (!appliesToInstrument(rule, instrument, input.groupIdsByInstrument)) continue;

      const key = runtimeKey(rule.id, instrument.meta.code);
      const previous = nextRuntime.entries[key];
      const evaluation = evaluateRule(rule, instrument, input.sectorChanges);

      // An unavailable value is not false: retaining the prior edge state prevents
      // a transient provider gap from rearming an already-active alert.
      if (!evaluation) continue;

      const risingEdge = evaluation.matched && !previous?.active;
      const cooldownMs = validNonNegative(rule.cooldownMs)
        ? rule.cooldownMs
        : validNonNegative(input.defaultCooldownMs)
          ? input.defaultCooldownMs
          : DEFAULT_COOLDOWN_MS;
      const cooledDown = previous?.lastTriggeredAt === undefined || timestamp - previous.lastTriggeredAt >= cooldownMs;

      nextRuntime.entries[key] = {
        active: evaluation.matched,
        lastEvaluatedAt: timestamp,
        lastTriggeredAt: previous?.lastTriggeredAt,
        lastValue: evaluation.value
      };

      if (risingEdge && cooledDown) {
        const event = buildEvent(rule, instrument, evaluation, timestamp);
        events.push(event);
        nextRuntime.entries[key].lastTriggeredAt = timestamp;
      }
    }
  }

  return { events, runtime: nextRuntime };
}

/** Alias for callers that describe the operation in terms of a rule set. */
export const evaluateAlertRules = evaluateAlerts;

export function getAsharePriceLimitPct(instrument: Pick<InstrumentState, 'meta' | 'quote'>): number | null {
  const name = instrument.quote.name.trim();
  if (/^[NC](?![a-z])/i.test(name)) return null;
  if (/ST/i.test(name)) return 5;

  const code = instrument.meta.code.replace(/\D/g, '');
  if (instrument.meta.market === 'BJ' || /^[48]/.test(code)) return 30;
  if (/^(?:300|301|688|689)/.test(code)) return 20;
  return 10;
}

function evaluateRule(
  rule: AlertRule,
  instrument: InstrumentState,
  sectorChanges?: SectorChangeContext
): RuleEvaluation | null {
  const quote = instrument.quote;

  switch (rule.type) {
    case 'priceAbove':
      return compare(positiveFinite(quote.price), rule.threshold, (value, threshold) => value > threshold);
    case 'priceBelow':
      return compare(positiveFinite(quote.price), rule.threshold, (value, threshold) => value < threshold);
    case 'changePctAbove':
      return compare(finite(quote.changePct), rule.threshold, (value, threshold) => value > threshold);
    case 'changePctBelow':
      return compare(finite(quote.changePct), rule.threshold, (value, threshold) => value < threshold);
    case 'volumeRatioAbove':
      return compare(nonNegativeFinite(instrument.indicators.volumeRatio), rule.threshold, (value, threshold) => value > threshold);
    case 'amountAbove':
      return compare(nonNegativeFinite(quote.amount), rule.threshold, (value, threshold) => value > threshold);
    case 'turnoverAbove':
      return compare(nonNegativeFinite(quote.turnoverRate), rule.threshold, (value, threshold) => value > threshold);
    case 'volumeSurge': {
      const ratio = dailyVolumeRatio(instrument.candles['1d'], rule.lookbackDays);
      return compare(ratio, rule.threshold, (value, threshold) => value > threshold);
    }
    case 'maCrossUp':
    case 'maCrossDown':
      return evaluateMaCross(instrument.candles['1d'], rule);
    case 'limitOpen':
      return evaluateLimitOpen(instrument);
    case 'sectorChangeAbove': {
      const sectorChange = sectorChanges?.[instrument.meta.sector];
      return compare(finite(sectorChange), rule.threshold, (value, threshold) => value > threshold);
    }
  }
}

function evaluateMaCross(candles: readonly Candle[], rule: Extract<AlertRule, { type: 'maCrossUp' | 'maCrossDown' }>): RuleEvaluation | null {
  const fastPeriod = validPeriod(rule.fastPeriod, 5);
  const slowPeriod = validPeriod(rule.slowPeriod, 10);
  if (fastPeriod >= slowPeriod || candles.length < slowPeriod + 1) return null;

  const closes = candles.map((candle) => positiveFinite(candle.close));
  if (closes.some((value) => value === null)) return null;

  const values = closes as number[];
  const previousFast = average(values.slice(-fastPeriod - 1, -1));
  const currentFast = average(values.slice(-fastPeriod));
  const previousSlow = average(values.slice(-slowPeriod - 1, -1));
  const currentSlow = average(values.slice(-slowPeriod));
  const spread = currentFast - currentSlow;
  const matched = rule.type === 'maCrossUp'
    ? previousFast <= previousSlow && spread > 0
    : previousFast >= previousSlow && spread < 0;

  return { matched, value: spread, threshold: 0 };
}

function evaluateLimitOpen(instrument: InstrumentState): RuleEvaluation | null {
  const limitPct = getAsharePriceLimitPct(instrument);
  const price = positiveFinite(instrument.quote.price);
  const high = positiveFinite(instrument.quote.high);
  const prevClose = positiveFinite(instrument.quote.prevClose);
  if (limitPct === null || price === null || high === null || prevClose === null) return null;

  const limitPrice = roundToFen(prevClose * (1 + limitPct / 100));
  const tolerance = 0.005;
  return {
    matched: high >= limitPrice - tolerance && price < limitPrice - tolerance,
    value: price,
    threshold: limitPrice
  };
}

function dailyVolumeRatio(candles: readonly Candle[], requestedLookback?: number): number | null {
  const lookback = validPeriod(requestedLookback, DEFAULT_VOLUME_LOOKBACK);
  if (candles.length < lookback + 1) return null;

  const current = nonNegativeFinite(candles[candles.length - 1].volume);
  const baseline = candles.slice(-lookback - 1, -1).map((candle) => nonNegativeFinite(candle.volume));
  if (current === null || baseline.some((value) => value === null)) return null;

  const baselineAverage = average(baseline as number[]);
  return baselineAverage > 0 ? current / baselineAverage : null;
}

function compare(
  value: number | null,
  threshold: number,
  predicate: (value: number, threshold: number) => boolean
): RuleEvaluation | null {
  if (value === null || !Number.isFinite(threshold)) return null;
  return { matched: predicate(value, threshold), value, threshold };
}

function appliesToInstrument(
  rule: AlertRule,
  instrument: InstrumentState,
  groupIdsByInstrument?: Readonly<Record<string, string | undefined>>
): boolean {
  if (rule.instrumentCodes?.length && !rule.instrumentCodes.includes(instrument.meta.code)) return false;
  if (rule.sectors?.length && !rule.sectors.includes(instrument.meta.sector)) return false;
  if (rule.groupIds?.length && !rule.groupIds.includes(groupIdsByInstrument?.[instrument.meta.code] ?? '')) return false;
  return true;
}

function buildEvent(rule: AlertRule, instrument: InstrumentState, evaluation: RuleEvaluation, now: number): AlertEvent {
  return {
    id: `${encodeURIComponent(rule.id)}:${encodeURIComponent(instrument.meta.code)}:${now}`,
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.type,
    severity: rule.severity ?? 'warning',
    instrumentCode: instrument.meta.code,
    instrumentName: instrument.quote.name,
    sector: instrument.meta.sector,
    value: evaluation.value,
    threshold: evaluation.threshold,
    occurredAt: now,
    message: `${instrument.quote.name}(${instrument.meta.code}) ${rule.name}`
  };
}

function runtimeKey(ruleId: string, instrumentCode: string) {
  return `${encodeURIComponent(ruleId)}::${encodeURIComponent(instrumentCode)}`;
}

function normalizeInput(
  inputOrInstruments: AlertEvaluationInput | readonly InstrumentState[],
  rules: readonly AlertRule[] | undefined,
  runtime: Readonly<AlertRuntime> | undefined,
  sectorChanges: SectorChangeContext | undefined,
  now: number | Date | undefined
): AlertEvaluationInput {
  if (!Array.isArray(inputOrInstruments)) return inputOrInstruments as AlertEvaluationInput;
  if (!rules || !runtime) throw new TypeError('Alert rules and runtime are required');
  return { instruments: inputOrInstruments, rules, runtime, sectorChanges, now };
}

function normalizeNow(value: number | Date | undefined) {
  const timestamp = value instanceof Date ? value.getTime() : value ?? Date.now();
  if (!Number.isFinite(timestamp)) throw new TypeError('Alert evaluation now must be a finite timestamp');
  return timestamp;
}

function validPeriod(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && (value as number) > 0 ? value as number : fallback;
}

function validNonNegative(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveFinite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegativeFinite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function average(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundToFen(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
