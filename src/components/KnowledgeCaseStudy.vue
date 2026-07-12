<template>
  <div class="case-study">
    <header class="case-study-header">
      <button class="case-back" type="button" title="返回术语解析" @click="emit('back')"><ArrowLeft :size="15" /></button>
      <div>
        <strong>{{ term.title }} · 实例解析</strong>
        <span>{{ knowledgeCaseRuleLabel(term.id) }} · 真实行情规则筛选</span>
      </div>
      <button class="case-refresh" type="button" title="重新筛选案例" :disabled="candidateLoading" @click="loadCandidates">
        <RefreshCw :size="14" :class="{ spin: candidateLoading }" />
      </button>
    </header>

    <div class="case-study-workspace">
      <aside class="case-candidates">
        <div class="case-panel-heading">
          <div><ScanSearch :size="14" /><strong>候选股票</strong></div>
          <span>{{ candidates.length }}</span>
        </div>
        <div v-if="candidateLoading && !candidates.length" class="case-state"><RefreshCw :size="20" class="spin" /><span>扫描活跃 A 股</span></div>
        <div v-else-if="candidateError" class="case-state"><TriangleAlert :size="20" /><span>{{ candidateError }}</span><button type="button" @click="loadCandidates">重试</button></div>
        <div v-else class="candidate-list">
          <button
            v-for="row in candidates"
            :key="row.code"
            type="button"
            :class="{ active: selectedCandidate?.code === row.code }"
            @click="selectCandidate(row)"
          >
            <span class="candidate-score">{{ row.matchScore }}</span>
            <span class="candidate-name"><strong>{{ row.name }}</strong><em>{{ row.code }}</em></span>
            <strong :class="priceClass(row.changePct)">{{ formatPct(row.changePct) }}</strong>
            <span class="candidate-reasons">{{ row.matchReasons.join(' · ') }}</span>
          </button>
        </div>
        <div class="candidate-note">候选分数只表示与教学规则的接近程度。</div>
      </aside>

      <section class="case-chart-panel">
        <div v-if="selectedCandidate" class="case-stock-bar">
          <div>
            <strong>{{ selectedCandidate.name }}</strong>
            <span>{{ selectedCandidate.code }} · 日 K · {{ analysis?.signalDate || '分析中' }}</span>
          </div>
          <div class="case-quote">
            <strong :class="priceClass(selectedCandidate.changePct)">{{ selectedCandidate.price.toFixed(2) }}</strong>
            <span :class="priceClass(selectedCandidate.changePct)">{{ formatPct(selectedCandidate.changePct) }}</span>
          </div>
        </div>
        <div v-if="analysisLoading" class="case-state chart-state"><RefreshCw :size="23" class="spin" /><strong>拉取日 K 并计算标注</strong></div>
        <div v-else-if="analysisError" class="case-state chart-state"><TriangleAlert :size="23" /><strong>{{ analysisError }}</strong></div>
        <KLineChart
          v-else-if="analysis"
          :key="`${term.id}-${selectedCandidate?.code}`"
          :candles="analysis.candles"
          mode="kline"
          :show-ma="true"
          :show-volume="true"
          :markers="analysis.markers"
          :guides="analysis.guides"
        />
        <div v-else class="case-state chart-state"><ChartCandlestick :size="23" /><strong>选择股票查看教学标注</strong></div>
      </section>

      <aside class="case-analysis">
        <div class="case-analysis-heading">
          <div>
            <span>规则判断</span>
            <strong v-if="analysis" :class="analysis.matched ? 'matched' : 'partial'">{{ analysis.matched ? '符合' : '接近' }}</strong>
          </div>
          <em v-if="analysis">置信 {{ analysis.confidence }}</em>
        </div>

        <template v-if="analysis">
          <div class="case-rule">
            <strong>{{ analysis.ruleLabel }}</strong>
            <p>{{ analysis.ruleDescription }}</p>
          </div>
          <div class="case-observations">
            <div v-for="item in analysis.observations" :key="item.label">
              <span>{{ item.label }}</span>
              <strong :class="item.tone">{{ item.value }}</strong>
            </div>
          </div>
          <section class="case-explanation">
            <strong>图上怎么看</strong>
            <ol>
              <li v-for="item in analysis.explanations" :key="item">{{ item }}</li>
            </ol>
          </section>
          <div class="case-legend">
            <span><i class="marker-sample" />信号 K 线</span>
            <span v-for="guide in analysis.guides" :key="`${guide.title}-${guide.price}`"><i :style="{ background: guide.color }" />{{ guide.title }}</span>
          </div>
          <div class="case-caveat"><ShieldAlert :size="13" /><span>{{ analysis.caveat }}</span></div>
        </template>
        <div v-else class="case-state"><BookOpenCheck :size="21" /><span>选择左侧候选后显示逐条解析</span></div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { ArrowLeft, BookOpenCheck, ChartCandlestick, RefreshCw, ScanSearch, ShieldAlert, TriangleAlert } from '@lucide/vue';
import KLineChart from '@/components/KLineChart.vue';
import { analyzeKnowledgeCase, fetchKnowledgeCaseCandidates, knowledgeCaseRuleLabel } from '@/services/knowledgeCaseAnalyzer';
import { fetchStockCandles } from '@/services/sectorProvider';
import type { KnowledgeTerm } from '@/data/tradingKnowledge';
import type { KnowledgeCaseAnalysis, KnowledgeCaseCandidate } from '@/types/knowledge';

const props = defineProps<{ term: KnowledgeTerm }>();
const emit = defineEmits<{ back: [] }>();
const candidates = ref<KnowledgeCaseCandidate[]>([]);
const selectedCandidate = ref<KnowledgeCaseCandidate | null>(null);
const analysis = ref<KnowledgeCaseAnalysis | null>(null);
const candidateLoading = ref(false);
const analysisLoading = ref(false);
const candidateError = ref('');
const analysisError = ref('');
let requestId = 0;

onMounted(() => void loadCandidates());
watch(() => props.term.id, () => void loadCandidates());

async function loadCandidates() {
  const currentRequest = ++requestId;
  candidateLoading.value = true;
  candidateError.value = '';
  analysisError.value = '';
  candidates.value = [];
  selectedCandidate.value = null;
  analysis.value = null;
  try {
    const rows = await fetchKnowledgeCaseCandidates(props.term.id);
    if (currentRequest !== requestId) return;
    candidates.value = rows;
    if (!rows.length) {
      candidateError.value = '当前活跃榜暂无合适候选';
      return;
    }
    candidateLoading.value = false;
    await selectCandidate(rows[0], currentRequest);
  } catch {
    if (currentRequest === requestId) candidateError.value = '真实行情暂不可用';
  } finally {
    if (currentRequest === requestId) candidateLoading.value = false;
  }
}

async function selectCandidate(row: KnowledgeCaseCandidate, parentRequest?: number) {
  const currentRequest = parentRequest ?? ++requestId;
  selectedCandidate.value = row;
  analysis.value = null;
  analysisError.value = '';
  analysisLoading.value = true;
  try {
    const candles = await fetchStockCandles(row.code, '1d');
    if (currentRequest !== requestId || selectedCandidate.value?.code !== row.code) return;
    if (candles.length < 25) throw new Error('insufficient candles');
    analysis.value = analyzeKnowledgeCase(props.term.id, candles, row);
  } catch {
    if (currentRequest === requestId) analysisError.value = '该股票日 K 数据不足';
  } finally {
    if (currentRequest === requestId) analysisLoading.value = false;
  }
}

function priceClass(value: number) {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return '';
}

function formatPct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
</script>

<style scoped>
.case-study { min-width: 0; min-height: 0; display: grid; grid-template-rows: 46px minmax(0, 1fr); background: var(--bg-panel); }
.case-study-header { min-width: 0; display: grid; grid-template-columns: 28px minmax(0, 1fr) 28px; align-items: center; gap: 9px; padding: 0 10px; border-bottom: 1px solid rgba(var(--border-rgb), .08); background: var(--bg-app); }
.case-study-header > div { min-width: 0; }
.case-study-header strong, .case-study-header span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.case-study-header strong { color: var(--text-strong); font-size: 12px; }
.case-study-header span { margin-top: 3px; color: var(--text-subtle); font-size: 9px; }
.case-back, .case-refresh { width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 1px solid rgba(var(--border-rgb), .08); border-radius: 5px; background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; }
.case-back:hover, .case-refresh:hover { color: var(--accent-bright); }
.case-study-workspace { min-width: 0; min-height: 0; display: grid; grid-template-columns: 250px minmax(390px, 1fr) 285px; }
.case-candidates, .case-analysis { min-width: 0; min-height: 0; background: var(--bg-panel-alt); }
.case-candidates { display: grid; grid-template-rows: 36px minmax(0, 1fr) 30px; border-right: 1px solid rgba(var(--border-rgb), .08); }
.case-panel-heading { display: flex; align-items: center; justify-content: space-between; padding: 0 9px; border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.case-panel-heading > div { display: flex; align-items: center; gap: 6px; color: var(--accent); }
.case-panel-heading strong { color: var(--text-primary); font-size: 10px; }
.case-panel-heading > span { min-width: 22px; height: 18px; display: grid; place-items: center; border-radius: 3px; background: var(--bg-muted); color: var(--accent-bright); font-size: 9px; }
.candidate-list { min-height: 0; overflow-y: auto; }
.candidate-list > button { width: 100%; min-height: 54px; display: grid; grid-template-columns: 27px minmax(0, 1fr) 52px; align-items: center; gap: 6px; padding: 7px 8px; border: 0; border-bottom: 1px solid rgba(var(--border-rgb), .05); background: transparent; color: var(--text-secondary); text-align: left; cursor: pointer; }
.candidate-list > button:hover { background: var(--bg-control); }
.candidate-list > button.active { background: var(--accent-soft); box-shadow: inset 3px 0 var(--accent); }
.candidate-score { width: 25px; height: 25px; display: grid; place-items: center; border-radius: 4px; background: var(--bg-muted); color: var(--accent-bright); font-size: 9px; font-weight: 800; }
.candidate-name { min-width: 0; display: grid; gap: 2px; }
.candidate-name strong, .candidate-name em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.candidate-name strong { color: var(--text-primary); font-size: 10px; }
.candidate-name em { color: var(--text-faint); font-size: 8px; font-style: normal; }
.candidate-list > button > strong { text-align: right; font-size: 9px; }
.candidate-reasons { grid-column: 2 / 4; overflow: hidden; color: var(--text-subtle); font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.candidate-note { display: flex; align-items: center; padding: 0 9px; border-top: 1px solid rgba(var(--border-rgb), .06); color: var(--text-faint); font-size: 8px; }
.case-chart-panel { min-width: 0; min-height: 0; display: grid; grid-template-rows: 48px minmax(0, 1fr); border-right: 1px solid rgba(var(--border-rgb), .08); }
.case-stock-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 11px; border-bottom: 1px solid rgba(var(--border-rgb), .07); background: var(--bg-panel-alt); }
.case-stock-bar > div:first-child { min-width: 0; }
.case-stock-bar strong, .case-stock-bar span { display: block; }
.case-stock-bar > div:first-child strong { color: var(--text-strong); font-size: 12px; }
.case-stock-bar > div:first-child span { margin-top: 3px; color: var(--text-subtle); font-size: 8px; }
.case-quote { display: flex; align-items: baseline; gap: 7px; white-space: nowrap; }
.case-quote strong { font-size: 15px; }
.case-quote span { font-size: 9px; }
.case-analysis { overflow-y: auto; }
.case-analysis-heading { height: 48px; display: flex; align-items: center; justify-content: space-between; padding: 0 11px; border-bottom: 1px solid rgba(var(--border-rgb), .07); background: var(--bg-elevated); }
.case-analysis-heading > div { display: flex; align-items: center; gap: 7px; }
.case-analysis-heading span { color: var(--text-muted); font-size: 9px; }
.case-analysis-heading strong { padding: 2px 5px; border-radius: 3px; font-size: 9px; }
.case-analysis-heading strong.matched { background: rgba(var(--market-up-rgb), .14); color: #e36a6a; }
.case-analysis-heading strong.partial { background: rgba(var(--accent-rgb), .14); color: var(--accent-bright); }
.case-analysis-heading em { color: var(--text-subtle); font-size: 8px; font-style: normal; }
.case-rule { padding: 13px 11px; border-bottom: 1px solid rgba(var(--border-rgb), .06); }
.case-rule strong { color: var(--accent-bright); font-size: 11px; }
.case-rule p { margin: 7px 0 0; color: var(--text-secondary); font-size: 9px; line-height: 1.65; }
.case-observations { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-bottom: 1px solid rgba(var(--border-rgb), .06); }
.case-observations > div { min-width: 0; display: grid; gap: 4px; padding: 9px 10px; border-right: 1px solid rgba(var(--border-rgb), .05); border-bottom: 1px solid rgba(var(--border-rgb), .05); }
.case-observations > div:nth-child(2n) { border-right: 0; }
.case-observations span { color: var(--text-faint); font-size: 8px; }
.case-observations strong { font-size: 11px; }
.case-explanation { padding: 13px 11px; border-bottom: 1px solid rgba(var(--border-rgb), .06); }
.case-explanation > strong { color: var(--text-primary); font-size: 10px; }
.case-explanation ol { display: grid; gap: 7px; margin: 9px 0 0; padding-left: 18px; color: var(--text-secondary); font-size: 9px; line-height: 1.55; }
.case-explanation li::marker { color: var(--accent); font-weight: 800; }
.case-legend { display: flex; flex-wrap: wrap; gap: 7px 10px; padding: 11px; border-bottom: 1px solid rgba(var(--border-rgb), .06); }
.case-legend span { display: inline-flex; align-items: center; gap: 4px; color: var(--text-subtle); font-size: 8px; }
.case-legend i { width: 11px; height: 2px; display: inline-block; }
.case-legend .marker-sample { width: 6px; height: 6px; border-radius: 50%; background: var(--market-up); }
.case-caveat { display: flex; align-items: flex-start; gap: 7px; margin: 11px; padding: 9px; border-left: 2px solid var(--accent); background: var(--bg-header); color: var(--text-subtle); }
.case-caveat svg { flex: 0 0 auto; color: var(--accent); }
.case-caveat span { font-size: 8px; line-height: 1.55; }
.case-state { min-height: 0; display: grid; place-items: center; align-content: center; gap: 8px; color: var(--text-subtle); font-size: 9px; text-align: center; }
.case-state button { height: 24px; padding: 0 8px; border: 1px solid rgba(var(--accent-rgb), .3); border-radius: 4px; background: transparent; color: var(--accent-bright); cursor: pointer; }
.chart-state { grid-row: 2; }
.up { color: var(--market-up) !important; }
.down { color: var(--market-down) !important; }
.watch { color: var(--accent-bright) !important; }
.neutral { color: var(--text-strong) !important; }
@media (max-width: 1260px) {
  .case-study-workspace { grid-template-columns: 220px minmax(350px, 1fr) 255px; }
}
</style>
