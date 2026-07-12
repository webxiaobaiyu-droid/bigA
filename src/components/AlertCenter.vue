<template>
  <div class="workspace-modal-backdrop" @click.self="emit('close')">
    <section class="workspace-modal alert-center" role="dialog" aria-modal="true" aria-label="提醒中心">
      <header class="workspace-modal-header">
        <div><strong>提醒中心</strong><span>{{ enabledRuleCount }} 条启用 · {{ unreadCount }} 条未读</span></div>
        <div class="alert-center-tabs"><button v-for="item in tabs" :key="item.key" type="button" :class="{ active: tab === item.key }" @click="tab = item.key">{{ item.label }}</button></div>
        <button class="icon-button" type="button" title="关闭" @click="emit('close')"><X :size="16" /></button>
      </header>

      <template v-if="tab === 'rules'">
        <div class="alert-rule-builder">
          <select v-model="draftType"><option v-for="item in ruleTypes" :key="item.key" :value="item.key">{{ item.label }}</option></select>
          <select v-model="draftScope"><option value="all">全部自选股</option><option value="stocks">指定股票</option><option value="group">自选分组</option><option value="sector">所属板块</option></select>
          <select v-if="draftScope === 'stocks'" v-model="draftCodes" class="scope-multi-select" multiple title="可按 Command 或 Ctrl 选择多只股票"><option v-for="meta in metas" :key="meta.code" :value="meta.code">{{ meta.name }} {{ meta.code }}</option></select>
          <select v-else-if="draftScope === 'group'" v-model="draftGroupId"><option value="">选择分组</option><option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option></select>
          <select v-else-if="draftScope === 'sector'" v-model="draftSector"><option value="">选择板块</option><option v-for="sector in sectors" :key="sector" :value="sector">{{ sector }}</option></select>
          <span v-else class="rule-scope-hint">覆盖当前全部自选</span>
          <label v-if="needsThreshold" class="compact-input"><span>{{ thresholdLabel }}</span><input v-model.number="draftThreshold" type="number" step="0.01" /></label>
          <label class="compact-input"><span>冷却</span><input v-model.number="draftCooldownMinutes" type="number" min="1" max="1440" step="1" /><em>分</em></label>
          <button class="command-button primary" type="button" :disabled="!scopeValid" @click="saveRule"><component :is="editingRuleId ? Check : Plus" :size="14" />{{ editingRuleId ? '保存规则' : '创建规则' }}</button>
          <button v-if="editingRuleId" class="icon-button mini" type="button" title="取消编辑" @click="resetDraft"><X :size="13" /></button>
        </div>
        <div class="alert-rule-list">
          <div class="alert-table-head"><span>状态</span><span>提醒规则</span><span>范围</span><span>冷却</span><span>操作</span></div>
          <div v-if="!rules.length" class="manager-empty">暂无提醒规则</div>
          <div v-for="rule in rules" :key="rule.id" class="alert-rule-row">
            <label class="switch-control"><input type="checkbox" :checked="rule.enabled" @change="emit('toggle-rule', rule.id, !rule.enabled)" /><i /></label>
            <div><strong>{{ rule.name }}</strong><em>{{ ruleDescription(rule) }}</em></div>
            <span>{{ scopeLabel(rule) }}</span>
            <span>{{ Math.round((rule.cooldownMs ?? settings.defaultCooldownMs) / 60000) }} 分钟</span>
            <div class="rule-row-actions"><button class="icon-button mini" type="button" title="编辑规则" @click="editRule(rule)"><Pencil :size="13" /></button><button class="icon-button mini" type="button" title="删除规则" @click="emit('delete-rule', rule.id)"><Trash2 :size="13" /></button></div>
          </div>
        </div>
      </template>

      <template v-else-if="tab === 'history'">
        <div class="alert-history-toolbar"><label class="history-search"><input v-model.trim="historyQuery" type="search" placeholder="筛选股票、规则" /></label><select v-model="historyRuleId"><option value="">全部规则</option><option v-for="rule in rules" :key="rule.id" :value="rule.id">{{ rule.name }}</option></select><label class="history-unread"><input v-model="historyUnreadOnly" type="checkbox" />未读</label><span>{{ visibleEvents.length }} / {{ events.length }} 条</span><button class="command-button" type="button" :disabled="!unreadCount" @click="emit('mark-all-read')"><CheckCheck :size="14" />全部已读</button><button class="command-button" type="button" :disabled="!events.length" @click="emit('export-history', visibleEvents)">导出</button><button class="icon-button mini" type="button" title="清空提醒记录" :disabled="!events.length" @click="clearHistory"><Trash2 :size="13" /></button></div>
        <div class="alert-history-list">
          <div v-if="!visibleEvents.length" class="manager-empty">暂无符合条件的触发记录</div>
          <button v-for="event in visibleEvents" :key="event.id" type="button" class="alert-history-row" :class="{ unread: !event.readAt }" @click="openEvent(event)">
            <i :class="event.severity" />
            <div><strong>{{ event.instrumentName }} <em>{{ event.instrumentCode }}</em></strong><span>{{ event.message }}</span></div>
            <span>{{ formatValue(event) }}</span><time>{{ formatTime(event.occurredAt) }}</time>
          </button>
        </div>
      </template>

      <div v-else class="alert-settings-view">
        <label class="settings-line"><span><strong>启用提醒引擎</strong><em>关闭后保留规则和历史，但停止评估</em></span><input type="checkbox" :checked="settings.enabled" @change="updateBoolean('enabled', $event)" /></label>
        <label class="settings-line"><span><strong>系统通知</strong><em>仅 Electron 桌面端弹出，不影响应用内记录</em></span><input type="checkbox" :checked="settings.systemNotifications" @change="updateBoolean('systemNotifications', $event)" /></label>
        <label class="settings-line"><span><strong>静默时段</strong><em>静默期间记录事件，不弹系统通知</em></span><input type="checkbox" :checked="settings.quietHoursEnabled" @change="updateBoolean('quietHoursEnabled', $event)" /></label>
        <div class="settings-line"><span><strong>静默时间</strong><em>支持跨午夜</em></span><div class="quiet-time-inputs"><input type="time" :value="settings.quietStart" @change="updateText('quietStart', $event)" /><span>至</span><input type="time" :value="settings.quietEnd" @change="updateText('quietEnd', $event)" /></div></div>
        <label class="settings-line"><span><strong>默认冷却</strong><em>规则未单独配置时使用</em></span><div class="number-setting"><input type="number" min="1" max="1440" :value="Math.round(settings.defaultCooldownMs / 60000)" @change="updateCooldown" /><span>分钟</span></div></label>
      </div>

      <footer class="workspace-modal-footer"><span>提醒仅用于监盘辅助，不构成交易建议</span></footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check, CheckCheck, Pencil, Plus, Trash2, X } from '@lucide/vue';
import type { AlertHistoryItem, AlertRule, AlertRuleType, AlertSettings } from '@/types/alerts';
import type { StockMeta } from '@/types/market';
import type { WatchGroup } from '@/types/watchlist';

type CenterTab = 'rules' | 'history' | 'settings';
const props = defineProps<{ rules: AlertRule[]; events: AlertHistoryItem[]; settings: AlertSettings; metas: StockMeta[]; groups: WatchGroup[]; initialCode?: string }>();
const emit = defineEmits<{
  close: [];
  'create-rule': [rule: AlertRule];
  'update-rule': [rule: AlertRule];
  'toggle-rule': [id: string, enabled: boolean];
  'delete-rule': [id: string];
  'mark-read': [id: string];
  'mark-all-read': [];
  'clear-history': [];
  'export-history': [events: AlertHistoryItem[]];
  'select-stock': [code: string];
  'update-settings': [patch: Partial<AlertSettings>];
}>();

const tabs: Array<{ key: CenterTab; label: string }> = [{ key: 'rules', label: '规则' }, { key: 'history', label: '记录' }, { key: 'settings', label: '设置' }];
const ruleTypes: Array<{ key: AlertRuleType; label: string; threshold?: string; defaultValue?: number }> = [
  { key: 'priceAbove', label: '价格上破', threshold: '价格', defaultValue: 10 }, { key: 'priceBelow', label: '价格下破', threshold: '价格', defaultValue: 10 },
  { key: 'changePctAbove', label: '涨幅达到', threshold: '涨幅%', defaultValue: 5 }, { key: 'changePctBelow', label: '跌幅达到', threshold: '涨幅%', defaultValue: -5 },
  { key: 'volumeRatioAbove', label: '量比放大', threshold: '量比', defaultValue: 2 }, { key: 'amountAbove', label: '成交额达到', threshold: '亿元', defaultValue: 10 },
  { key: 'turnoverAbove', label: '换手率达到', threshold: '换手%', defaultValue: 10 }, { key: 'volumeSurge', label: '日线放量', threshold: '倍数', defaultValue: 2 },
  { key: 'maCrossUp', label: 'MA5 上穿 MA10' }, { key: 'maCrossDown', label: 'MA5 下穿 MA10' }, { key: 'limitOpen', label: '涨停开板' },
  { key: 'sectorChangeAbove', label: '所属板块异动', threshold: '涨幅%', defaultValue: 2 }
];

const tab = ref<CenterTab>('rules');
const draftType = ref<AlertRuleType>('priceAbove');
const draftScope = ref<'all' | 'stocks' | 'group' | 'sector'>(props.initialCode ? 'stocks' : 'all');
const draftCodes = ref<string[]>(props.initialCode ? [props.initialCode] : []);
const draftGroupId = ref('');
const draftSector = ref('');
const draftThreshold = ref(10);
const draftCooldownMinutes = ref(10);
const editingRuleId = ref<string | null>(null);
const historyQuery = ref('');
const historyRuleId = ref('');
const historyUnreadOnly = ref(false);
const currentType = computed(() => ruleTypes.find((item) => item.key === draftType.value)!);
const needsThreshold = computed(() => Boolean(currentType.value.threshold));
const thresholdLabel = computed(() => currentType.value.threshold ?? '阈值');
const unreadCount = computed(() => props.events.filter((event) => !event.readAt).length);
const enabledRuleCount = computed(() => props.rules.filter((rule) => rule.enabled).length);
const sectors = computed(() => [...new Set(props.metas.map((meta) => meta.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')));
const scopeValid = computed(() => draftScope.value === 'all' || (draftScope.value === 'stocks' && draftCodes.value.length > 0) || (draftScope.value === 'group' && Boolean(draftGroupId.value)) || (draftScope.value === 'sector' && Boolean(draftSector.value)));
const visibleEvents = computed(() => props.events.filter((event) => {
  if (historyRuleId.value && event.ruleId !== historyRuleId.value) return false;
  if (historyUnreadOnly.value && event.readAt) return false;
  const query = historyQuery.value.toLowerCase();
  return !query || `${event.instrumentName} ${event.instrumentCode} ${event.ruleName} ${event.message}`.toLowerCase().includes(query);
}));

watch(draftType, (type) => {
  draftThreshold.value = ruleTypes.find((item) => item.key === type)?.defaultValue ?? 0;
}, { flush: 'sync' });

function saveRule() {
  if (!scopeValid.value) return;
  const option = currentType.value;
  const existing = editingRuleId.value ? props.rules.find((rule) => rule.id === editingRuleId.value) : undefined;
  const base = {
    id: existing?.id ?? `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: option.label,
    type: draftType.value,
    enabled: existing?.enabled ?? true,
    instrumentCodes: draftScope.value === 'stocks' ? [...draftCodes.value] : undefined,
    groupIds: draftScope.value === 'group' ? [draftGroupId.value] : undefined,
    sectors: draftScope.value === 'sector' ? [draftSector.value] : undefined,
    cooldownMs: Math.max(1, draftCooldownMinutes.value) * 60_000,
    severity: draftType.value === 'limitOpen' ? 'critical' as const : existing?.severity ?? 'warning' as const
  };
  let rule: AlertRule;
  if (draftType.value === 'maCrossUp' || draftType.value === 'maCrossDown') rule = { ...base, type: draftType.value, fastPeriod: 5, slowPeriod: 10 };
  else if (draftType.value === 'limitOpen') rule = { ...base, type: 'limitOpen' };
  else if (draftType.value === 'volumeSurge') rule = { ...base, type: 'volumeSurge', threshold: Number(draftThreshold.value), lookbackDays: 5 };
  else {
    const threshold = draftType.value === 'amountAbove' ? Number(draftThreshold.value) * 100_000_000 : Number(draftThreshold.value);
    rule = { ...base, type: draftType.value, threshold } as AlertRule;
  }
  if (existing) emit('update-rule', rule);
  else emit('create-rule', rule);
  resetDraft();
}

function editRule(rule: AlertRule) {
  editingRuleId.value = rule.id;
  draftType.value = rule.type;
  draftCooldownMinutes.value = Math.max(1, Math.round((rule.cooldownMs ?? props.settings.defaultCooldownMs) / 60_000));
  draftThreshold.value = 'threshold' in rule ? (rule.type === 'amountAbove' ? rule.threshold / 100_000_000 : rule.threshold) : 0;
  draftCodes.value = [...(rule.instrumentCodes ?? [])];
  draftGroupId.value = rule.groupIds?.[0] ?? '';
  draftSector.value = rule.sectors?.[0] ?? '';
  draftScope.value = rule.groupIds?.length ? 'group' : rule.sectors?.length ? 'sector' : rule.instrumentCodes?.length ? 'stocks' : 'all';
  tab.value = 'rules';
}

function resetDraft() {
  editingRuleId.value = null;
  draftType.value = 'priceAbove';
  draftScope.value = props.initialCode ? 'stocks' : 'all';
  draftCodes.value = props.initialCode ? [props.initialCode] : [];
  draftGroupId.value = '';
  draftSector.value = '';
  draftThreshold.value = 10;
  draftCooldownMinutes.value = Math.max(1, Math.round(props.settings.defaultCooldownMs / 60_000));
}

function openEvent(event: AlertHistoryItem) {
  emit('mark-read', event.id);
  emit('select-stock', event.instrumentCode);
}

function scopeLabel(rule: AlertRule) {
  if (rule.groupIds?.length) return rule.groupIds.map((id) => props.groups.find((group) => group.id === id)?.name ?? id).join('、');
  if (rule.sectors?.length) return rule.sectors.join('、');
  if (!rule.instrumentCodes?.length) return '全部自选';
  return rule.instrumentCodes.map((code) => props.metas.find((meta) => meta.code === code)?.name ?? code).join('、');
}

function clearHistory() {
  if (window.confirm('清空全部提醒记录后无法恢复，是否继续？')) emit('clear-history');
}

function ruleDescription(rule: AlertRule) {
  if (rule.type === 'maCrossUp') return 'MA5 上穿 MA10';
  if (rule.type === 'maCrossDown') return 'MA5 下穿 MA10';
  if (rule.type === 'limitOpen') return '触及涨停后回落';
  if (!('threshold' in rule)) return '条件满足时触发';
  const value = rule.type === 'amountAbove' ? `${(rule.threshold / 100_000_000).toFixed(1)}亿元` : `${rule.threshold}`;
  return `${thresholdLabelFor(rule.type)} ${value}`;
}

function thresholdLabelFor(type: AlertRuleType) {
  return ruleTypes.find((item) => item.key === type)?.threshold ?? '阈值';
}

function formatValue(event: AlertHistoryItem) {
  if (event.ruleType === 'amountAbove') return `${(event.value / 100_000_000).toFixed(1)}亿`;
  if (event.ruleType.includes('Pct') || event.ruleType === 'turnoverAbove' || event.ruleType === 'sectorChangeAbove') return `${event.value.toFixed(2)}%`;
  return event.value.toFixed(event.value >= 100 ? 1 : 2);
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(timestamp);
}

function updateBoolean(key: 'enabled' | 'systemNotifications' | 'quietHoursEnabled', event: Event) {
  emit('update-settings', { [key]: (event.target as HTMLInputElement).checked });
}

function updateText(key: 'quietStart' | 'quietEnd', event: Event) {
  emit('update-settings', { [key]: (event.target as HTMLInputElement).value });
}

function updateCooldown(event: Event) {
  emit('update-settings', { defaultCooldownMs: Math.max(1, Number((event.target as HTMLInputElement).value) || 1) * 60_000 });
}
</script>
