<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">A</span>
      <div>
        <strong>BigA</strong>
        <span>监盘终端</span>
      </div>
    </div>

    <div class="market-chip" :class="[marketPhase.type, marketDataHealth.state]" :title="marketDataHealth.detail">
      <Radio :size="15" />
      <i class="data-health-dot" />
      <span>{{ marketDataHealth.label }}</span>
      <strong>{{ marketPhase.label }}</strong>
    </div>

    <nav class="top-tabs" aria-label="工作区">
      <button v-for="item in workspaceTabs" :key="item.key" type="button" :class="{ active: activeTab === item.key }" @click="emit('update:activeTab', item.key)">
        <component :is="item.icon" :size="15" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <div v-if="hasMarketData" class="top-stat">
      <span>上涨</span>
      <strong class="up">{{ breadth.up }}</strong>
    </div>
    <div v-if="hasMarketData" class="top-stat">
      <span>下跌</span>
      <strong class="down">{{ breadth.down }}</strong>
    </div>
    <div class="top-spacer" />

    <button class="icon-button" type="button" title="数据源" @click="emit('open-data-source')">
      <Database :size="17" />
    </button>
    <button class="icon-button" type="button" title="终端设置" @click="emit('open-appearance')">
      <Settings2 :size="17" />
    </button>
  </header>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { Activity, BookOpen, Database, Layers3, Newspaper, Radio, Settings2, Star, TrendingUp } from '@lucide/vue';
import type { MarketDataHealth } from '@/services/dataHealth';
import type { MarketPhase } from '@/types/market';
import type { WorkspaceTab } from '@/types/workspace';

defineProps<{
  activeTab: WorkspaceTab;
  marketPhase: MarketPhase;
  marketDataHealth: MarketDataHealth;
  hasMarketData: boolean;
  breadth: { up: number; down: number; flat: number };
}>();

const emit = defineEmits<{
  'update:activeTab': [tab: WorkspaceTab];
  'open-data-source': [];
  'open-appearance': [];
}>();

const workspaceTabs: ReadonlyArray<{ key: WorkspaceTab; label: string; icon: Component }> = [
  { key: 'news', label: '新闻', icon: Newspaper },
  { key: 'sectors', label: '市场监控', icon: Activity },
  { key: 'hotSectors', label: '热门板块', icon: Layers3 },
  { key: 'hotStocks', label: '热门股票', icon: TrendingUp },
  { key: 'knowledge', label: '知识库', icon: BookOpen },
  { key: 'watchlist', label: '自选股', icon: Star }
];
</script>
