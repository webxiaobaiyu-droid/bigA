import type { InstrumentState, MarketPhase } from '@/types/market';

export type MarketDataHealthState = 'live' | 'delayed' | 'stale' | 'fallback' | 'error' | 'idle' | 'closed';

export interface MarketDataHealth {
  state: MarketDataHealthState;
  label: string;
  detail: string;
  latestAt: number;
  ageMs: number | null;
}

export function assessMarketDataHealth(
  rows: InstrumentState[],
  sourceLabel: string,
  phase: MarketPhase,
  now = Date.now()
): MarketDataHealth {
  const latestAt = Math.max(0, ...rows.map((row) => row.quote.updatedAt || 0));
  const ageMs = latestAt ? Math.max(0, now - latestAt) : null;

  if (/不可用|失败|错误/.test(sourceLabel)) {
    return health('error', sourceLabel, `行情请求异常；${latestDescription(latestAt)}`, latestAt, ageMs);
  }
  if (!rows.length || !latestAt) {
    return health('idle', sourceLabel || '待接入', phase.isTradingDay ? '尚未收到有效行情' : phase.reason, latestAt, ageMs);
  }
  if (/兜底|回退|模拟/.test(sourceLabel)) {
    return health('fallback', sourceLabel, `当前使用回退数据；${latestDescription(latestAt)}`, latestAt, ageMs);
  }
  if (phase.type !== 'trading') {
    return health('closed', sourceLabel, `${phase.reason}；${latestDescription(latestAt)}`, latestAt, ageMs);
  }
  if ((ageMs ?? Infinity) <= 15_000) {
    return health('live', sourceLabel, `实时行情；${latestDescription(latestAt)}`, latestAt, ageMs);
  }
  if ((ageMs ?? Infinity) <= 60_000) {
    return health('delayed', sourceLabel, `行情延迟 ${formatAge(ageMs)}；${latestDescription(latestAt)}`, latestAt, ageMs);
  }
  return health('stale', sourceLabel, `行情已陈旧 ${formatAge(ageMs)}；${latestDescription(latestAt)}`, latestAt, ageMs);
}

function health(state: MarketDataHealthState, label: string, detail: string, latestAt: number, ageMs: number | null): MarketDataHealth {
  return { state, label, detail, latestAt, ageMs };
}

function latestDescription(timestamp: number) {
  if (!timestamp) return '无有效更新时间';
  return `最近数据 ${new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(timestamp)}`;
}

function formatAge(ageMs: number | null) {
  if (ageMs === null) return '--';
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}秒`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}分钟`;
  return `${Math.round(ageMs / 3_600_000)}小时`;
}
