<template>
  <section class="tab-hero knowledge-shell">
    <div class="tab-heading knowledge-heading">
      <div class="heading-title">
        <BookOpen :size="20" />
        <strong>交易知识库</strong>
        <span>证据、反例、回放与个人错题</span>
      </div>
      <div class="knowledge-heading-actions">
        <div class="mini-tabs knowledge-view-tabs">
          <button v-for="item in knowledgeViews" :key="item.key" type="button" :class="{ active: knowledgeView === item.key }" @click="knowledgeView = item.key">
            <component :is="item.icon" :size="13" /><span>{{ item.label }}</span>
          </button>
        </div>
        <label v-if="knowledgeView === 'library'" class="knowledge-search">
          <Search :size="14" />
          <input v-model.trim="query" type="search" placeholder="搜索术语、别名或概念" aria-label="搜索交易知识" />
          <button v-if="query" type="button" title="清空搜索" aria-label="清空搜索" @click="query = ''"><X :size="13" /></button>
        </label>
      </div>
    </div>

    <KnowledgeLab v-if="knowledgeView !== 'library'" :mode="knowledgeView" @mode-change="knowledgeView = $event" />

    <template v-else>
    <KnowledgeCaseStudy v-if="caseMode && selectedTerm" class="knowledge-case-container" :term="selectedTerm" @back="caseMode = false" />

    <div v-else class="knowledge-workspace">
      <aside class="knowledge-index">
        <div class="knowledge-category-tabs">
          <button
            v-for="category in KNOWLEDGE_CATEGORIES"
            :key="category.key"
            type="button"
            :class="{ active: activeCategory === category.key }"
            @click="activeCategory = category.key"
          >
            {{ category.label }}
            <span>{{ categoryCount(category.key) }}</span>
          </button>
        </div>

        <div class="word-cloud" aria-label="交易术语词云">
          <button
            v-for="term in filteredTerms"
            :key="term.id"
            type="button"
            class="cloud-term"
            :class="[`weight-${term.weight}`, `category-${term.category}`, { active: selectedTerm?.id === term.id }]"
            :title="term.summary"
            @click="selectedId = term.id"
          >
            {{ term.title }}
          </button>
          <div v-if="!filteredTerms.length" class="knowledge-empty">
            <SearchX :size="22" />
            <strong>没有匹配的交易术语</strong>
            <button type="button" @click="resetFilters">清空筛选</button>
          </div>
        </div>

        <div class="knowledge-index-footer">
          <ShieldAlert :size="13" />
          <span>先确认数据口径，再使用任何指标或信号。</span>
        </div>
      </aside>

      <article v-if="selectedTerm" class="knowledge-detail">
        <header class="knowledge-detail-header">
          <div>
            <span>{{ categoryLabel(selectedTerm.category) }} · {{ selectedTerm.level }}</span>
            <h1>{{ selectedTerm.title }}</h1>
            <p v-if="selectedTerm.aliases.length">也叫：{{ selectedTerm.aliases.join('、') }}</p>
          </div>
          <div class="knowledge-detail-actions">
            <button v-if="supportsKnowledgeCase(selectedTerm.id)" type="button" @click="caseMode = true">
              <ChartCandlestick :size="14" /><span>实例解析</span>
            </button>
            <div class="term-sequence">{{ selectedIndex + 1 }} / {{ filteredTerms.length }}</div>
          </div>
        </header>

        <div class="knowledge-definition">
          <strong>一句话理解</strong>
          <p>{{ selectedTerm.summary }}</p>
        </div>

        <section class="knowledge-section">
          <div class="knowledge-section-title"><Brain :size="16" /><strong>核心解析</strong></div>
          <p>{{ selectedTerm.explanation }}</p>
        </section>

        <div class="knowledge-detail-grid">
          <section class="knowledge-section signal-section">
            <div class="knowledge-section-title"><ScanLine :size="16" /><strong>怎么看</strong></div>
            <ol>
              <li v-for="signal in selectedTerm.signals" :key="signal">{{ signal }}</li>
            </ol>
          </section>
          <section class="knowledge-section pitfall-section">
            <div class="knowledge-section-title"><TriangleAlert :size="16" /><strong>常见误区</strong></div>
            <p>{{ selectedTerm.pitfall }}</p>
          </section>
        </div>

        <section class="knowledge-example">
          <span>例子</span>
          <p>{{ selectedTerm.example }}</p>
        </section>

        <section v-if="relatedTerms.length" class="related-terms">
          <span>继续理解</span>
          <button v-for="term in relatedTerms" :key="term.id" type="button" @click="openRelated(term.id)">
            {{ term.title }}<ChevronRight :size="12" />
          </button>
        </section>

        <footer>内容用于交易概念学习，不构成投资建议。市场规则和数据口径以交易所及数据源说明为准。</footer>
      </article>
    </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { BookOpen, BookOpenCheck, Brain, ChartCandlestick, ChevronRight, GraduationCap, LibraryBig, Radar, ScanLine, Search, SearchX, ShieldAlert, TriangleAlert, X } from '@lucide/vue';
import KnowledgeCaseStudy from '@/components/KnowledgeCaseStudy.vue';
import KnowledgeLab from '@/components/KnowledgeLab.vue';
import { KNOWLEDGE_CATEGORIES, TRADING_KNOWLEDGE, type KnowledgeCategory } from '@/data/tradingKnowledge';
import { supportsKnowledgeCase } from '@/services/knowledgeCaseAnalyzer';

type CategoryFilter = 'all' | KnowledgeCategory;
type KnowledgeView = 'radar' | 'library' | 'training' | 'notebook';

const knowledgeView = ref<KnowledgeView>('radar');
const activeCategory = ref<CategoryFilter>('all');
const query = ref('');
const selectedId = ref('volume-price-rise');
const caseMode = ref(false);
const knowledgeViews: Array<{ key: KnowledgeView; label: string; icon: typeof Radar }> = [
  { key: 'radar', label: '今日雷达', icon: Radar },
  { key: 'library', label: '术语词典', icon: LibraryBig },
  { key: 'training', label: '回放训练', icon: GraduationCap },
  { key: 'notebook', label: '我的错题', icon: BookOpenCheck }
];

const filteredTerms = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase();
  return TRADING_KNOWLEDGE.filter((term) => {
    if (activeCategory.value !== 'all' && term.category !== activeCategory.value) return false;
    if (!keyword) return true;
    return [term.title, term.summary, term.explanation, ...term.aliases]
      .some((value) => value.toLocaleLowerCase().includes(keyword));
  });
});
const selectedTerm = computed(() => filteredTerms.value.find((term) => term.id === selectedId.value) ?? filteredTerms.value[0] ?? null);
const selectedIndex = computed(() => Math.max(0, filteredTerms.value.findIndex((term) => term.id === selectedTerm.value?.id)));
const relatedTerms = computed(() => selectedTerm.value?.related
  .map((id) => TRADING_KNOWLEDGE.find((term) => term.id === id))
  .filter((term): term is (typeof TRADING_KNOWLEDGE)[number] => Boolean(term)) ?? []);

watch(filteredTerms, (terms) => {
  if (terms.length && !terms.some((term) => term.id === selectedId.value)) selectedId.value = terms[0].id;
});
watch(selectedId, () => {
  caseMode.value = false;
});

function categoryCount(category: CategoryFilter) {
  if (category === 'all') return TRADING_KNOWLEDGE.length;
  return TRADING_KNOWLEDGE.filter((term) => term.category === category).length;
}

function categoryLabel(category: KnowledgeCategory) {
  return KNOWLEDGE_CATEGORIES.find((item) => item.key === category)?.label ?? '交易概念';
}

function resetFilters() {
  activeCategory.value = 'all';
  query.value = '';
}

function openRelated(id: string) {
  activeCategory.value = 'all';
  query.value = '';
  selectedId.value = id;
}
</script>

<style scoped>
.knowledge-shell { grid-template-rows: 46px minmax(0, 1fr); }
.knowledge-heading { justify-content: space-between; min-width: 0; padding-right: 11px; }
.knowledge-heading-actions { min-width: 0; display: flex; align-items: center; gap: 8px; }
.knowledge-view-tabs { flex: 0 0 auto; }
.knowledge-view-tabs button { display: inline-flex; align-items: center; gap: 4px; padding: 0 6px; font-size: 9px; }
.knowledge-search { width: 270px; height: 29px; display: flex; align-items: center; gap: 7px; padding: 0 8px; border: 1px solid rgba(var(--border-rgb), .09); border-radius: 5px; background: var(--bg-app); color: var(--text-subtle); }
.knowledge-search:focus-within { border-color: rgba(var(--accent-rgb), .48); color: var(--accent); }
.knowledge-search input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text-strong); font-size: 11px; }
.knowledge-search input::placeholder { color: var(--text-faint); }
.knowledge-search button { width: 17px; height: 17px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 3px; background: transparent; color: var(--text-muted); cursor: pointer; }
.knowledge-search button:hover { background: var(--bg-muted); color: var(--text-primary); }
.knowledge-workspace { min-width: 0; min-height: 0; display: grid; grid-template-columns: 39% minmax(0, 1fr); }
.knowledge-case-container { min-width: 0; min-height: 0; }
.knowledge-index { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) 34px; border-right: 1px solid rgba(var(--border-rgb), .08); background: var(--bg-panel-alt); }
.knowledge-category-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; padding: 8px; border-bottom: 1px solid rgba(var(--border-rgb), .07); background: var(--bg-app); }
.knowledge-category-tabs button { height: 29px; display: flex; align-items: center; justify-content: center; gap: 5px; border: 0; border-radius: 4px; background: var(--bg-panel-alt); color: var(--text-muted); font-size: 10px; cursor: pointer; }
.knowledge-category-tabs button:hover { background: var(--bg-tooltip); color: var(--text-primary); }
.knowledge-category-tabs button.active { background: var(--accent-soft); color: var(--accent-bright); box-shadow: inset 0 -2px var(--accent); }
.knowledge-category-tabs span { color: var(--text-faint); font-size: 8px; }
.knowledge-category-tabs button.active span { color: #c29b4c; }
.word-cloud { min-width: 0; min-height: 0; align-content: center; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 11px 13px; overflow-y: auto; padding: 24px 22px; }
.cloud-term { position: relative; min-height: 28px; padding: 2px 5px; border: 0; border-radius: 3px; background: transparent; color: var(--text-secondary); letter-spacing: 0; cursor: pointer; transition: color .14s ease, background .14s ease, transform .14s ease; }
.cloud-term::before { content: ''; width: 4px; height: 4px; position: absolute; top: 4px; left: 0; border-radius: 50%; background: currentColor; opacity: .55; }
.cloud-term:hover { background: var(--bg-tooltip); color: var(--text-primary); transform: translateY(-1px); }
.cloud-term.active { background: var(--accent-soft); color: var(--accent-bright); box-shadow: inset 0 -2px var(--accent); }
.cloud-term.weight-1 { font-size: 12px; font-weight: 500; }
.cloud-term.weight-2 { font-size: 15px; font-weight: 650; }
.cloud-term.weight-3 { font-size: 19px; font-weight: 760; }
.cloud-term.category-volume { color: #d8b45f; }
.cloud-term.category-orderbook { color: #54b8b4; }
.cloud-term.category-shortTerm { color: #d06b6b; }
.cloud-term.category-advanced { color: #a795d0; }
.cloud-term.category-risk { color: #d28a62; }
.knowledge-empty { width: 100%; display: grid; place-items: center; align-content: center; gap: 9px; color: var(--text-subtle); }
.knowledge-empty strong { font-size: 11px; }
.knowledge-empty button { height: 25px; padding: 0 9px; border: 1px solid rgba(var(--accent-rgb), .3); border-radius: 4px; background: transparent; color: var(--accent-bright); font-size: 10px; cursor: pointer; }
.knowledge-index-footer { display: flex; align-items: center; justify-content: center; gap: 7px; border-top: 1px solid rgba(var(--border-rgb), .06); color: var(--text-faint); font-size: 9px; }
.knowledge-detail { min-width: 0; min-height: 0; overflow-y: auto; padding: 26px 32px 22px; background: var(--bg-panel); }
.knowledge-detail-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding-bottom: 18px; border-bottom: 1px solid rgba(var(--border-rgb), .08); }
.knowledge-detail-header span { color: var(--accent); font-size: 10px; font-weight: 700; }
.knowledge-detail-header h1 { margin: 7px 0 5px; color: var(--text-strong); font-size: 25px; letter-spacing: 0; }
.knowledge-detail-header p { margin: 0; color: var(--text-subtle); font-size: 10px; }
.knowledge-detail-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; }
.knowledge-detail-actions > button { height: 29px; display: inline-flex; align-items: center; gap: 6px; padding: 0 9px; border: 1px solid rgba(var(--accent-rgb), .32); border-radius: 4px; background: var(--accent-soft); color: var(--accent-bright); font-size: 10px; cursor: pointer; }
.knowledge-detail-actions > button:hover { border-color: rgba(var(--accent-rgb), .58); background: var(--accent-soft); }
.term-sequence { flex: 0 0 auto; color: var(--text-faint); font-size: 10px; font-variant-numeric: tabular-nums; }
.knowledge-definition { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 14px; margin: 20px 0; padding: 14px 16px; border-left: 3px solid var(--accent); background: var(--bg-header); }
.knowledge-definition strong { color: var(--accent-bright); font-size: 11px; }
.knowledge-definition p { margin: 0; color: var(--text-strong); font-size: 13px; line-height: 1.7; }
.knowledge-section { padding: 17px 0; border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.knowledge-section-title { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; color: var(--accent); }
.knowledge-section-title strong { color: var(--text-primary); font-size: 12px; }
.knowledge-section > p { margin: 0; color: var(--text-secondary); font-size: 12px; line-height: 1.85; }
.knowledge-detail-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); gap: 24px; border-bottom: 1px solid rgba(var(--border-rgb), .07); }
.knowledge-detail-grid .knowledge-section { border-bottom: 0; }
.signal-section ol { display: grid; gap: 8px; margin: 0; padding-left: 22px; color: var(--text-secondary); font-size: 11px; line-height: 1.6; }
.signal-section li::marker { color: var(--accent); font-weight: 800; }
.pitfall-section .knowledge-section-title { color: #d26b61; }
.knowledge-example { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 12px; margin-top: 18px; padding: 13px 15px; background: var(--bg-panel-alt); }
.knowledge-example span { color: #41c6c3; font-size: 10px; font-weight: 800; }
.knowledge-example p { margin: 0; color: var(--text-secondary); font-size: 11px; line-height: 1.7; }
.related-terms { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 18px; }
.related-terms > span { margin-right: 5px; color: var(--text-subtle); font-size: 10px; }
.related-terms button { height: 25px; display: inline-flex; align-items: center; gap: 3px; padding: 0 7px; border: 1px solid rgba(var(--border-rgb), .08); border-radius: 4px; background: var(--bg-header); color: var(--text-secondary); font-size: 10px; cursor: pointer; }
.related-terms button:hover { border-color: rgba(var(--accent-rgb), .3); color: var(--accent-bright); }
.knowledge-detail footer { margin-top: 25px; color: var(--text-faint); font-size: 9px; line-height: 1.6; }
@media (max-width: 1260px) {
  .knowledge-heading .heading-title > span { display: none; }
  .knowledge-search { width: 205px; }
  .knowledge-workspace { grid-template-columns: 43% minmax(0, 1fr); }
  .knowledge-detail { padding: 22px 24px 18px; }
  .knowledge-detail-grid { grid-template-columns: 1fr; gap: 0; }
  .knowledge-detail-grid .knowledge-section:first-child { border-bottom: 1px solid rgba(var(--border-rgb), .07); }
  .word-cloud { gap: 9px 10px; padding: 18px 15px; }
}
</style>
