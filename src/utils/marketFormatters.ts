import type { StockMeta } from '@/types/market';
import type { HotStockRow, SectorRow } from '@/types/sector';

export function marketForStockCode(code: string): StockMeta['market'] {
  if (code.startsWith('4') || code.startsWith('8') || code.startsWith('920')) return 'BJ';
  if (code.startsWith('5') || code.startsWith('6') || code.startsWith('9')) return 'SH';
  return 'SZ';
}

export function priceClass(value: number | null | undefined) {
  if ((value ?? 0) > 0) return 'up';
  if ((value ?? 0) < 0) return 'down';
  return '';
}

export function stockLimitPct(code: string, name = '') {
  const normalizedName = name.toUpperCase();
  if (normalizedName.startsWith('N') || normalizedName.startsWith('C')) {
    return null;
  }

  if (normalizedName.includes('ST')) {
    return 5;
  }

  if (code.startsWith('8') || code.startsWith('4') || code.startsWith('920')) {
    return 30;
  }

  if (code.startsWith('300') || code.startsWith('301') || code.startsWith('302') || code.startsWith('688') || code.startsWith('689')) {
    return 20;
  }

  return 10;
}

export function formatCandleDate(timestamp: number) {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function marketListTimeLabel(rows: Array<SectorRow | HotStockRow>) {
  const sourceUpdatedAt = Math.max(0, ...rows.map((row) => row.updatedAt));
  if (sourceUpdatedAt) return `行情 ${formatNewsTime(sourceUpdatedAt)}`;
  const fetchedAt = Math.max(0, ...rows.map((row) => row.fetchedAt));
  return fetchedAt ? `拉取 ${formatNewsTime(fetchedAt)}` : '无时间信息';
}

export function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  return value.toFixed(value >= 1000 ? 2 : 3);
}

export function formatPct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatSigned(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(value >= 100 ? 2 : 3)}`;
}

export function formatNullable(value: number | null | undefined, digits: number) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  return value.toFixed(digits);
}

export function formatAmount(value: number) {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs >= 100_000_000) {
    return `${sign}${(abs / 100_000_000).toFixed(1)}亿`;
  }

  if (abs >= 10_000) {
    return `${sign}${(abs / 10_000).toFixed(1)}万`;
  }

  return value.toFixed(0);
}

export function formatFinancialAmount(value: number | null) {
  return value === null ? '--' : formatAmount(value);
}

export function formatFinancialPct(value: number | null, signed = true) {
  if (value === null) {
    return '--';
  }
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatInteger(value: number | null) {
  return value === null ? '--' : Math.round(value).toLocaleString('zh-CN');
}

export function formatRegisteredCapital(value: number | null) {
  return value === null ? '--' : formatAmount(value * 10_000);
}

export function formatVolume(value: number) {
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(1)}万`;
  }

  return value.toFixed(0);
}

export function formatNewsTime(value: number | null) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  if (sameDay) {
    return time;
  }

  return `${date.getMonth() + 1}-${date.getDate()} ${time}`;
}

export function formatInfoDate(value: number | null) {
  if (!value) {
    return '--';
  }
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatAlertAge(timestamp: number, now = Date.now()) {
  const age = Math.max(0, now - timestamp);
  if (age < 60_000) return '刚刚';
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}分`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}时`;
  return `${Math.floor(age / 86_400_000)}天`;
}
