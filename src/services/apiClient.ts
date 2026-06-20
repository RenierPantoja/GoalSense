/**
 * apiClient (Phase B27) — central token-aware fetch wrapper.
 * ─────────────────────────────────────────────────────────────────────────────
 * Attaches `Authorization: Bearer <token>` when a token provider yields one
 * (set by AuthProvider). No token in local mode. Classifies 401/403/429 into a
 * tagged result. NEVER logs the token. Supports authenticated blob/CSV download.
 */
import { getBackendUrl } from './commandBackendClient'
import { authHeaders, setAuthTokenProvider } from './authToken'

export { setAuthTokenProvider, authHeaders }

export type ApiErrorReason = 'unauthorized' | 'forbidden' | 'rate_limited' | 'env_gate' | 'network' | 'no_backend' | 'http' | null

export interface ApiResult<T> {
  ok: boolean
  status: number
  data: T | null
  error: string | null
  reason: ApiErrorReason
  retryAfterMs?: number
}

function classify(status: number, backendReason?: string | null): ApiErrorReason {
  if (status === 401) return 'unauthorized'
  if (status === 403) return backendReason === 'env_gate_disabled' ? 'env_gate' : 'forbidden'
  if (status === 429) return 'rate_limited'
  return status >= 400 ? 'http' : null
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<ApiResult<T>> {
  const base = getBackendUrl()
  if (!base) return { ok: false, status: 0, data: null, error: 'no_backend', reason: 'no_backend' }
  try {
    const res = await fetch(`${base}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options?.headers },
    })
    let body: any = null
    try { body = await res.json() } catch { /* non-JSON */ }
    if (!res.ok) {
      const backendReason = body?.error?.reason ?? null
      const retryAfterMs = body?.error?.retryAfterMs ?? (res.headers.get('Retry-After') ? Number(res.headers.get('Retry-After')) * 1000 : undefined)
      return { ok: false, status: res.status, data: null, error: body?.error?.message || `Backend respondeu ${res.status}`, reason: classify(res.status, backendReason), retryAfterMs }
    }
    return { ok: true, status: res.status, data: body?.success ? body.data : null, error: null, reason: null }
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: e?.message || 'network_error', reason: 'network' }
  }
}

/** Authenticated download (e.g. CSV). Returns a Blob or a tagged error. */
export async function downloadWithAuth(path: string, filename: string): Promise<ApiResult<true>> {
  const base = getBackendUrl()
  if (!base) return { ok: false, status: 0, data: null, error: 'no_backend', reason: 'no_backend' }
  try {
    const res = await fetch(`${base}${path}`, { headers: { ...authHeaders() } })
    if (!res.ok) {
      let backendReason: string | null = null
      try { backendReason = (await res.json())?.error?.reason ?? null } catch { /* */ }
      return { ok: false, status: res.status, data: null, error: `Backend respondeu ${res.status}`, reason: classify(res.status, backendReason) }
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; document.body.appendChild(a); a.click()
    a.remove(); URL.revokeObjectURL(url)
    return { ok: true, status: res.status, data: true, error: null, reason: null }
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: e?.message || 'network_error', reason: 'network' }
  }
}
