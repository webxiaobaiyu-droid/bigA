import type { Candle, ChartGuide, ChartMarker } from '@/types/market';
import type { HotStockRow } from '@/types/sector';

export interface KnowledgeCaseCandidate extends HotStockRow {
  matchScore: number;
  matchReasons: string[];
}

export interface KnowledgeObservation {
  label: string;
  value: string;
  tone: 'up' | 'down' | 'watch' | 'neutral';
}

export interface KnowledgeCaseAnalysis {
  matched: boolean;
  confidence: number;
  signalDate: string;
  ruleLabel: string;
  ruleDescription: string;
  candles: Candle[];
  markers: ChartMarker[];
  guides: ChartGuide[];
  observations: KnowledgeObservation[];
  explanations: string[];
  caveat: string;
}

export type KnowledgePatternId = 'volumePriceRise' | 'volumeBreakout' | 'lowVolumePullback' | 'highVolumeStall' | 'trendBreak' | 'sectorResonance';

export interface KnowledgePatternDefinition {
  id: KnowledgePatternId;
  label: string;
  shortLabel: string;
  tone: 'red' | 'gold' | 'green' | 'cyan' | 'orange' | 'violet';
  description: string;
  falsification: string;
}

export interface KnowledgeRuleConfig {
  minRisePct: number;
  volumeRiseRatio: number;
  breakoutDays: number;
  breakoutVolumeRatio: number;
  pullbackVolumeRatio: number;
  stallVolumeRatio: number;
  trendDays: number;
  sectorRisePct: number;
  sectorBreadthRatio: number;
}

export interface KnowledgeSectorContext {
  name: string;
  changePct: number;
  breadthRatio: number | null;
}

export interface KnowledgeScannedStock {
  code: string;
  name: string;
  quote: HotStockRow;
  candles: Candle[];
  sector: KnowledgeSectorContext | null;
}

export interface KnowledgePatternEvidence {
  label: string;
  value: string;
  passed: boolean;
}

export interface KnowledgePatternOutcome {
  day1: number | null;
  day3: number | null;
  day5: number | null;
  day10: number | null;
  maxFavorable5: number | null;
  maxAdverse5: number | null;
}

export interface KnowledgePatternEvent {
  id: string;
  patternId: KnowledgePatternId;
  code: string;
  name: string;
  date: string;
  candleIndex: number;
  matched: boolean;
  score: number;
  current: boolean;
  summary: string;
  evidence: KnowledgePatternEvidence[];
  outcome: KnowledgePatternOutcome;
  markers: ChartMarker[];
  guides: ChartGuide[];
}

export interface KnowledgeMarketDataset {
  updatedAt: number;
  tradeDate: string;
  stocks: KnowledgeScannedStock[];
  sourceLabel: string;
}

export interface KnowledgePatternSnapshot {
  updatedAt: number;
  tradeDate: string;
  stocks: KnowledgeScannedStock[];
  events: KnowledgePatternEvent[];
  currentEvents: KnowledgePatternEvent[];
}

export interface KnowledgeTrainingAttempt {
  id: string;
  eventId: string;
  patternId: KnowledgePatternId;
  code: string;
  name: string;
  date: string;
  answer: boolean;
  expected: boolean;
  correct: boolean;
  createdAt: number;
}
