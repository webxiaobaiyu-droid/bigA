<template>
  <main class="tab-page news-page">
    <section class="tab-hero news-shell">
      <div class="tab-heading news-heading">
        <div class="heading-title">
          <Newspaper :size="22" />
          <strong>新闻</strong>
          <span>{{ status }}</span>
        </div>
        <div class="news-actions">
          <div v-if="!selectedNews" class="mini-tabs news-source-tabs">
            <button v-for="item in filters" :key="item.key" type="button" :class="{ active: filter === item.key }" @click="emit('update:filter', item.key)">
              {{ item.label }}
            </button>
          </div>
          <button class="icon-button mini" :class="{ active: loading }" type="button" title="刷新新闻" @click="emit('refresh')">
            <RefreshCw :size="14" />
          </button>
        </div>
      </div>
      <div v-if="selectedNews" class="news-detail-page">
        <div class="news-detail-bar">
          <button class="icon-button mini" type="button" title="返回新闻列表" @click="emit('close-detail')">
            <ArrowLeft :size="14" />
          </button>
          <div>
            <span>{{ selectedNews.sourceLabel }}</span>
            <strong>{{ selectedNews.channel }}</strong>
          </div>
          <time>{{ formatNewsTime(selectedNews.publishedAt) }}</time>
        </div>
        <article class="news-detail">
          <div class="news-article-column">
            <header class="news-article-header">
              <div class="news-detail-meta">
                <span class="news-source">{{ selectedNews.sourceLabel }}</span>
                <span>{{ selectedNews.channel }}</span>
                <time>{{ formatNewsTime(selectedNews.publishedAt) }}</time>
                <em v-for="tag in selectedNews.tags" :key="tag">{{ tag }}</em>
              </div>
              <h1>{{ selectedNews.title }}</h1>
            </header>
            <div v-if="detailLoading" class="news-detail-state">
              <RefreshCw :size="14" class="spin" />
              <span>正文同步中</span>
            </div>
            <div class="news-detail-body">
              <p v-for="(paragraph, index) in selectedParagraphs" :key="`${selectedNews.id}-${index}`">{{ paragraph }}</p>
            </div>
          </div>
        </article>
      </div>
      <div v-else-if="loading && !items.length" class="tab-empty">
        <RefreshCw :size="26" class="spin" />
        <strong>同步新闻中</strong>
      </div>
      <div v-else-if="!items.length" class="tab-empty">
        <Newspaper :size="26" />
        <strong>{{ emptyLabel }}</strong>
      </div>
      <div v-else class="news-list">
        <article
          v-for="item in items"
          :key="item.id"
          class="news-item"
          role="button"
          tabindex="0"
          @click="emit('open-news', item)"
          @keydown.enter="emit('open-news', item)"
          @keydown.space.prevent="emit('open-news', item)"
        >
          <div class="news-meta">
            <span class="news-source">{{ item.sourceLabel }}</span>
            <span>{{ item.channel }}</span>
            <time>{{ formatNewsTime(item.publishedAt) }}</time>
            <em v-for="tag in item.tags" :key="tag">{{ tag }}</em>
          </div>
          <button class="news-title" type="button" @click.stop="emit('open-news', item)">
            {{ item.title }}
          </button>
          <p v-if="item.summary">{{ item.summary }}</p>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ArrowLeft, Newspaper, RefreshCw } from '@lucide/vue';
import type { NewsItem } from '@/types/news';
import type { NewsFilterKey } from '@/types/workspace';
import { formatNewsTime } from '@/utils/marketFormatters';

defineProps<{
  status: string;
  filters: ReadonlyArray<{ key: NewsFilterKey; label: string }>;
  filter: NewsFilterKey;
  loading: boolean;
  items: NewsItem[];
  emptyLabel: string;
  selectedNews: NewsItem | null;
  selectedParagraphs: string[];
  detailLoading: boolean;
}>();

const emit = defineEmits<{
  'update:filter': [filter: NewsFilterKey];
  refresh: [];
  'open-news': [item: NewsItem];
  'close-detail': [];
}>();
</script>
