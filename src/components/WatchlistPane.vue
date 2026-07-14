<template>
  <aside class="watch-pane" :class="{ collapsed }">
    <button v-if="collapsed" class="icon-button pane-restore-button" type="button" title="展开自选池" @click="emit('toggle-collapse')">
      <PanelLeftOpen :size="17" />
    </button>
    <template v-else>
      <div class="pane-title">
        <div>
          <span>自选池</span>
          <strong>{{ totalCount }}</strong>
        </div>
        <div class="pane-title-actions">
          <button class="icon-button alert-center-button" type="button" title="提醒中心" @click="emit('open-alert-center')">
            <Bell :size="16" />
            <i v-if="unreadAlertCount">{{ unreadAlertCount > 99 ? '99+' : unreadAlertCount }}</i>
          </button>
          <button class="icon-button" type="button" title="管理自选股" @click="emit('open-manager')">
            <ListFilter :size="16" />
          </button>
          <button class="icon-button" type="button" title="收起自选池" @click="emit('toggle-collapse')">
            <PanelLeftClose :size="16" />
          </button>
        </div>
      </div>

      <label class="search-box">
        <Search :size="16" />
        <input
          :value="query"
          type="search"
          placeholder="输入代码、名称或拼音"
          @input="updateQuery"
          @compositionend="updateQuery"
          @keydown.enter.prevent="emit('submit-search')"
        />
        <RefreshCw v-if="searchLoading" :size="13" class="spin" />
      </label>

      <div v-if="query" class="candidate-panel">
        <div v-if="searchLoading" class="candidate-state">正在查询沪深北 A 股</div>
        <div v-else-if="searchError" class="candidate-state error">{{ searchError }}</div>
        <div v-else-if="!candidateRows.length" class="candidate-state">没有可添加的股票</div>
        <div v-else class="watch-search-results">
          <button v-for="item in candidateRows" :key="item.code" type="button" @click="emit('add-stock', item)">
            <span>{{ item.code }}</span>
            <strong>{{ item.name }}</strong>
            <em>{{ item.market }}</em>
            <Plus :size="14" />
          </button>
        </div>
      </div>

      <div class="watch-group-tabs" aria-label="自选分组">
        <button type="button" :class="{ active: activeGroupId === 'all' }" @click="emit('select-group', 'all')">全部 <strong>{{ totalCount }}</strong></button>
        <button v-for="group in groups" :key="group.id" type="button" :class="{ active: activeGroupId === group.id }" @click="emit('select-group', group.id)">
          <i :style="{ background: group.color }" />{{ group.name }} <strong>{{ groupCount(group.id) }}</strong>
        </button>
      </div>

      <div class="segmented">
        <button v-for="item in sortOptions" :key="item.key" type="button" :class="{ active: sortKey === item.key }" @click="emit('update:sort-key', item.key)">
          {{ item.label }}
        </button>
      </div>

      <div class="watch-list">
        <div v-if="!rows.length" class="empty-list">
          <Database :size="22" />
          <strong>暂无自选</strong>
          <span>通过上方搜索添加股票</span>
        </div>

        <div
          v-for="row in rows"
          :key="row.meta.code"
          class="quote-row"
          :class="{ selected: selectedCode === row.meta.code }"
          :draggable="sortKey === 'custom'"
          role="button"
          tabindex="0"
          @click="emit('select-stock', row.meta.code)"
          @keydown.enter="emit('select-stock', row.meta.code)"
          @keydown.space.prevent="emit('select-stock', row.meta.code)"
          @dragstart="startDrag(row.meta.code)"
          @dragend="draggedCode = ''"
          @dragover.prevent
          @drop="dropRow(row.meta.code)"
        >
          <div class="quote-name">
            <strong>{{ row.meta.name }}</strong>
            <span>{{ row.meta.code }} · {{ row.meta.sector }}</span>
          </div>
          <div class="quote-price">
            <strong :class="priceClass(row.quote.changePct)">{{ formatPrice(row.quote.price) }}</strong>
            <span :class="priceClass(row.quote.changePct)">{{ formatPct(row.quote.changePct) }}</span>
          </div>
          <div class="quote-tags">
            <span v-if="latestAlert(row.meta.code)" class="alert-tag">{{ latestAlert(row.meta.code)?.ruleName }} · {{ formatAlertAge(latestAlert(row.meta.code)?.occurredAt ?? 0, now) }}</span>
            <span v-for="tag in (entriesByCode.get(row.meta.code)?.tags ?? []).slice(0, 2)" :key="`tag-${tag}`" class="local-tag">{{ tag }}</span>
            <span v-for="signal in row.signals.filter((item) => item.active).slice(0, 2)" :key="signal.id" :class="signal.tone">
              {{ signal.label }}
            </span>
          </div>
          <button class="row-close" type="button" title="移出自选" @click.stop="emit('remove-stock', row.meta.code)">
            <X :size="13" />
          </button>
        </div>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Bell, Database, ListFilter, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Search, X } from '@lucide/vue';
import type { AlertHistoryItem } from '@/types/alerts';
import type { InstrumentState, StockMeta } from '@/types/market';
import type { WatchEntry, WatchGroup } from '@/types/watchlist';
import type { WatchSortKey } from '@/types/workspace';
import { formatAlertAge, formatPct, formatPrice, priceClass } from '@/utils/marketFormatters';

const props = defineProps<{
  collapsed: boolean;
  totalCount: number;
  unreadAlertCount: number;
  query: string;
  searchLoading: boolean;
  searchError: string;
  candidateRows: StockMeta[];
  groups: WatchGroup[];
  entries: WatchEntry[];
  entriesByCode: ReadonlyMap<string, WatchEntry>;
  latestAlerts: ReadonlyMap<string, AlertHistoryItem>;
  activeGroupId: string;
  sortKey: WatchSortKey;
  rows: InstrumentState[];
  selectedCode: string;
  now: number;
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  'update:sort-key': [value: WatchSortKey];
  'toggle-collapse': [];
  'open-alert-center': [];
  'open-manager': [];
  'submit-search': [];
  'add-stock': [meta: StockMeta];
  'select-group': [id: string];
  'select-stock': [code: string];
  'reorder-stock': [sourceCode: string, targetCode: string];
  'remove-stock': [code: string];
}>();

const draggedCode = ref('');
const sortOptions: Array<{ key: WatchSortKey; label: string }> = [
  { key: 'custom', label: '自定义' },
  { key: 'signal', label: '信号' },
  { key: 'change', label: '涨幅' },
  { key: 'speed', label: '速度' }
];

function updateQuery(event: Event) {
  if (event instanceof InputEvent && event.isComposing) return;
  emit('update:query', (event.target as HTMLInputElement).value.trim());
}

function groupCount(groupId: string) {
  return props.entries.filter((entry) => entry.groupId === groupId).length;
}

function latestAlert(code: string) {
  return props.latestAlerts.get(code);
}

function startDrag(code: string) {
  if (props.sortKey === 'custom') draggedCode.value = code;
}

function dropRow(targetCode: string) {
  if (!draggedCode.value || draggedCode.value === targetCode) return;
  emit('reorder-stock', draggedCode.value, targetCode);
  draggedCode.value = '';
}
</script>
