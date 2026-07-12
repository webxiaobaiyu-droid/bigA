import type { MarketPhase } from '@/types/market';

interface ShanghaiClock {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
  seconds: number;
  dateKey: string;
}

const EXCHANGE_HOLIDAYS: Record<number, Record<string, string>> = {
  2026: {
    '2026-01-01': '元旦',
    '2026-01-02': '元旦',
    '2026-02-16': '春节',
    '2026-02-17': '春节',
    '2026-02-18': '春节',
    '2026-02-19': '春节',
    '2026-02-20': '春节',
    '2026-02-23': '春节',
    '2026-04-06': '清明节',
    '2026-05-01': '劳动节',
    '2026-05-04': '劳动节',
    '2026-05-05': '劳动节',
    '2026-06-19': '端午节',
    '2026-09-25': '中秋节',
    '2026-10-01': '国庆节',
    '2026-10-02': '国庆节',
    '2026-10-05': '国庆节',
    '2026-10-06': '国庆节',
    '2026-10-07': '国庆节'
  }
};

export function getAshareMarketPhase(now = new Date()): MarketPhase {
  const clock = shanghaiClock(now);
  const tradingDay = tradingDayInfo(clock);
  const nextTradeDate = findNextTradingDate(clock);

  if (!tradingDay.isTradingDay) {
    return {
      type: 'closed',
      label: '休市',
      shortLabel: '休',
      tradeDate: clock.dateKey,
      isTradingDay: false,
      calendarConfidence: tradingDay.confidence,
      reason: tradingDay.reason,
      nextTradeDate
    };
  }

  const base = {
    tradeDate: clock.dateKey,
    isTradingDay: true,
    calendarConfidence: tradingDay.confidence,
    nextTradeDate
  } as const;

  const clockSeconds = clock.minutes * 60 + clock.seconds;
  const at = (hour: number, minute: number) => (hour * 60 + minute) * 60;

  if (clockSeconds < at(9, 15)) {
    return { ...base, type: 'preopen', label: '盘前', shortLabel: '前', reason: '等待集合竞价', nextTransitionAt: shanghaiTimestamp(clock, 9, 15) };
  }
  if (clockSeconds < at(9, 25)) {
    return { ...base, type: 'auction', label: '集合竞价', shortLabel: '竞', reason: '开盘集合竞价', nextTransitionAt: shanghaiTimestamp(clock, 9, 25) };
  }
  if (clockSeconds < at(9, 30)) {
    return { ...base, type: 'preopen', label: '开盘前', shortLabel: '前', reason: '集合竞价撮合结束', nextTransitionAt: shanghaiTimestamp(clock, 9, 30) };
  }
  if (clockSeconds < at(11, 30)) {
    return { ...base, type: 'trading', label: '连续竞价', shortLabel: '盘', reason: '上午交易时段', nextTransitionAt: shanghaiTimestamp(clock, 11, 30) };
  }
  if (clockSeconds < at(13, 0)) {
    return { ...base, type: 'noon', label: '午间休盘', shortLabel: '午', reason: '午间休市', nextTransitionAt: shanghaiTimestamp(clock, 13, 0) };
  }
  if (clockSeconds < at(14, 57)) {
    return { ...base, type: 'trading', label: '连续竞价', shortLabel: '盘', reason: '下午交易时段', nextTransitionAt: shanghaiTimestamp(clock, 14, 57) };
  }
  if (clockSeconds < at(15, 0)) {
    return { ...base, type: 'auction', label: '收盘竞价', shortLabel: '竞', reason: '收盘集合竞价', nextTransitionAt: shanghaiTimestamp(clock, 15, 0) };
  }

  return { ...base, type: 'closed', label: '盘后', shortLabel: '后', reason: '当日交易结束' };
}

export function isAshareTradingDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return false;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !EXCHANGE_HOLIDAYS[year]?.[dateKey];
}

function tradingDayInfo(clock: ShanghaiClock) {
  if (clock.weekday === 0 || clock.weekday === 6) {
    return { isTradingDay: false, reason: '周末休市', confidence: calendarConfidence(clock.year) } as const;
  }
  const holiday = EXCHANGE_HOLIDAYS[clock.year]?.[clock.dateKey];
  if (holiday) {
    return { isTradingDay: false, reason: `${holiday}休市`, confidence: 'configured' as const };
  }
  return { isTradingDay: true, reason: '交易日', confidence: calendarConfidence(clock.year) } as const;
}

function calendarConfidence(year: number): MarketPhase['calendarConfidence'] {
  return EXCHANGE_HOLIDAYS[year] ? 'configured' : 'weekday-only';
}

function findNextTradingDate(clock: ShanghaiClock) {
  const start = Date.UTC(clock.year, clock.month - 1, clock.day);
  for (let offset = 1; offset <= 370; offset += 1) {
    const next = new Date(start + offset * 86_400_000);
    const key = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
    if (isAshareTradingDate(key)) return key;
  }
  return '';
}

function shanghaiClock(date: Date): ShanghaiClock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const year = Number(value('year'));
  const month = Number(value('month'));
  const day = Number(value('day'));
  const weekdayText = value('weekday');
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(value('hour'));
  const minute = Number(value('minute'));
  const second = Number(value('second'));
  return {
    year,
    month,
    day,
    weekday: weekdays[weekdayText] ?? new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    minutes: hour * 60 + minute,
    seconds: second,
    dateKey: `${year}-${pad(month)}-${pad(day)}`
  };
}

function shanghaiTimestamp(clock: ShanghaiClock, hour: number, minute: number) {
  return Date.UTC(clock.year, clock.month - 1, clock.day, hour - 8, minute);
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
