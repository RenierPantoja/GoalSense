/**
 * commandBackendClient — frontend client for the GoalSense backend API.
 * ─────────────────────────────────────────────────────────────────────────────
 * If VITE_COMMAND_BACKEND_URL is not set, all functions return null/empty
 * and the frontend continues using localStorage as primary.
 *
 * No mocks. No fake data. Graceful degradation.
 */

const BACKEND_URL = import.meta.env.VITE_COMMAND_BACKEND_URL || ''

function isEnabled(): boolean {
  return BACKEND_URL.length > 0
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T | null> {
  if (!isEnabled()) return null
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
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
  if (!isEnabled()) return null
  const res = await fetch(`${BACKEND_URL}${path}`, {
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

export async function sendAlertToTelegram(alertId: string, channelId: string): Promise<any | null> {
  return fetchApiStrict(`/api/telegram/send-alert/${alertId}`, { method: 'POST', body: JSON.stringify({ channelId, confirm: true }) })
}
