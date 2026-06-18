/**
 * backtestApi — frontend client for the B14 Backtest & Replay endpoints.
 * ─────────────────────────────────────────────────────────────────────────────
 * Distinguishes 403 (ENABLE_BACKTEST_API off) from other errors so the UI can
 * show an honest "disabled" state. Never throws to the caller; returns a tagged
 * result. No mocks, no fake data.
 */
import { getBackendUrl } from './commandBackendClient'
import type {
  BacktestRun, BacktestRunConfig, BacktestSignalResult, ReplayRun,
} from '@/features/command/backtest/backtestTypes'

export interface ApiResult<T> {
  ok: boolean
  status: number
  data: T | null
  disabled: boolean
  error: string | null
}

function result<T>(partial: Partial<ApiResult<T>>): ApiResult<T> {
  return { ok: false, status: 0, data: null, disabled: false, error: null, ...partial }
}

async function request<T>(path: string, options?: RequestInit): Promise<ApiResult<T>> {
  const base = getBackendUrl()
  if (!base) return result<T>({ error: 'no_backend' })
  try {
    const res = await fetch(`${base}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    })
    if (res.status === 403) {
      let msg = 'Backtest desabilitado neste ambiente.'
      try { const j = await res.json(); msg = j?.error?.message || msg } catch { /* */ }
      return result<T>({ status: 403, disabled: true, error: msg })
    }
    if (!res.ok) {
      let msg = `Backend respondeu ${res.status}`
      try { const j = await res.json(); msg = j?.error?.message || msg } catch { /* */ }
      return result<T>({ status: res.status, error: msg })
    }
    const json = await res.json()
    return result<T>({ ok: true, status: res.status, data: json?.success ? json.data : null })
  } catch (e: any) {
    return result<T>({ error: e?.message || 'network_error' })
  }
}

export const backtestApi = {
  isBackendConfigured(): boolean { return getBackendUrl().length > 0 },

  runBacktest(config: BacktestRunConfig) {
    return request<BacktestRun>('/api/intelligence/backtest/run', { method: 'POST', body: JSON.stringify(config) })
  },
  listBacktestRuns(patternId?: string, limit = 50) {
    const qs = new URLSearchParams()
    if (patternId) qs.set('patternId', patternId)
    qs.set('limit', String(limit))
    return request<BacktestRun[]>(`/api/intelligence/backtest/runs?${qs.toString()}`)
  },
  getBacktestRun(runId: string) {
    return request<BacktestRun>(`/api/intelligence/backtest/runs/${encodeURIComponent(runId)}`)
  },
  getBacktestResults(runId: string, limit = 300) {
    return request<BacktestSignalResult[]>(`/api/intelligence/backtest/runs/${encodeURIComponent(runId)}/results?limit=${limit}`)
  },
  runReplay(patternId: string, fixtureId: string) {
    return request<ReplayRun>('/api/intelligence/replay/run', { method: 'POST', body: JSON.stringify({ patternId, fixtureId }) })
  },
  getReplayRun(runId: string) {
    return request<ReplayRun>(`/api/intelligence/replay/runs/${encodeURIComponent(runId)}`)
  },
  getReplayForPatternFixture(patternId: string, fixtureId: string) {
    return request<ReplayRun>(`/api/intelligence/replay/patterns/${encodeURIComponent(patternId)}/fixtures/${encodeURIComponent(fixtureId)}`)
  },
}
