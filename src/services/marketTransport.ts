const inflightRequests = new Map<string, Promise<string>>();
const hostFailures = new Map<string, { count: number; openUntil: number }>();
const hostMetrics = new Map<string, HostTransportMetric>();
const transportDailyHistory = new Map<string, MarketTransportDailyMetric>();
const MARKET_TRANSPORT_HISTORY_STORAGE_KEY = 'biga.market-transport-history.v1';
let dailyHistoryLoaded = false;
const REQUEST_TIMEOUT_MS = 12_000;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 15_000;

interface HostTransportMetric {
  host: string;
  requests: number;
  successes: number;
  failures: number;
  retries: number;
  totalLatencyMs: number;
  lastLatencyMs: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string;
}

export interface MarketTransportStat {
  host: string;
  requests: number;
  successes: number;
  failures: number;
  retries: number;
  successRate: number;
  averageLatencyMs: number;
  lastLatencyMs: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string;
  circuitOpenUntil: number;
}

export interface MarketTransportDailyMetric {
  date: string;
  host: string;
  requests: number;
  successes: number;
  failures: number;
  retries: number;
  totalLatencyMs: number;
}

export interface MarketTransportDailyStat extends Omit<MarketTransportDailyMetric, 'totalLatencyMs'> {
  successRate: number;
  averageLatencyMs: number;
}

export interface MarketTransportDailySample {
  date: string;
  host: string;
  success: boolean;
  latencyMs: number;
  retries: number;
}

export function mergeMarketTransportDailyMetric(current: MarketTransportDailyMetric | undefined, sample: MarketTransportDailySample): MarketTransportDailyMetric {
  const base = current ?? { date: sample.date, host: sample.host, requests: 0, successes: 0, failures: 0, retries: 0, totalLatencyMs: 0 };
  return {
    ...base,
    requests: base.requests + 1,
    successes: base.successes + (sample.success ? 1 : 0),
    failures: base.failures + (sample.success ? 0 : 1),
    retries: base.retries + finiteNonNegative(sample.retries),
    totalLatencyMs: base.totalLatencyMs + (sample.success ? finiteNonNegative(sample.latencyMs) : 0)
  };
}

export function getMarketTransportStats(): MarketTransportStat[] {
  return [...hostMetrics.values()].map((metric) => ({
    host: metric.host,
    requests: metric.requests,
    successes: metric.successes,
    failures: metric.failures,
    retries: metric.retries,
    successRate: metric.requests ? (metric.successes / metric.requests) * 100 : 0,
    averageLatencyMs: metric.successes ? metric.totalLatencyMs / metric.successes : 0,
    lastLatencyMs: metric.lastLatencyMs,
    lastSuccessAt: metric.lastSuccessAt,
    lastFailureAt: metric.lastFailureAt,
    lastError: metric.lastError,
    circuitOpenUntil: hostFailures.get(metric.host)?.openUntil ?? 0
  })).sort((a, b) => b.requests - a.requests || a.host.localeCompare(b.host));
}

export function getMarketTransportHistory(host?: string): MarketTransportDailyStat[] {
  loadDailyHistory();
  return [...transportDailyHistory.values()]
    .filter((row) => !host || row.host === host)
    .map((row) => ({
      date: row.date,
      host: row.host,
      requests: row.requests,
      successes: row.successes,
      failures: row.failures,
      retries: row.retries,
      successRate: row.requests ? (row.successes / row.requests) * 100 : 0,
      averageLatencyMs: row.successes ? row.totalLatencyMs / row.successes : 0
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.host.localeCompare(b.host));
}

export async function fetchMarketText(url: string, encoding = 'utf-8') {
  const key = `${encoding}:${url}`;
  const inflight = inflightRequests.get(key);
  if (inflight) return inflight;

  const request = fetchWithPolicy(url, encoding).finally(() => {
    if (inflightRequests.get(key) === request) inflightRequests.delete(key);
  });
  inflightRequests.set(key, request);
  return request;
}

async function fetchWithPolicy(url: string, encoding: string) {
  const host = new URL(url).hostname;
  const startedAt = Date.now();
  const failure = hostFailures.get(host);
  if (failure && failure.openUntil > Date.now()) {
    recordTransportFailure(host, Date.now() - startedAt, 0, `Circuit open until ${new Date(failure.openUntil).toISOString()}`);
    throw new Error(`Market data circuit open: ${host}`);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await withTimeout(fetchMarketTextOnce(url, encoding), REQUEST_TIMEOUT_MS);
      if (!text.trim()) throw new Error(`Market data returned empty: ${host}`);
      hostFailures.delete(host);
      recordTransportSuccess(host, Date.now() - startedAt, attempt);
      return text;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await delay(180);
    }
  }

  const nextCount = (hostFailures.get(host)?.count ?? 0) + 1;
  hostFailures.set(host, {
    count: nextCount,
    openUntil: nextCount >= CIRCUIT_FAILURE_THRESHOLD ? Date.now() + CIRCUIT_OPEN_MS : 0
  });
  recordTransportFailure(host, Date.now() - startedAt, 1, lastError instanceof Error ? lastError.message : 'Unknown market transport error');
  throw lastError instanceof Error ? lastError : new Error(`Market data request failed: ${host}`);
}

function metricFor(host: string) {
  const existing = hostMetrics.get(host);
  if (existing) return existing;
  const metric: HostTransportMetric = { host, requests: 0, successes: 0, failures: 0, retries: 0, totalLatencyMs: 0, lastLatencyMs: 0, lastSuccessAt: null, lastFailureAt: null, lastError: '' };
  hostMetrics.set(host, metric);
  return metric;
}

function recordTransportSuccess(host: string, latencyMs: number, retries: number) {
  const metric = metricFor(host);
  metric.requests += 1;
  metric.successes += 1;
  metric.retries += retries;
  metric.totalLatencyMs += latencyMs;
  metric.lastLatencyMs = latencyMs;
  metric.lastSuccessAt = Date.now();
  metric.lastError = '';
  recordDailyQuality(host, true, latencyMs, retries);
}

function recordTransportFailure(host: string, latencyMs: number, retries: number, error: string) {
  const metric = metricFor(host);
  metric.requests += 1;
  metric.failures += 1;
  metric.retries += retries;
  metric.lastLatencyMs = latencyMs;
  metric.lastFailureAt = Date.now();
  metric.lastError = error.slice(0, 160);
  recordDailyQuality(host, false, latencyMs, retries);
}

function recordDailyQuality(host: string, success: boolean, latencyMs: number, retries: number) {
  loadDailyHistory();
  const date = shanghaiDateKey();
  const key = `${date}:${host}`;
  const row = mergeMarketTransportDailyMetric(transportDailyHistory.get(key), { date, host, success, latencyMs, retries });
  transportDailyHistory.set(key, row);
  persistDailyHistory();
}

function loadDailyHistory() {
  if (dailyHistoryLoaded) return;
  dailyHistoryLoaded = true;
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.parse(window.localStorage.getItem(MARKET_TRANSPORT_HISTORY_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return;
    raw.forEach((value) => {
      if (!value || typeof value !== 'object') return;
      const row = value as Partial<MarketTransportDailyMetric>;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date ?? '')) || !row.host) return;
      const requests = finiteNonNegative(row.requests);
      const successes = finiteNonNegative(row.successes);
      const failures = finiteNonNegative(row.failures);
      if (!requests || successes + failures > requests) return;
      const key = `${row.date}:${row.host}`;
      transportDailyHistory.set(key, {
        date: String(row.date), host: String(row.host), requests, successes, failures,
        retries: finiteNonNegative(row.retries), totalLatencyMs: finiteNonNegative(row.totalLatencyMs)
      });
    });
  } catch {
    // Historical diagnostics are optional and never block market requests.
  }
}

function persistDailyHistory() {
  if (typeof window === 'undefined') return;
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffKey = shanghaiDateKey(cutoff);
    const rows = [...transportDailyHistory.values()].filter((row) => row.date >= cutoffKey).sort((a, b) => a.date.localeCompare(b.date) || a.host.localeCompare(b.host));
    transportDailyHistory.clear();
    rows.forEach((row) => transportDailyHistory.set(`${row.date}:${row.host}`, row));
    window.localStorage.setItem(MARKET_TRANSPORT_HISTORY_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Diagnostics remain available for the current process when storage is unavailable.
  }
}

function shanghaiDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function finiteNonNegative(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

async function fetchMarketTextOnce(url: string, encoding: string) {
  if (window.bigA?.fetchMarketText) {
    return window.bigA.fetchMarketText(url, encoding);
  }

  const devProxyText = await fetchDevProxyMarketText(url, encoding);
  if (devProxyText !== null) {
    return devProxyText;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Market data request failed: ${response.status}`);
  }

  return response.text();
}

async function fetchDevProxyMarketText(url: string, encoding: string) {
  if (!import.meta.env.DEV || typeof window === 'undefined' || !window.location.origin) {
    return null;
  }

  try {
    const proxyUrl = new URL('/__biga_market', window.location.origin);
    proxyUrl.searchParams.set('url', url);
    proxyUrl.searchParams.set('encoding', encoding);

    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Market proxy failed: ${response.status}`);
    }

    return response.text();
  } catch (error) {
    throw error instanceof Error ? error : new Error('Market proxy request failed');
  }
}

function withTimeout<T>(request: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`Market data timed out after ${timeoutMs}ms`)), timeoutMs);
    request.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}
