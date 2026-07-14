import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { createAlertRuntime, evaluateAlerts } from '@/services/alertEngine';
import type { AlertHistoryItem, AlertRule, AlertRuntime, AlertSettings } from '@/types/alerts';
import type { InstrumentState, MarketPhase } from '@/types/market';
import type { SectorRow } from '@/types/sector';
import type { WatchlistOrganization } from '@/types/watchlist';
import { downloadTextFile } from '@/utils/download';

const ALERT_STATE_STORAGE_KEY = 'biga.alert-state.v1';

interface UseAlertsOptions {
  selected: ComputedRef<InstrumentState | null>;
  sectorRows: Ref<SectorRow[]>;
  watchOrganization: Ref<WatchlistOrganization>;
  marketPhase: Ref<MarketPhase>;
}

interface StoredAlertState {
  settings?: Partial<AlertSettings>;
  runtime?: AlertRuntime;
  history?: AlertHistoryItem[];
  notificationAtByCode?: Record<string, number>;
}

export function useAlerts({ selected, sectorRows, watchOrganization, marketPhase }: UseAlertsOptions) {
  const initialState = loadAlertState();
  const alertCenterOpen = ref(false);
  const alertCenterInitialCode = ref('');
  const alertSettings = ref<AlertSettings>(initialState.settings);
  const alertRuntime = ref<AlertRuntime>(initialState.runtime);
  const alertHistory = ref<AlertHistoryItem[]>(initialState.history);
  const alertNotificationAtByCode = ref<Record<string, number>>(initialState.notificationAtByCode);
  let lastAlertPersistAt = 0;

  const unreadAlertCount = computed(() => alertHistory.value.filter((event) => !event.readAt).length);
  const latestAlertByCode = computed(() => {
    const latest = new Map<string, AlertHistoryItem>();
    alertHistory.value.forEach((event) => {
      if (!latest.has(event.instrumentCode)) latest.set(event.instrumentCode, event);
    });
    return latest;
  });
  const selectedLatestAlert = computed(() => {
    const code = selected.value?.meta.code;
    return code ? latestAlertByCode.value.get(code) ?? null : null;
  });
  const selectedAlertRuleCount = computed(() => {
    const code = selected.value?.meta.code;
    if (!code) return 0;
    return alertSettings.value.rules.filter((rule) => (
      rule.enabled && (!rule.instrumentCodes?.length || rule.instrumentCodes.includes(code))
    )).length;
  });

  function persistAlertState() {
    lastAlertPersistAt = Date.now();
    try {
      window.localStorage.setItem(ALERT_STATE_STORAGE_KEY, JSON.stringify({
        version: 1,
        settings: alertSettings.value,
        runtime: alertRuntime.value,
        history: alertHistory.value,
        notificationAtByCode: alertNotificationAtByCode.value
      }));
    } catch {
      // Alerts remain active for the current session when storage is unavailable.
    }
  }

  function removeAlertInstrument(code: string) {
    alertSettings.value = {
      ...alertSettings.value,
      rules: alertSettings.value.rules.flatMap((rule) => {
        if (!rule.instrumentCodes?.includes(code)) return [rule];
        const instrumentCodes = rule.instrumentCodes.filter((item) => item !== code);
        return instrumentCodes.length ? [{ ...rule, instrumentCodes } as AlertRule] : [];
      })
    };
  }

  function openAlertCenter(code = '') {
    alertCenterInitialCode.value = code;
    alertCenterOpen.value = true;
  }

  function createAlertRule(rule: AlertRule) {
    alertSettings.value = { ...alertSettings.value, rules: [...alertSettings.value.rules, rule] };
    persistAlertState();
  }

  function updateAlertRule(rule: AlertRule) {
    alertSettings.value = {
      ...alertSettings.value,
      rules: alertSettings.value.rules.map((item) => item.id === rule.id ? rule : item)
    };
    clearAlertRuntimeForRule(rule.id);
    persistAlertState();
  }

  function toggleAlertRule(id: string, enabled: boolean) {
    alertSettings.value = {
      ...alertSettings.value,
      rules: alertSettings.value.rules.map((rule) => rule.id === id ? { ...rule, enabled } : rule)
    };
    persistAlertState();
  }

  function deleteAlertRule(id: string) {
    alertSettings.value = {
      ...alertSettings.value,
      rules: alertSettings.value.rules.filter((rule) => rule.id !== id)
    };
    clearAlertRuntimeForRule(id);
    persistAlertState();
  }

  function updateAlertSettings(patch: Partial<AlertSettings>) {
    alertSettings.value = { ...alertSettings.value, ...patch, rules: alertSettings.value.rules };
    persistAlertState();
  }

  function markAlertRead(id: string) {
    const now = Date.now();
    alertHistory.value = alertHistory.value.map((event) => (
      event.id === id && !event.readAt ? { ...event, readAt: now } : event
    ));
    persistAlertState();
  }

  function markAllAlertsRead() {
    const now = Date.now();
    alertHistory.value = alertHistory.value.map((event) => event.readAt ? event : { ...event, readAt: now });
    persistAlertState();
  }

  function clearAlertHistory() {
    alertHistory.value = [];
    persistAlertState();
  }

  function exportAlertHistory(events: AlertHistoryItem[]) {
    const rows = [
      ['occurredAt', 'code', 'name', 'rule', 'value', 'threshold', 'severity', 'message', 'readAt'],
      ...events.map((event) => [
        new Date(event.occurredAt).toISOString(),
        event.instrumentCode,
        event.instrumentName,
        event.ruleName,
        String(event.value),
        event.threshold === undefined ? '' : String(event.threshold),
        event.severity,
        event.message,
        event.readAt ? new Date(event.readAt).toISOString() : ''
      ])
    ];
    const csv = rows
      .map((row) => row.map((value) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join(','))
      .join('\n');
    downloadTextFile(
      `BigA-alert-history-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
  }

  function evaluateSnapshotAlerts(instruments: InstrumentState[]) {
    if (!alertSettings.value.enabled || !marketPhaseAllowsAlerts(marketPhase.value.type)) return;

    const sectorChanges: Record<string, number> = Object.fromEntries(
      sectorRows.value.map((row) => [row.name, row.changePct])
    );
    instruments.forEach((instrument) => {
      if (sectorChanges[instrument.meta.sector] !== undefined) return;
      const key = normalizeSectorKey(instrument.meta.sector);
      const match = sectorRows.value.find((row) => {
        const rowKey = normalizeSectorKey(row.name);
        return rowKey === key || rowKey.includes(key) || key.includes(rowKey);
      });
      if (match) sectorChanges[instrument.meta.sector] = match.changePct;
    });

    const result = evaluateAlerts({
      instruments,
      rules: alertSettings.value.rules,
      runtime: alertRuntime.value,
      sectorChanges,
      groupIdsByInstrument: Object.fromEntries(
        watchOrganization.value.entries.map((entry) => [entry.code, entry.groupId])
      ),
      now: Date.now(),
      defaultCooldownMs: alertSettings.value.defaultCooldownMs
    });
    alertRuntime.value = result.runtime;

    if (!result.events.length) {
      if (Date.now() - lastAlertPersistAt >= 30_000) persistAlertState();
      return;
    }

    const events = result.events as AlertHistoryItem[];
    alertHistory.value = [...events, ...alertHistory.value].slice(0, alertSettings.value.maxHistory);
    events.forEach((event) => maybeShowSystemNotification(event));
    persistAlertState();
  }

  function clearAlertRuntimeForRule(ruleId: string) {
    const prefix = `${encodeURIComponent(ruleId)}::`;
    alertRuntime.value = {
      entries: Object.fromEntries(
        Object.entries(alertRuntime.value.entries).filter(([key]) => !key.startsWith(prefix))
      )
    };
  }

  function maybeShowSystemNotification(event: AlertHistoryItem) {
    if (!alertSettings.value.systemNotifications || isAlertQuietTime(new Date())) return;
    const lastAt = alertNotificationAtByCode.value[event.instrumentCode] ?? 0;
    if (event.occurredAt - lastAt < alertSettings.value.defaultCooldownMs) return;
    alertNotificationAtByCode.value = {
      ...alertNotificationAtByCode.value,
      [event.instrumentCode]: event.occurredAt
    };
    void window.bigA?.showNotification?.({
      title: `${event.instrumentName} · ${event.ruleName}`,
      body: event.message,
      code: event.instrumentCode
    });
  }

  function isAlertQuietTime(now: Date) {
    if (!alertSettings.value.quietHoursEnabled) return false;
    const current = now.getHours() * 60 + now.getMinutes();
    const start = timeTextToMinutes(alertSettings.value.quietStart);
    const end = timeTextToMinutes(alertSettings.value.quietEnd);
    return start === end || (start < end ? current >= start && current < end : current >= start || current < end);
  }

  return {
    alertCenterOpen,
    alertCenterInitialCode,
    alertSettings,
    alertRuntime,
    alertHistory,
    alertNotificationAtByCode,
    unreadAlertCount,
    latestAlertByCode,
    selectedLatestAlert,
    selectedAlertRuleCount,
    persistAlertState,
    removeAlertInstrument,
    openAlertCenter,
    createAlertRule,
    updateAlertRule,
    toggleAlertRule,
    deleteAlertRule,
    updateAlertSettings,
    markAlertRead,
    markAllAlertsRead,
    clearAlertHistory,
    exportAlertHistory,
    evaluateSnapshotAlerts
  };
}

function loadAlertState() {
  const defaults: AlertSettings = {
    enabled: true,
    defaultCooldownMs: 10 * 60_000,
    systemNotifications: true,
    quietHoursEnabled: true,
    quietStart: '22:30',
    quietEnd: '08:30',
    maxHistory: 500,
    rules: []
  };

  try {
    const raw = window.localStorage.getItem(ALERT_STATE_STORAGE_KEY);
    const value = raw ? JSON.parse(raw) as StoredAlertState : null;
    const rules = Array.isArray(value?.settings?.rules) ? value.settings.rules.filter(isStoredAlertRule) : [];
    return {
      settings: {
        ...defaults,
        ...value?.settings,
        rules,
        maxHistory: Math.min(2_000, Math.max(50, Number(value?.settings?.maxHistory) || defaults.maxHistory))
      },
      runtime: value?.runtime?.entries && typeof value.runtime.entries === 'object'
        ? value.runtime
        : createAlertRuntime(),
      history: Array.isArray(value?.history) ? value.history.filter(isStoredAlertHistory).slice(0, 2_000) : [],
      notificationAtByCode: value?.notificationAtByCode && typeof value.notificationAtByCode === 'object'
        ? value.notificationAtByCode
        : {}
    };
  } catch {
    return {
      settings: defaults,
      runtime: createAlertRuntime(),
      history: [] as AlertHistoryItem[],
      notificationAtByCode: {} as Record<string, number>
    };
  }
}

function isStoredAlertRule(value: unknown): value is AlertRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Partial<AlertRule>;
  return Boolean(rule.id && rule.name && rule.type);
}

function isStoredAlertHistory(value: unknown): value is AlertHistoryItem {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<AlertHistoryItem>;
  return Boolean(event.id && event.ruleId && event.instrumentCode && Number.isFinite(event.occurredAt));
}

function timeTextToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0;
}

function marketPhaseAllowsAlerts(type: string) {
  return type === 'trading' || type === 'auction';
}

function normalizeSectorKey(value: string) {
  return value.replace(/[ⅠⅡⅢIV\s板块概念行业]/gi, '').trim();
}
