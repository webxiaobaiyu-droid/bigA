<template>
  <div class="workspace-modal-backdrop" @click.self="emit('close')">
    <section class="workspace-modal watchlist-manager" role="dialog" aria-modal="true" aria-label="自选股管理">
      <header class="workspace-modal-header">
        <div><strong>自选股管理</strong><span>{{ rows.length }} 只 · {{ groups.length }} 个分组</span></div>
        <button class="icon-button" type="button" title="关闭" @click="emit('close')"><X :size="16" /></button>
      </header>

      <div class="watch-manager-toolbar">
        <label class="compact-input"><FolderPlus :size="14" /><input v-model.trim="newGroupName" maxlength="12" placeholder="新分组" @keydown.enter="createGroup" /></label>
        <button class="command-button" type="button" @click="createGroup"><Plus :size="14" />新增</button>
        <span class="toolbar-spacer" />
        <button class="command-button" type="button" @click="emit('export', 'csv')"><Download :size="14" />CSV</button>
        <button class="command-button" type="button" @click="emit('export', 'json')"><Download :size="14" />JSON</button>
        <label class="command-button file-button"><Upload :size="14" />文件<input type="file" accept=".csv,.txt,.json,text/csv,application/json" @change="readFile" /></label>
      </div>

      <div class="watch-manager-body">
        <aside class="watch-group-editor">
          <div class="manager-section-title"><span>分组</span><em>删除后股票移到观察组</em></div>
          <div v-for="(group, index) in groups" :key="group.id" class="group-editor-row">
            <input class="group-color-input" type="color" :value="group.color" :title="`${group.name} 分组颜色`" @change="changeGroupColor(group.id, $event)" />
            <input :value="group.name" maxlength="12" @change="renameGroup(group.id, $event)" />
            <strong>{{ groupCounts[group.id] ?? 0 }}</strong>
            <div class="group-row-actions">
              <button class="icon-button mini" type="button" title="上移分组" :disabled="index === 0" @click="emit('move-group', group.id, groups[index - 1].id)"><ChevronUp :size="12" /></button>
              <button class="icon-button mini" type="button" title="下移分组" :disabled="index === groups.length - 1" @click="emit('move-group', group.id, groups[index + 1].id)"><ChevronDown :size="12" /></button>
              <button class="icon-button mini" type="button" title="删除分组" :disabled="groups.length <= 1" @click="confirmDeleteGroup(group.id, group.name)"><Trash2 :size="13" /></button>
            </div>
          </div>

          <div class="manager-section-title import-title"><span>粘贴导入</span><em>CSV 或 BigA JSON</em></div>
          <textarea v-model="importText" placeholder="code,name,market,sector,group,tags&#10;600519,贵州茅台,SH,白酒,趋势,核心|消费" />
          <div class="import-actions">
            <span :class="{ error: importStatus?.tone === 'error' }">{{ importStatus?.message || importMessage }}</span>
            <button class="command-button primary" type="button" :disabled="!importText.trim()" @click="submitImport"><Upload :size="14" />导入</button>
          </div>
        </aside>

        <div class="watch-batch-table">
          <div class="watch-batch-head">
            <label><input type="checkbox" :checked="allSelected" @change="toggleAll" /><span>股票</span></label>
            <span>分组</span><span>标签</span><span>加入时间</span>
          </div>
          <div v-if="!rows.length" class="manager-empty">暂无自选股</div>
          <div v-for="row in rows" :key="row.entry.code" class="watch-batch-row">
            <label class="batch-stock"><input type="checkbox" :checked="selectedCodes.includes(row.entry.code)" @change="toggleCode(row.entry.code)" /><span><strong>{{ row.meta.name }}</strong><em>{{ row.entry.code }}</em></span></label>
            <select :value="row.entry.groupId" @change="changeGroup(row.entry.code, $event)"><option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option></select>
            <label class="tag-input"><Tags :size="13" /><input :value="row.entry.tags.join(' | ')" placeholder="用 | 分隔" @change="changeTags(row.entry.code, $event)" /></label>
            <time>{{ formatDate(row.entry.addedAt) }}</time>
          </div>
        </div>
      </div>

      <footer class="workspace-modal-footer">
        <span>已选择 {{ selectedCodes.length }} 只</span>
        <button class="command-button danger" type="button" :disabled="!selectedCodes.length" @click="removeSelected"><Trash2 :size="14" />批量删除</button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, ChevronUp, Download, FolderPlus, Plus, Tags, Trash2, Upload, X } from '@lucide/vue';
import type { StockMeta } from '@/types/market';
import type { WatchEntry, WatchGroup } from '@/types/watchlist';

const props = defineProps<{
  groups: WatchGroup[];
  entries: WatchEntry[];
  metas: StockMeta[];
  importStatus?: { message: string; tone: 'success' | 'error' } | null;
}>();
const emit = defineEmits<{
  close: [];
  'create-group': [name: string];
  'update-group': [id: string, patch: { name?: string; color?: string }];
  'move-group': [sourceId: string, targetId: string];
  'delete-group': [id: string];
  'update-entry': [code: string, patch: { groupId?: string; tags?: string[] }];
  'remove-codes': [codes: string[]];
  import: [text: string];
  export: [format: 'csv' | 'json'];
}>();

const newGroupName = ref('');
const importText = ref('');
const importMessage = ref('');
const selectedCodes = ref<string[]>([]);
const metaMap = computed(() => new Map(props.metas.map((meta) => [meta.code, meta])));
const rows = computed(() => [...props.entries].sort((a, b) => a.order - b.order).flatMap((entry) => {
  const meta = metaMap.value.get(entry.code);
  return meta ? [{ entry, meta }] : [];
}));
const groupCounts = computed(() => props.entries.reduce<Record<string, number>>((counts, entry) => {
  counts[entry.groupId] = (counts[entry.groupId] ?? 0) + 1;
  return counts;
}, {}));
const allSelected = computed(() => Boolean(rows.value.length && selectedCodes.value.length === rows.value.length));

function createGroup() {
  if (!newGroupName.value) return;
  emit('create-group', newGroupName.value);
  newGroupName.value = '';
}

function renameGroup(id: string, event: Event) {
  emit('update-group', id, { name: (event.target as HTMLInputElement).value.trim() });
}

function changeGroupColor(id: string, event: Event) {
  emit('update-group', id, { color: (event.target as HTMLInputElement).value });
}

function confirmDeleteGroup(id: string, name: string) {
  if (window.confirm(`删除“${name}”后，股票会移动到观察组。是否继续？`)) emit('delete-group', id);
}

function changeGroup(code: string, event: Event) {
  emit('update-entry', code, { groupId: (event.target as HTMLSelectElement).value });
}

function changeTags(code: string, event: Event) {
  emit('update-entry', code, { tags: (event.target as HTMLInputElement).value.split(/[|；;]/).map((tag) => tag.trim()).filter(Boolean) });
}

function toggleCode(code: string) {
  selectedCodes.value = selectedCodes.value.includes(code) ? selectedCodes.value.filter((item) => item !== code) : [...selectedCodes.value, code];
}

function toggleAll() {
  selectedCodes.value = allSelected.value ? [] : rows.value.map((row) => row.entry.code);
}

function removeSelected() {
  emit('remove-codes', selectedCodes.value);
  selectedCodes.value = [];
}

function submitImport() {
  emit('import', importText.value);
  importMessage.value = '已提交导入';
  importText.value = '';
}

function readFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { importText.value = String(reader.result ?? ''); importMessage.value = `已读取 ${file.name}`; };
  reader.onerror = () => { importMessage.value = '文件读取失败'; };
  reader.readAsText(file, 'utf-8');
  input.value = '';
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(timestamp);
}
</script>
