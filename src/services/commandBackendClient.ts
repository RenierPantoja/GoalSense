/**
 * commandBackendClient — frontend client for the GoalSense backend API.
 * ─────────────────────────────────────────────────────────────────────────────
 * Backend URL resolution (first match wins):
 *   1. localStorage 'goalsense_backend_url'  (runtime override — set on the
 *      deployed site to point at your LOCAL backend, no rebuild needed)
 *   2. import.meta.env.VITE_COMMAND_BACKEND_URL  (build-time, e.g. Vercel env)
 * If neither is set, all functions return null/empty and the frontend
 * continues using localStorage as primary.
 *
 * No mocks. No fake data. Graceful degradation.
 */

const RUNTIME_KEY = 'goalsense_backend_url'

/** Resolve the backend base URL at call time (runtime override > build env). */
function resolveBackendUrl(): string {
  try {
    const override = localStorage.getItem(RUNTIME_KEY)
    if (override && override.trim()) return override.trim().replace(/\/+$/, '')
  } catch { /* localStorage unavailable */ }
  return (import.meta.env.VITE_COMMAND_BACKEND_URL || '').replace(/\/+$/, '')
}

/** Set (or clear) the backend URL at runtime. Pass '' to clear the override. */
export function setBackendUrl(url: string): void {
  try {
    const clean = (url || '').trim().replace(/\/+$/, '')
    if (clean) localStorage.setItem(RUNTIME_KEY, clean)
    else localStorage.removeItem(RUNTIME_KEY)
  } catch { /* ignore */ }
}

/** Current resolved backend URL (empty string when not configured). */
export function getBackendUrl(): string {
  return resolveBackendUrl()
}

function isEnabled(): boolean {
  return resolveBackendUrl().length > 0
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T | null> {
  const base = resolveBackendUrl()
  if (!base) return null
  try {
    const res = await fetch(`${base}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.success ? json.data : null
  } catch {
    return null
  }
}

/** Like fetchApi but throws on HTTP errors (preserving status code). Used by write-through. */
async function fetchApiStrict<T>(path: string, options?: RequestInit): Promise<T | null> {
  const base = resolveBackendUrl()
  if (!base) return null
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!res.ok) {
    const err = new Error(`Backend responded ${res.status}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  const json = await res.json()
  return json.success ? json.data : null
}

// --- Health ---

export async function getBackendHealth(): Promise<{ status: string; uptime: number } | null> {
  return fetchApi('/api/health')
}

// --- Patterns ---

export async function listBackendPatterns(): Promise<any[] | null> {
  return fetchApi('/api/patterns')
}

export async function createBackendPattern(data: any): Promise<any | null> {
  return fetchApiStrict('/api/patterns', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateBackendPattern(id: string, data: any): Promise<any | null> {
  return fetchApiStrict(`/api/patterns/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteBackendPattern(id: string): Promise<any | null> {
  return fetchApiStrict(`/api/patterns/${id}`, { method: 'DELETE' })
}

// --- Alerts ---

export async function listBackendAlerts(filters?: { status?: string; limit?: number }): Promise<any[] | null> {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.limit) params.set('limit', String(filters.limit))
  const qs = params.toString()
  return fetchApi(`/api/alerts${qs ? `?${qs}` : ''}`)
}

export async function createBackendAlert(data: any): Promise<any | null> {
  return fetchApi('/api/alerts', { method: 'POST', body: JSON.stringify(data) })
}

export async function resolveBackendAlert(id: string, data: any): Promise<any | null> {
  return fetchApi(`/api/alerts/${id}/resolve`, { method: 'POST', body: JSON.stringify(data) })
}

// --- Status ---

export { isEnabled as isBackendEnabled }

// --- Performance ---

export async function getBackendPerformancePatterns(): Promise<any[] | null> {
  return fetchApi('/api/performance/patterns')
}

export async function getBackendPerformancePattern(patternId: string): Promise<any | null> {
  return fetchApi(`/api/performance/patterns/${patternId}`)
}

export async function getBackendPerformanceSummary(): Promise<any | null> {
  return fetchApi('/api/performance/summary')
}

// --- Live Monitor ---

export async function getLiveMonitorStatus(): Promise<any | null> {
  return fetchApi('/api/live-monitor/status')
}

// --- Worker Alerts (Read Mirror) ---

export async function getBackendAlerts(params?: { status?: string; source?: string; patternId?: string; limit?: number }): Promise<any[] | null> {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.patternId) qs.set('patternId', params.patternId)
  if (params?.limit) qs.set('limit', String(params.limit))
  const query = qs.toString()
  return fetchApi(`/api/alerts${query ? `?${query}` : ''}`)
}

export async function getBackendPatternWorkerStatus(): Promise<any | null> {
  return fetchApi('/api/pattern-worker/status')
}

export async function getBackendResolutionWorkerStatus(): Promise<any | null> {
  return fetchApi('/api/resolution-worker/status')
}

// --- Telegram ---

export async function getTelegramStatus(): Promise<any | null> {
  return fetchApi('/api/telegram/status')
}

export async function listTelegramChannels(): Promise<any[] | null> {
  return fetchApi('/api/telegram/channels')
}

export async function createTelegramChannel(data: { name: string; chatId: string; type?: string }): Promise<any | null> {
  return fetchApiStrict('/api/telegram/channels', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteTelegramChannel(id: string): Promise<any | null> {
  return fetchApiStrict(`/api/telegram/channels/${id}`, { method: 'DELETE' })
}

export async function updateTelegramChannelRules(channelId: string, rules: any): Promise<any | null> {
  return fetchApiStrict(`/api/telegram/channels/${channelId}/rules`, { method: 'PATCH', body: JSON.stringify({ rules }) })
}

export async function sendAlertToTelegram(alertId: string, channelId: string): Promise<any | null> {
  return fetchApiStrict(`/api/telegram/send-alert/${alertId}`, { method: 'POST', body: JSON.stringify({ channelId, confirm: true }) })
}

export async function getTelegramDeliveries(params?: { alertId?: string; limit?: number }): Promise<any[] | null> {
  const qs = new URLSearchParams()
  if (params?.alertId) qs.set('alertId', params.alertId)
  if (params?.limit) qs.set('limit', String(params.limit))
  const query = qs.toString()
  return fetchApi(`/api/telegram/deliveries${query ? `?${query}` : ''}`)
}

export async function getTelegramEligibility(alertId: string): Promise<any | null> {
  return fetchApi(`/api/telegram/eligibility/${alertId}`)
}

export async function getTelegramApprovalQueue(params?: { limit?: number; minConfidence?: number; status?: string; channelId?: string; onlyEligible?: boolean; source?: string }): Promise<any[] | null> {
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.minConfidence) qs.set('minConfidence', String(params.minConfidence))
  if (params?.status) qs.set('status', params.status)
  if (params?.channelId) qs.set('channelId', params.channelId)
  if (params?.onlyEligible) qs.set('onlyEligible', 'true')
  if (params?.source) qs.set('source', params.source)
  const query = qs.toString()
  return fetchApi(`/api/telegram/approval-queue${query ? `?${query}` : ''}`)
}

export async function approveTelegramQueueItem(alertId: string, channelId: string): Promise<any | null> {
  return fetchApiStrict(`/api/telegram/approval-queue/${alertId}/approve`, { method: 'POST', body: JSON.stringify({ channelId, confirm: true }) })
}

export async function ignoreTelegramQueueItem(alertId: string, channelId?: string, reason?: string): Promise<any | null> {
  return fetchApiStrict(`/api/telegram/approval-queue/${alertId}/ignore`, { method: 'POST', body: JSON.stringify({ channelId, reason }) })
}

// --- Odds Intelligence ---

export async function getOddsStatus(): Promise<any | null> {
  return fetchApi('/api/odds/status')
}

export async function getOddsForFixture(fixtureId: string): Promise<any | null> {
  return fetchApi(`/api/odds/fixture/${fixtureId}`)
}

export async function getOddsForAlert(alertId: string): Promise<any | null> {
  return fetchApi(`/api/odds/alert/${alertId}`)
}

export async function refreshOddsForAlert(alertId: string): Promise<any | null> {
  return fetchApiStrict(`/api/odds/alert/${alertId}/refresh`, { method: 'POST' })
}
