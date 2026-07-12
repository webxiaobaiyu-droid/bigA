export type AppearanceMode = 'dark' | 'light';
export type AppearanceTheme = 'amber' | 'azure' | 'jade' | 'crimson';

export interface AppearanceSettings {
  mode: AppearanceMode;
  theme: AppearanceTheme;
}

export const APPEARANCE_STORAGE_KEY = 'biga.appearance.v1';
export const DEFAULT_APPEARANCE: AppearanceSettings = { mode: 'dark', theme: 'amber' };

export const APPEARANCE_THEMES: Array<{
  key: AppearanceTheme;
  name: string;
  description: string;
  color: string;
  bright: string;
  companion: string;
}> = [
  { key: 'amber', name: '金融金', description: '克制、醒目，适合长时间监盘', color: '#c99632', bright: '#efc663', companion: '#4e91b9' },
  { key: 'azure', name: '量化蓝', description: '清晰、理性，突出数据与结构', color: '#3f8fc9', bright: '#74b6e5', companion: '#c59a42' },
  { key: 'jade', name: '墨玉青', description: '沉静、低刺激，适合高密度列表', color: '#318d83', bright: '#64bbb0', companion: '#c79a47' },
  { key: 'crimson', name: '朱砂红', description: '敏锐、有力量，强调关键动作', color: '#b9575c', bright: '#df8589', companion: '#4d94b8' }
];

export function loadAppearance(): AppearanceSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_APPEARANCE };
  try {
    return normalizeAppearance(JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function applyAppearance(settings: AppearanceSettings, persist = true) {
  if (typeof document === 'undefined') return;
  const normalized = normalizeAppearance(settings);
  document.documentElement.dataset.mode = normalized.mode;
  document.documentElement.dataset.theme = normalized.theme;
  document.documentElement.style.colorScheme = normalized.mode;
  if (persist && typeof window !== 'undefined') {
    try { window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(normalized)); } catch { /* Keep the current session appearance. */ }
  }
  window.dispatchEvent(new CustomEvent('biga-theme-change', { detail: normalized }));
}

export function initializeAppearance() {
  const settings = loadAppearance();
  applyAppearance(settings, false);
  return settings;
}

export function normalizeAppearance(value: unknown): AppearanceSettings {
  const source = value && typeof value === 'object' ? value as Partial<AppearanceSettings> : {};
  const mode: AppearanceMode = source.mode === 'light' ? 'light' : 'dark';
  const theme = APPEARANCE_THEMES.some((item) => item.key === source.theme) ? source.theme as AppearanceTheme : DEFAULT_APPEARANCE.theme;
  return { mode, theme };
}

export interface ChartThemeTokens {
  text: string;
  muted: string;
  faint: string;
  border: string;
  grid: string;
  panel: string;
  elevated: string;
  tooltip: string;
  tooltipText: string;
  accent: string;
  accentBright: string;
  accentSoft: string;
  up: string;
  down: string;
  info: string;
}

export function chartThemeTokens(): ChartThemeTokens {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    text: read('--text-primary', '#e7e9ee'), muted: read('--text-muted', '#858d99'), faint: read('--text-faint', '#68717d'),
    border: read('--chart-border', 'rgba(255,255,255,.1)'), grid: read('--chart-grid', 'rgba(255,255,255,.045)'),
    panel: read('--bg-panel', '#14171b'), elevated: read('--bg-elevated', '#171a1f'), tooltip: read('--bg-tooltip', '#20242a'),
    tooltipText: read('--text-strong', '#eef1f5'), accent: read('--accent', '#c99632'), accentBright: read('--accent-bright', '#efc663'),
    accentSoft: read('--accent-soft', 'rgba(201,150,50,.15)'), up: read('--market-up', '#d94f4f'), down: read('--market-down', '#22a06b'), info: read('--info', '#4ea1d3')
  };
}
