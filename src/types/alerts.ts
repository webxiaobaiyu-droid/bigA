import type { InstrumentState } from '@/types/market';

export type AlertRuleType =
  | 'priceAbove'
  | 'priceBelow'
  | 'changePctAbove'
  | 'changePctBelow'
  | 'volumeRatioAbove'
  | 'amountAbove'
  | 'turnoverAbove'
  | 'volumeSurge'
  | 'maCrossUp'
  | 'maCrossDown'
  | 'limitOpen'
  | 'sectorChangeAbove';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertRuleBase {
  id: string;
  name: string;
  type: AlertRuleType;
  enabled: boolean;
  /** Empty or omitted means every instrument. */
  instrumentCodes?: string[];
  /** Empty or omitted means every sector. */
  sectors?: string[];
  /** Empty or omitted means every watchlist group. Group membership is resolved at evaluation time. */
  groupIds?: string[];
  cooldownMs?: number;
  severity?: AlertSeverity;
}

export interface ThresholdAlertRule extends AlertRuleBase {
  type:
    | 'priceAbove'
    | 'priceBelow'
    | 'changePctAbove'
    | 'changePctBelow'
    | 'volumeRatioAbove'
    | 'amountAbove'
    | 'turnoverAbove'
    | 'sectorChangeAbove';
  threshold: number;
}

export interface VolumeSurgeAlertRule extends AlertRuleBase {
  type: 'volumeSurge';
  threshold: number;
  /** Number of completed daily candles used as the volume baseline. */
  lookbackDays?: number;
}

export interface MaCrossAlertRule extends AlertRuleBase {
  type: 'maCrossUp' | 'maCrossDown';
  fastPeriod?: number;
  slowPeriod?: number;
}

export interface LimitOpenAlertRule extends AlertRuleBase {
  type: 'limitOpen';
}

export type AlertRule = ThresholdAlertRule | VolumeSurgeAlertRule | MaCrossAlertRule | LimitOpenAlertRule;

export interface AlertRuntimeEntry {
  /** Last evaluable condition. Missing market data does not change it. */
  active: boolean;
  lastEvaluatedAt: number;
  lastTriggeredAt?: number;
  lastValue?: number;
}

export interface AlertRuntime {
  entries: Record<string, AlertRuntimeEntry>;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  ruleType: AlertRuleType;
  severity: AlertSeverity;
  instrumentCode: string;
  instrumentName: string;
  sector: string;
  value: number;
  threshold?: number;
  occurredAt: number;
  message: string;
}

export interface AlertHistoryItem extends AlertEvent {
  readAt?: number;
}

export interface AlertSettings {
  enabled: boolean;
  defaultCooldownMs: number;
  systemNotifications: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  maxHistory: number;
  rules: AlertRule[];
}

export type SectorChangeContext = Readonly<Record<string, number | null | undefined>>;

export interface AlertEvaluationInput {
  instruments: readonly InstrumentState[];
  rules: readonly AlertRule[];
  runtime: Readonly<AlertRuntime>;
  sectorChanges?: SectorChangeContext;
  /** Current watchlist group memberships keyed by instrument code. */
  groupIdsByInstrument?: Readonly<Record<string, string | undefined>>;
  now?: number | Date;
  defaultCooldownMs?: number;
}

export interface AlertEvaluationResult {
  events: AlertEvent[];
  runtime: AlertRuntime;
}
