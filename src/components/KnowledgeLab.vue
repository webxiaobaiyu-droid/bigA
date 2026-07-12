<template>
  <div class="knowledge-lab">
    <div v-if="loading && !snapshot" class="lab-state">
      <RefreshCw :size="25" class="spin" />
      <strong>扫描真实 A 股样本</strong>
      <span>拉取活跃榜、行业龙头与最近日 K</span>
    </div>
    <div v-else-if="error && !snapshot" class="lab-state">
      <DatabaseZap :size="25" />
      <strong>{{ error }}</strong>
      <button type="button" @click="loadDataset(true)">重新扫描</button>
    </div>

    <template v-else-if="snapshot">
      <div v-if="mode === 'radar'" class="radar-view">
        <div class="lab-pulse-strip">
          <div><span>样本交易日</span><strong>{{ snapshot.tradeDate }}</strong><em>{{ dataset?.sourceLabel }}</em></div>
          <div><span>扫描股票</span><strong>{{ snapshot.stocks.length }}</strong><em>活跃股 + 行业龙头</em></div>
          <div><span>今日命中</span><strong class="up">{{ snapshot.currentEvents.length }}</strong><em>六类规则合计</em></div>
          <div><span>历史案例</span><strong>{{ matchedHistoricalCount }}</strong><em>含后续表现</em></div>
          <div><span>规则版本</span><strong>{{ KNOWLEDGE_RULE_VERSION }}</strong><em>{{ loading ? '更新中' : formatClock(snapshot.updatedAt) }}</em></div>
        </div>

        <div class="radar-workspace">
          <aside class="pattern-sidebar">
            <div class="lab-section-heading"><div><Radar :size="14" /><strong>模式雷达</strong></div><button type="button" title="刷新真实行情" @click="loadDataset(true)"><RefreshCw :size="13" :class="{ spin: loading }" /></button></div>
            <div class="pattern-list">
              <button v-for="pattern in KNOWLEDGE_PATTERNS" :key="pattern.id" type="button" :class="[`tone-${pattern.tone}`, { active: selectedPatternId === pattern.id }]" @click="selectPattern(pattern.id)">
                <span class="pattern-glyph">{{ pattern.shortLabel }}</span>
                <span><strong>{{ pattern.label }}</strong><em>{{ patternCurrentCount(pattern.id) }} 今日 · {{ patternHistoryCount(pattern.id) }} 样本</em></span>
                <ChevronRight :size="13" />
              </button>
            </div>
            <div class="rule-lab">
              <div class="rule-lab-title"><SlidersHorizontal :size="13" /><strong>规则实验室</strong><button type="button" @click="resetRules">重置</button></div>
              <label v-for="control in activeRuleControls" :key="control.key">
                <span>{{ control.label }}</span>
                <input v-model.number="rules[control.key]" type="number" :step="control.step" :min="control.min" :max="control.max" />
                <em>{{ control.suffix }}</em>
              </label>
              <p>调整后使用已下载 K 线本地重算，不会重复请求行情。</p>
            </div>
          </aside>

          <section class="pattern-cases">
            <div class="case-toolbar">
              <div><strong>{{ activePattern.label }}</strong><span>{{ activePattern.description }}</span></div>
              <div class="mini-tabs case-kind-tabs">
                <button v-for="item in caseKinds" :key="item.key" type="button" :class="{ active: caseKind === item.key }" @click="caseKind = item.key">{{ item.label }}<span>{{ caseKindCount(item.key) }}</span></button>
              </div>
            </div>
            <div class="case-table-head"><span>股票 / 日期</span><span>匹配</span><span>5日结果</span><span>证据</span></div>
            <div v-if="!displayEvents.length" class="lab-state compact"><ScanSearch :size="21" /><strong>{{ emptyCaseLabel }}</strong></div>
            <div v-else class="pattern-case-list">
              <button v-for="event in displayEvents" :key="event.id" type="button" :class="{ active: selectedEvent?.id === event.id }" @click="selectedEventId = event.id">
                <span class="event-stock"><strong>{{ event.name }}</strong><em>{{ event.code }} · {{ event.date }}</em></span>
                <span class="event-match" :class="event.matched ? 'matched' : 'near'">{{ event.matched ? event.score : '近似' }}</span>
                <strong :class="outcomeClass(event.outcome.day5)">{{ formatOutcome(event.outcome.day5) }}</strong>
                <span class="event-evidence-mini">{{ event.evidence.filter((item) => item.passed).length }}/{{ event.evidence.length }}</span>
              </button>
            </div>
          </section>

          <aside class="event-detail">
            <template v-if="selectedEvent && selectedStock">
              <div class="event-detail-heading">
                <div><strong>{{ selectedEvent.name }}</strong><span>{{ selectedEvent.code }} · {{ selectedEvent.date }}</span></div>
                <button type="button" :class="{ active: isFavorite(selectedEvent.id) }" :title="isFavorite(selectedEvent.id) ? '取消收藏' : '收藏案例'" @click="toggleFavorite(selectedEvent.id)"><Bookmark :size="14" /></button>
              </div>
              <div class="event-chart">
                <KLineChart :key="selectedEvent.id" :candles="selectedEventCandles" mode="kline" :show-ma="true" :show-volume="true" :markers="selectedEvent.markers" :guides="selectedEvent.guides" />
              </div>
              <div class="event-verdict">
                <span :class="selectedEvent.matched ? 'matched' : 'near'">{{ selectedEvent.matched ? '规则命中' : '反例 / 条件不足' }}</span>
                <strong>{{ selectedEvent.summary }}</strong>
              </div>
              <div class="evidence-list">
                <div v-for="item in selectedEvent.evidence" :key="item.label">
                  <component :is="item.passed ? CircleCheck : CircleX" :size="13" />
                  <span>{{ item.label }}</span><strong>{{ item.value }}</strong>
                </div>
              </div>
              <div class="outcome-grid">
                <div><span>次日</span><strong :class="outcomeClass(selectedEvent.outcome.day1)">{{ formatOutcome(selectedEvent.outcome.day1) }}</strong></div>
                <div><span>3日</span><strong :class="outcomeClass(selectedEvent.outcome.day3)">{{ formatOutcome(selectedEvent.outcome.day3) }}</strong></div>
                <div><span>5日</span><strong :class="outcomeClass(selectedEvent.outcome.day5)">{{ formatOutcome(selectedEvent.outcome.day5) }}</strong></div>
                <div><span>10日</span><strong :class="outcomeClass(selectedEvent.outcome.day10)">{{ formatOutcome(selectedEvent.outcome.day10) }}</strong></div>
                <div><span>5日最大有利</span><strong class="up">{{ formatOutcome(selectedEvent.outcome.maxFavorable5) }}</strong></div>
                <div><span>5日最大不利</span><strong class="down">{{ formatOutcome(selectedEvent.outcome.maxAdverse5) }}</strong></div>
              </div>
              <div class="falsification"><TriangleAlert :size="13" /><span><strong>失效观察</strong>{{ activePattern.falsification }}</span></div>
            </template>
            <div v-else class="lab-state compact"><ChartCandlestick :size="21" /><strong>选择案例查看证据</strong></div>
          </aside>
        </div>
      </div>

      <div v-else-if="mode === 'training'" class="training-view">
        <div class="training-toolbar">
          <div><GraduationCap :size="16" /><strong>遮挡回放训练</strong><span>只显示信号当日及以前的数据，先判断再揭晓。</span></div>
          <div class="training-stats"><span>已答 {{ attempts.length }}</span><strong>{{ trainingAccuracy }}%</strong></div>
        </div>
        <div v-if="trainingEvent && trainingStock" class="training-workspace">
          <section class="training-chart-panel">
            <div class="training-stock-bar">
              <div><strong>{{ trainingEvent.name }}</strong><span>{{ trainingEvent.code }} · 截止 {{ trainingEvent.date }}</span></div>
              <div class="training-question">这是否属于标准的“{{ patternDefinition(trainingEvent.patternId).label }}”？</div>
            </div>
            <KLineChart
              :key="`${trainingEvent.id}-${replayDays}-${trainingRevealed}`"
              :candles="trainingCandles"
              mode="kline"
              :show-ma="true"
              :show-volume="true"
              :markers="trainingRevealed ? trainingEvent.markers : []"
              :guides="trainingRevealed ? trainingEvent.guides : []"
            />
          </section>
          <aside class="training-panel">
            <template v-if="!trainingRevealed">
              <span class="training-eyebrow">先观察价格位置、量能和收盘结构</span>
              <h2>{{ patternDefinition(trainingEvent.patternId).label }}</h2>
              <p>{{ patternDefinition(trainingEvent.patternId).description }}</p>
              <div class="answer-buttons">
                <button type="button" @click="answerTraining(true)"><CircleCheck :size="16" />符合标准</button>
                <button type="button" @click="answerTraining(false)"><CircleX :size="16" />条件不足</button>
              </div>
            </template>
            <template v-else>
              <div class="answer-result" :class="trainingAnswer === trainingEvent.matched ? 'correct' : 'wrong'">
                <component :is="trainingAnswer === trainingEvent.matched ? CircleCheck : CircleX" :size="18" />
                <div><strong>{{ trainingAnswer === trainingEvent.matched ? '判断正确' : '判断错误' }}</strong><span>规则结论：{{ trainingEvent.matched ? '符合' : '条件不足' }}</span></div>
              </div>
              <div class="training-evidence">
                <div v-for="item in trainingEvent.evidence" :key="item.label" :class="{ passed: item.passed }"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div>
              </div>
              <div class="replay-control">
                <span>揭晓后续走势</span>
                <div class="mini-tabs"><button v-for="day in replayOptions" :key="day" type="button" :class="{ active: replayDays === day }" @click="replayDays = day">{{ day === 0 ? '信号日' : `+${day}日` }}</button></div>
              </div>
              <div class="training-outcome"><span>5日结果</span><strong :class="outcomeClass(trainingEvent.outcome.day5)">{{ formatOutcome(trainingEvent.outcome.day5) }}</strong><em>结果不决定当时判断是否合规</em></div>
              <button class="next-training" type="button" @click="nextTraining">下一题<ArrowRight :size="14" /></button>
            </template>
          </aside>
        </div>
        <div v-else class="lab-state"><GraduationCap :size="24" /><strong>历史训练样本不足</strong></div>
      </div>

      <div v-else class="notebook-view">
        <div class="notebook-pulse">
          <div><span>训练次数</span><strong>{{ attempts.length }}</strong></div>
          <div><span>判断正确率</span><strong>{{ trainingAccuracy }}%</strong></div>
          <div><span>待复习错误</span><strong class="down">{{ wrongAttempts.length }}</strong></div>
          <div><span>收藏案例</span><strong class="watch">{{ favoriteEvents.length }}</strong></div>
          <div><span>最易混淆</span><strong>{{ weakestPatternLabel }}</strong></div>
        </div>
        <div class="notebook-workspace">
          <section class="mistake-log">
            <div class="lab-section-heading"><div><BookOpenCheck :size="14" /><strong>错题记录</strong></div><button v-if="attempts.length" type="button" @click="clearAttempts">清空</button></div>
            <div class="notebook-row head"><span>时间</span><span>股票 / 模式</span><span>我的判断</span><span>规则结论</span><span>结果</span></div>
            <div v-if="!attempts.length" class="lab-state compact"><BookOpenCheck :size="21" /><strong>完成回放训练后自动记录</strong></div>
            <div v-for="attempt in attempts" :key="attempt.id" class="notebook-row">
              <span>{{ formatShortDate(attempt.createdAt) }}</span>
              <span class="attempt-stock"><strong>{{ attempt.name }}</strong><em>{{ patternDefinition(attempt.patternId).label }} · {{ attempt.date }}</em></span>
              <span>{{ attempt.answer ? '符合' : '不足' }}</span>
              <span>{{ attempt.expected ? '符合' : '不足' }}</span>
              <strong :class="attempt.correct ? 'up' : 'down'">{{ attempt.correct ? '正确' : '错误' }}</strong>
            </div>
          </section>
          <aside class="favorite-log">
            <div class="lab-section-heading"><div><Bookmark :size="14" /><strong>收藏案例</strong></div><span>{{ favoriteEvents.length }}</span></div>
            <div v-if="!favoriteEvents.length" class="lab-state compact"><Bookmark :size="21" /><strong>在雷达案例中点击收藏</strong></div>
            <div class="favorite-list">
              <button v-for="event in favoriteEvents" :key="event.id" type="button" @click="openFavorite(event)">
                <span><strong>{{ event.name }}</strong><em>{{ patternDefinition(event.patternId).label }} · {{ event.date }}</em></span>
                <strong :class="outcomeClass(event.outcome.day5)">{{ formatOutcome(event.outcome.day5) }}</strong>
                <ChevronRight :size="13" />
              </button>
            </div>
          </aside>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ArrowRight, Bookmark, BookOpenCheck, ChartCandlestick, ChevronRight, CircleCheck, CircleX, DatabaseZap, GraduationCap, Radar, RefreshCw, ScanSearch, SlidersHorizontal, TriangleAlert } from '@lucide/vue';
import KLineChart from '@/components/KLineChart.vue';
import {
  analyzeKnowledgePatterns,
  DEFAULT_KNOWLEDGE_RULES,
  fetchKnowledgeMarketDataset,
  KNOWLEDGE_PATTERNS,
  KNOWLEDGE_RULE_VERSION,
  patternDefinition
} from '@/services/knowledgePatternEngine';
import type { KnowledgeMarketDataset, KnowledgePatternEvent, KnowledgePatternId, KnowledgePatternSnapshot, KnowledgeRuleConfig, KnowledgeTrainingAttempt } from '@/types/knowledge';

type LabMode = 'radar' | 'training' | 'notebook';
type CaseKind = 'today' | 'positive' | 'negative' | 'near';
type RuleKey = keyof KnowledgeRuleConfig;

const props = defineProps<{ mode: LabMode }>();
const emit = defineEmits<{ modeChange: [mode: LabMode] }>();
const RULES_STORAGE_KEY = 'biga.knowledge.rules.v1';
const ATTEMPTS_STORAGE_KEY = 'biga.knowledge.attempts.v1';
const FAVORITES_STORAGE_KEY = 'biga.knowledge.favorites.v1';

const dataset = ref<KnowledgeMarketDataset | null>(null);
const snapshot = ref<KnowledgePatternSnapshot | null>(null);
const loading = ref(false);
const error = ref('');
const rules = ref<KnowledgeRuleConfig>(loadStorage(RULES_STORAGE_KEY, DEFAULT_KNOWLEDGE_RULES));
const selectedPatternId = ref<KnowledgePatternId>('volumePriceRise');
const caseKind = ref<CaseKind>('today');
const selectedEventId = ref('');
const attempts = ref<KnowledgeTrainingAttempt[]>(loadStorage(ATTEMPTS_STORAGE_KEY, []));
const favoriteIds = ref<string[]>(loadStorage(FAVORITES_STORAGE_KEY, []));
const trainingEventId = ref('');
const trainingAnswer = ref<boolean | null>(null);
const trainingRevealed = ref(false);
const replayDays = ref(0);

const caseKinds: Array<{ key: CaseKind; label: string }> = [
  { key: 'today', label: '今日' }, { key: 'positive', label: '正向样本' }, { key: 'negative', label: '失败样本' }, { key: 'near', label: '反例' }
];
const replayOptions = [0, 1, 3, 5, 10];
const activePattern = computed(() => patternDefinition(selectedPatternId.value));
const patternEvents = computed(() => snapshot.value?.events.filter((event) => event.patternId === selectedPatternId.value) ?? []);
const displayEvents = computed(() => {
  if (caseKind.value === 'today') return patternEvents.value.filter((event) => event.current && event.matched);
  if (caseKind.value === 'positive') return patternEvents.value.filter((event) => event.matched && eventOutcomeSucceeded(event));
  if (caseKind.value === 'negative') return patternEvents.value.filter((event) => event.matched && event.outcome.day5 !== null && !eventOutcomeSucceeded(event));
  return patternEvents.value.filter((event) => !event.matched);
});
const selectedEvent = computed(() => snapshot.value?.events.find((event) => event.id === selectedEventId.value) ?? displayEvents.value[0] ?? null);
const selectedStock = computed(() => selectedEvent.value ? snapshot.value?.stocks.find((stock) => stock.code === selectedEvent.value?.code) ?? null : null);
const selectedEventCandles = computed(() => eventCandles(selectedEvent.value, selectedStock.value?.candles ?? [], 10));
const matchedHistoricalCount = computed(() => snapshot.value?.events.filter((event) => event.matched && !event.current && event.outcome.day5 !== null).length ?? 0);
const emptyCaseLabel = computed(() => caseKind.value === 'today' ? '今日暂未命中该模式' : '当前样本中暂无此类案例');
const activeRuleControls = computed(() => ruleControls(selectedPatternId.value));
const quizPool = computed(() => snapshot.value?.events.filter((event) => !event.current && event.outcome.day5 !== null) ?? []);
const trainingEvent = computed(() => quizPool.value.find((event) => event.id === trainingEventId.value) ?? quizPool.value[0] ?? null);
const trainingStock = computed(() => trainingEvent.value ? snapshot.value?.stocks.find((stock) => stock.code === trainingEvent.value?.code) ?? null : null);
const trainingCandles = computed(() => eventCandles(trainingEvent.value, trainingStock.value?.candles ?? [], trainingRevealed.value ? replayDays.value : 0));
const trainingAccuracy = computed(() => attempts.value.length ? Math.round((attempts.value.filter((attempt) => attempt.correct).length / attempts.value.length) * 100) : 0);
const wrongAttempts = computed(() => attempts.value.filter((attempt) => !attempt.correct));
const favoriteEvents = computed(() => favoriteIds.value.map((id) => snapshot.value?.events.find((event) => event.id === id)).filter((event): event is KnowledgePatternEvent => Boolean(event)));
const weakestPatternLabel = computed(() => {
  const errors = new Map<KnowledgePatternId, number>();
  wrongAttempts.value.forEach((attempt) => errors.set(attempt.patternId, (errors.get(attempt.patternId) ?? 0) + 1));
  const weakest = [...errors.entries()].sort((a, b) => b[1] - a[1])[0];
  return weakest ? patternDefinition(weakest[0]).label : '--';
});

onMounted(() => void loadDataset());
watch(rules, () => {
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules.value));
  if (dataset.value) snapshot.value = analyzeKnowledgePatterns(dataset.value, rules.value);
}, { deep: true });
watch(displayEvents, (events) => {
  if (events.length && !events.some((event) => event.id === selectedEventId.value)) selectedEventId.value = events[0].id;
}, { immediate: true });
watch(quizPool, (events) => {
  if (events.length && !events.some((event) => event.id === trainingEventId.value)) trainingEventId.value = events[0].id;
}, { immediate: true });

async function loadDataset(force = false) {
  loading.value = true;
  error.value = '';
  try {
    dataset.value = await fetchKnowledgeMarketDataset(force);
    snapshot.value = analyzeKnowledgePatterns(dataset.value, rules.value);
  } catch {
    error.value = '知识雷达数据暂不可用';
  } finally {
    loading.value = false;
  }
}

function selectPattern(id: KnowledgePatternId) {
  selectedPatternId.value = id;
  caseKind.value = 'today';
}

function patternCurrentCount(id: KnowledgePatternId) {
  return snapshot.value?.currentEvents.filter((event) => event.patternId === id).length ?? 0;
}

function patternHistoryCount(id: KnowledgePatternId) {
  return snapshot.value?.events.filter((event) => event.patternId === id && !event.current && event.matched).length ?? 0;
}

function caseKindCount(kind: CaseKind) {
  if (kind === 'today') return patternEvents.value.filter((event) => event.current && event.matched).length;
  if (kind === 'positive') return patternEvents.value.filter((event) => event.matched && eventOutcomeSucceeded(event)).length;
  if (kind === 'negative') return patternEvents.value.filter((event) => event.matched && event.outcome.day5 !== null && !eventOutcomeSucceeded(event)).length;
  return patternEvents.value.filter((event) => !event.matched).length;
}

function eventCandles(event: KnowledgePatternEvent | null, candles: import('@/types/market').Candle[], futureDays: number) {
  if (!event || !candles.length) return [];
  const from = Math.max(0, event.candleIndex - 55);
  const to = Math.min(candles.length, event.candleIndex + futureDays + 1);
  return candles.slice(from, to);
}

function answerTraining(answer: boolean) {
  if (!trainingEvent.value || trainingRevealed.value) return;
  trainingAnswer.value = answer;
  trainingRevealed.value = true;
  replayDays.value = 0;
  const attempt: KnowledgeTrainingAttempt = {
    id: `${trainingEvent.value.id}:${Date.now()}`,
    eventId: trainingEvent.value.id,
    patternId: trainingEvent.value.patternId,
    code: trainingEvent.value.code,
    name: trainingEvent.value.name,
    date: trainingEvent.value.date,
    answer,
    expected: trainingEvent.value.matched,
    correct: answer === trainingEvent.value.matched,
    createdAt: Date.now()
  };
  attempts.value = [attempt, ...attempts.value].slice(0, 300);
  localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts.value));
}

function nextTraining() {
  const pool = quizPool.value;
  if (!pool.length) return;
  const currentIndex = pool.findIndex((event) => event.id === trainingEvent.value?.id);
  trainingEventId.value = pool[(currentIndex + 1) % pool.length].id;
  trainingAnswer.value = null;
  trainingRevealed.value = false;
  replayDays.value = 0;
}

function toggleFavorite(eventId: string) {
  favoriteIds.value = favoriteIds.value.includes(eventId) ? favoriteIds.value.filter((id) => id !== eventId) : [eventId, ...favoriteIds.value];
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds.value));
}

function isFavorite(eventId: string) {
  return favoriteIds.value.includes(eventId);
}

function openFavorite(event: KnowledgePatternEvent) {
  selectedPatternId.value = event.patternId;
  caseKind.value = event.current ? 'today' : event.matched && eventOutcomeSucceeded(event) ? 'positive' : event.matched ? 'negative' : 'near';
  selectedEventId.value = event.id;
  emit('modeChange', 'radar');
}

function clearAttempts() {
  attempts.value = [];
  localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
}

function eventOutcomeSucceeded(event: KnowledgePatternEvent) {
  if (event.outcome.day5 === null) return false;
  const riskPattern = event.patternId === 'highVolumeStall' || event.patternId === 'trendBreak';
  return riskPattern ? event.outcome.day5 < 0 : event.outcome.day5 > 0;
}

function resetRules() {
  rules.value = { ...DEFAULT_KNOWLEDGE_RULES };
}

function ruleControls(patternId: KnowledgePatternId): Array<{ key: RuleKey; label: string; step: number; min: number; max: number; suffix: string }> {
  if (patternId === 'volumePriceRise') return [{ key: 'minRisePct', label: '最低涨幅', step: .1, min: 0, max: 10, suffix: '%' }, { key: 'volumeRiseRatio', label: '放量阈值', step: .05, min: 1, max: 4, suffix: 'x' }];
  if (patternId === 'volumeBreakout') return [{ key: 'breakoutDays', label: '前高周期', step: 1, min: 5, max: 60, suffix: '日' }, { key: 'breakoutVolumeRatio', label: '突破量能', step: .05, min: .8, max: 4, suffix: 'x' }];
  if (patternId === 'lowVolumePullback') return [{ key: 'pullbackVolumeRatio', label: '缩量上限', step: .05, min: .3, max: 1.2, suffix: 'x' }, { key: 'trendDays', label: '趋势周期', step: 1, min: 5, max: 60, suffix: '日' }];
  if (patternId === 'highVolumeStall') return [{ key: 'stallVolumeRatio', label: '异常量能', step: .1, min: 1, max: 5, suffix: 'x' }, { key: 'trendDays', label: '高位参考', step: 1, min: 5, max: 60, suffix: '日' }];
  if (patternId === 'trendBreak') return [{ key: 'trendDays', label: '趋势周期', step: 1, min: 5, max: 60, suffix: '日' }];
  return [{ key: 'sectorRisePct', label: '板块涨幅', step: .1, min: 0, max: 8, suffix: '%' }, { key: 'sectorBreadthRatio', label: '上涨覆盖', step: .05, min: .3, max: 1, suffix: '' }];
}

function formatOutcome(value: number | null) {
  return value === null ? '--' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function outcomeClass(value: number | null) {
  if ((value ?? 0) > 0) return 'up';
  if ((value ?? 0) < 0) return 'down';
  return '';
}

function formatClock(value: number) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatShortDate(value: number) {
  const date = new Date(value);
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function loadStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}
</script>

<style scoped>
.knowledge-lab { min-width: 0; min-height: 0; }
.radar-view, .training-view, .notebook-view { width: 100%; height: 100%; min-width: 0; min-height: 0; display: grid; }
.radar-view { grid-template-rows: 66px minmax(0, 1fr); }
.lab-pulse-strip, .notebook-pulse { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border-bottom: 1px solid rgba(var(--border-rgb), .08); background: var(--bg-app); }
.lab-pulse-strip > div, .notebook-pulse > div { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-content: center; gap: 4px 7px; padding: 7px 11px; border-right: 1px solid rgba(var(--border-rgb), .06); }
.lab-pulse-strip > div:last-child, .notebook-pulse > div:last-child { border-right: 0; }
.lab-pulse-strip span, .lab-pulse-strip em, .notebook-pulse span { overflow: hidden; color: var(--text-subtle); font-size: 8px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
.lab-pulse-strip strong, .notebook-pulse strong { grid-column: 1 / -1; overflow: hidden; color: var(--text-primary); font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.lab-pulse-strip em { text-align: right; }
.radar-workspace { min-width: 0; min-height: 0; display: grid; grid-template-columns: 235px minmax(390px, 1fr) 330px; }
.pattern-sidebar, .pattern-cases, .event-detail { min-width: 0; min-height: 0; background: var(--bg-panel-alt); }
.pattern-sidebar { display: grid; grid-template-rows: 36px auto minmax(0, 1fr); border-right: 1px solid rgba(var(--border-rgb), .08); }
.lab-section-heading { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 9px; border-bottom: 1px solid rgba(var(--border-rgb), .07); background: var(--bg-panel-soft); }
.lab-section-heading > div { display: flex; align-items: center; gap: 6px; color: var(--accent); }
.lab-section-heading strong { color: var(--text-primary); font-size: 10px; }
.lab-section-heading button { height: 22px; display: grid; place-items: center; padding: 0 6px; border: 0; border-radius: 4px; background: transparent; color: var(--text-subtle); font-size: 8px; cursor: pointer; }
.lab-section-heading button:hover { background: var(--bg-muted); color: var(--accent-bright); }
.pattern-list { border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.pattern-list > button { width: 100%; height: 51px; display: grid; grid-template-columns: 34px minmax(0, 1fr) 14px; align-items: center; gap: 7px; padding: 0 9px; border: 0; border-bottom: 1px solid rgba(var(--border-rgb), .045); background: transparent; color: var(--text-subtle); text-align: left; cursor: pointer; }
.pattern-list > button:hover { background: var(--bg-control); }
.pattern-list > button.active { background: var(--accent-soft); box-shadow: inset 3px 0 var(--accent); }
.pattern-glyph { width: 32px; height: 27px; display: grid; place-items: center; border-radius: 4px; background: var(--bg-muted); color: var(--text-strong); font-size: 9px; font-weight: 800; }
.pattern-list button > span:nth-child(2) { min-width: 0; display: grid; gap: 4px; }
.pattern-list strong, .pattern-list em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pattern-list strong { color: var(--text-strong); font-size: 10px; }
.pattern-list em { color: var(--text-faint); font-size: 8px; font-style: normal; }
.pattern-list button.tone-red .pattern-glyph { color: #e36a6a; }.pattern-list button.tone-gold .pattern-glyph { color: var(--accent-bright); }.pattern-list button.tone-green .pattern-glyph { color: #42b77e; }.pattern-list button.tone-orange .pattern-glyph { color: #d88a5f; }.pattern-list button.tone-violet .pattern-glyph { color: #a795d0; }.pattern-list button.tone-cyan .pattern-glyph { color: #41c6c3; }
.rule-lab { min-height: 0; align-content: start; display: grid; gap: 9px; overflow-y: auto; padding: 11px 9px; }
.rule-lab-title { display: flex; align-items: center; gap: 6px; color: var(--accent); }
.rule-lab-title strong { flex: 1; color: var(--text-primary); font-size: 9px; }
.rule-lab-title button { border: 0; background: transparent; color: var(--text-subtle); font-size: 8px; cursor: pointer; }
.rule-lab label { display: grid; grid-template-columns: minmax(0, 1fr) 58px 19px; align-items: center; gap: 5px; }
.rule-lab label span, .rule-lab label em { color: var(--text-muted); font-size: 8px; font-style: normal; }
.rule-lab input { width: 58px; height: 24px; border: 1px solid rgba(var(--border-rgb), .09); border-radius: 4px; outline: 0; background: var(--bg-elevated); color: var(--accent-bright); padding: 0 5px; font-size: 9px; text-align: right; }
.rule-lab p { margin: 3px 0 0; color: var(--text-faint); font-size: 8px; line-height: 1.55; }
.pattern-cases { display: grid; grid-template-rows: 48px 27px minmax(0, 1fr); border-right: 1px solid rgba(var(--border-rgb), .08); }
.case-toolbar { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 9px; padding: 0 8px 0 11px; border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.case-toolbar > div:first-child { min-width: 0; display: grid; gap: 3px; }
.case-toolbar strong, .case-toolbar span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.case-toolbar strong { color: var(--text-primary); font-size: 11px; }
.case-toolbar > div:first-child span { color: var(--text-subtle); font-size: 8px; }
.case-kind-tabs { flex: 0 0 auto; }
.case-kind-tabs button { padding: 0 5px; font-size: 8px; }
.case-kind-tabs button span { margin-left: 3px; color: var(--text-muted); font-size: 7px; }
.case-table-head, .pattern-case-list > button { display: grid; grid-template-columns: minmax(120px, 1fr) 48px 60px 37px; align-items: center; gap: 6px; padding: 0 8px; text-align: right; }
.case-table-head { color: var(--text-faint); font-size: 8px; background: var(--bg-elevated); }
.case-table-head span:first-child { text-align: left; }
.pattern-case-list { min-height: 0; overflow-y: auto; }
.pattern-case-list > button { width: 100%; min-height: 45px; border: 0; border-bottom: 1px solid rgba(var(--border-rgb), .05); background: transparent; color: var(--text-secondary); cursor: pointer; }
.pattern-case-list > button:hover { background: var(--bg-control); }
.pattern-case-list > button.active { background: var(--accent-soft); box-shadow: inset 3px 0 var(--accent); }
.event-stock { min-width: 0; display: grid; gap: 3px; text-align: left; }
.event-stock strong, .event-stock em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.event-stock strong { color: var(--text-primary); font-size: 10px; }.event-stock em { color: var(--text-faint); font-size: 8px; font-style: normal; }
.event-match { justify-self: end; min-width: 35px; height: 20px; display: grid; place-items: center; border-radius: 3px; font-size: 8px; font-weight: 800; }
.event-match.matched { background: rgba(var(--market-up-rgb), .12); color: #e36a6a; }.event-match.near { background: rgba(var(--accent-rgb), .12); color: var(--accent-bright); }
.pattern-case-list > button > strong, .event-evidence-mini { font-size: 9px; }
.event-detail { overflow-y: auto; }
.event-detail-heading { height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 9px 0 11px; border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.event-detail-heading > div { min-width: 0; display: grid; gap: 3px; }.event-detail-heading strong { color: var(--text-primary); font-size: 11px; }.event-detail-heading span { color: var(--text-subtle); font-size: 8px; }
.event-detail-heading button { width: 26px; height: 26px; display: grid; place-items: center; border: 0; border-radius: 4px; background: var(--bg-elevated); color: var(--text-subtle); cursor: pointer; }.event-detail-heading button.active { color: var(--accent-bright); }
.event-chart { height: 245px; border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.event-verdict { display: grid; gap: 6px; padding: 10px; border-bottom: 1px solid rgba(var(--border-rgb), .06); }
.event-verdict span { width: fit-content; padding: 2px 5px; border-radius: 3px; font-size: 8px; }.event-verdict span.matched { background: rgba(var(--market-up-rgb), .12); color: #e36a6a; }.event-verdict span.near { background: rgba(var(--accent-rgb), .12); color: var(--accent-bright); }
.event-verdict strong { color: var(--text-strong); font-size: 9px; line-height: 1.5; }
.evidence-list { border-bottom: 1px solid rgba(var(--border-rgb), .06); }
.evidence-list > div { height: 29px; display: grid; grid-template-columns: 15px minmax(0, 1fr) auto; align-items: center; gap: 5px; padding: 0 10px; border-bottom: 1px solid rgba(var(--border-rgb), .04); color: var(--text-subtle); font-size: 8px; }.evidence-list svg:first-child { color: var(--market-down); }.evidence-list div:has(svg.lucide-circle-x) svg { color: #d26b61; }.evidence-list strong { color: var(--text-secondary); }
.outcome-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-bottom: 1px solid rgba(var(--border-rgb), .06); }
.outcome-grid > div { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-right: 1px solid rgba(var(--border-rgb), .05); border-bottom: 1px solid rgba(var(--border-rgb), .05); }.outcome-grid > div:nth-child(2n) { border-right: 0; }.outcome-grid span { color: var(--text-faint); font-size: 8px; }.outcome-grid strong { font-size: 9px; }
.falsification { display: flex; align-items: flex-start; gap: 7px; margin: 9px; padding: 8px; border-left: 2px solid #d26b61; background: var(--bg-header); color: var(--text-subtle); }.falsification svg { flex: 0 0 auto; color: #d26b61; }.falsification span { font-size: 8px; line-height: 1.5; }.falsification strong { display: block; margin-bottom: 3px; color: #d6a09c; }
.training-view { grid-template-rows: 45px minmax(0, 1fr); }
.training-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px; border-bottom: 1px solid rgba(var(--border-rgb), .08); background: var(--bg-app); }
.training-toolbar > div:first-child { min-width: 0; display: flex; align-items: center; gap: 7px; color: var(--accent); }.training-toolbar strong { color: var(--text-primary); font-size: 11px; }.training-toolbar span { color: var(--text-subtle); font-size: 9px; }
.training-stats { display: flex; align-items: center; gap: 8px; }.training-stats strong { color: var(--accent-bright); font-size: 13px; }
.training-workspace { min-width: 0; min-height: 0; display: grid; grid-template-columns: minmax(520px, 1fr) 330px; }
.training-chart-panel { min-width: 0; min-height: 0; display: grid; grid-template-rows: 50px minmax(0, 1fr); border-right: 1px solid rgba(var(--border-rgb), .08); }
.training-stock-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px; border-bottom: 1px solid rgba(var(--border-rgb), .07); }.training-stock-bar > div:first-child { display: grid; gap: 3px; }.training-stock-bar strong { color: var(--text-primary); font-size: 12px; }.training-stock-bar span { color: var(--text-subtle); font-size: 8px; }.training-question { color: var(--accent-bright); font-size: 10px; font-weight: 700; }
.training-panel { min-width: 0; min-height: 0; overflow-y: auto; padding: 22px 18px; background: var(--bg-panel-alt); }
.training-eyebrow { color: var(--accent); font-size: 9px; }.training-panel h2 { margin: 10px 0 8px; color: var(--text-primary); font-size: 20px; }.training-panel > p { margin: 0; color: var(--text-secondary); font-size: 10px; line-height: 1.7; }
.answer-buttons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 25px; }.answer-buttons button { height: 38px; display: flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid rgba(var(--border-rgb), .1); border-radius: 5px; background: var(--bg-header); color: var(--text-strong); font-size: 10px; cursor: pointer; }.answer-buttons button:first-child:hover { border-color: rgba(var(--market-up-rgb), .4); color: #e36a6a; }.answer-buttons button:last-child:hover { border-color: rgba(var(--accent-rgb), .4); color: var(--accent-bright); }
.answer-result { display: flex; align-items: center; gap: 9px; padding: 11px; border-left: 3px solid; background: var(--bg-header); }.answer-result.correct { border-color: var(--market-down); color: #42b77e; }.answer-result.wrong { border-color: #d26b61; color: #e36a6a; }.answer-result > div { display: grid; gap: 3px; }.answer-result strong { color: inherit; font-size: 11px; }.answer-result span { color: var(--text-muted); font-size: 8px; }
.training-evidence { margin-top: 14px; border-top: 1px solid rgba(var(--border-rgb), .07); }.training-evidence > div { height: 32px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(var(--border-rgb), .05); color: var(--text-muted); font-size: 9px; }.training-evidence div.passed strong { color: #42b77e; }.training-evidence div:not(.passed) strong { color: #e36a6a; }
.replay-control { margin-top: 15px; }.replay-control > span { display: block; margin-bottom: 7px; color: var(--text-subtle); font-size: 8px; }.replay-control .mini-tabs { width: 100%; justify-content: space-between; }.replay-control button { flex: 1; padding: 0 3px; font-size: 8px; }
.training-outcome { display: grid; grid-template-columns: 1fr auto; gap: 5px 8px; margin-top: 14px; padding: 10px; background: var(--bg-header); }.training-outcome span, .training-outcome em { color: var(--text-subtle); font-size: 8px; font-style: normal; }.training-outcome strong { font-size: 11px; }.training-outcome em { grid-column: 1 / -1; }
.next-training { width: 100%; height: 32px; display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 16px; border: 1px solid rgba(var(--accent-rgb), .3); border-radius: 5px; background: var(--accent-soft); color: var(--accent-bright); font-size: 10px; cursor: pointer; }
.notebook-view { grid-template-rows: 66px minmax(0, 1fr); }.notebook-pulse strong { font-size: 17px; }
.notebook-workspace { min-width: 0; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 330px; }.mistake-log { min-width: 0; min-height: 0; overflow-y: auto; border-right: 1px solid rgba(var(--border-rgb), .08); }.mistake-log > .lab-section-heading, .favorite-log > .lab-section-heading { height: 38px; position: sticky; z-index: 2; top: 0; }
.notebook-row { min-height: 42px; display: grid; grid-template-columns: 92px minmax(150px, 1fr) 70px 70px 55px; align-items: center; gap: 7px; padding: 0 10px; border-bottom: 1px solid rgba(var(--border-rgb), .05); color: var(--text-secondary); font-size: 9px; }.notebook-row.head { min-height: 27px; position: sticky; z-index: 2; top: 38px; background: var(--bg-elevated); color: var(--text-faint); }.attempt-stock { min-width: 0; display: grid; gap: 3px; }.attempt-stock strong, .attempt-stock em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.attempt-stock strong { color: var(--text-primary); font-size: 10px; }.attempt-stock em { color: var(--text-faint); font-size: 8px; font-style: normal; }
.favorite-log { min-width: 0; min-height: 0; overflow-y: auto; background: var(--bg-panel-alt); }.favorite-list > button { width: 100%; min-height: 46px; display: grid; grid-template-columns: minmax(0, 1fr) 58px 14px; align-items: center; gap: 6px; padding: 0 9px; border: 0; border-bottom: 1px solid rgba(var(--border-rgb), .05); background: transparent; color: var(--text-subtle); text-align: left; cursor: pointer; }.favorite-list > button:hover { background: var(--bg-control); }.favorite-list button > span { min-width: 0; display: grid; gap: 3px; }.favorite-list strong, .favorite-list em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.favorite-list span strong { color: var(--text-primary); font-size: 10px; }.favorite-list em { color: var(--text-faint); font-size: 8px; font-style: normal; }.favorite-list > button > strong { text-align: right; font-size: 9px; }
.lab-state { width: 100%; height: 100%; min-height: 0; display: grid; place-items: center; align-content: center; gap: 9px; color: var(--text-subtle); }.lab-state strong { color: var(--text-secondary); font-size: 11px; }.lab-state span { font-size: 9px; }.lab-state button { height: 26px; padding: 0 9px; border: 1px solid rgba(var(--accent-rgb), .3); border-radius: 4px; background: transparent; color: var(--accent-bright); cursor: pointer; }.lab-state.compact { min-height: 130px; }
.up { color: var(--market-up) !important; }.down { color: var(--market-down) !important; }.watch { color: var(--accent-bright) !important; }
@media (max-width: 1260px) { .radar-workspace { grid-template-columns: 215px minmax(350px, 1fr) 300px; }.event-chart { height: 220px; }.training-workspace { grid-template-columns: minmax(470px, 1fr) 300px; }.notebook-workspace { grid-template-columns: minmax(0, 1fr) 300px; } }
</style>
