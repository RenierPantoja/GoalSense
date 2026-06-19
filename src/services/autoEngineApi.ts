/**
 * autoEngineApi — frontend client for the B19 Auto Engine endpoints (B20 UI).
 * ─────────────────────────────────────────────────────────────────────────────
 * Distinguishes 403 (ENABLE_AUTO_ENGINE off) from other errors so the UI can show
 * an honest "disabled" state. Never throws to the caller; returns a tagged result.
 * Read endpoints return null/[] honestly. No mock, no invented opportunity, no odds.
 */
import { getBackendUrl } from './commandBackendClient'
import type {
  AutoEngineStatusDto, AutoEngineRunDto, AutoOpportunityDto,
  AutoEngineScanRequest, AutoOpportunityFilters,
  AutoOpportunityActionType, AutoOpportunityFeedbackType,
  AutoOpportunityActionDto, AutoOpportunityActionSummaryDto, AutoOpportunityPromotionPlanDto,
  AutoOpportunityFixtureContextDto, AutoOpportunitySearchFilters, AutoOpportunitySearchResponse,
  ActionMutationResponse,
  ManualAlertPromotionPreviewDto, ManualAlertPromotionRequestDto, ManualAlertPromotionResultDto,
  ManualPromotedAlertLinkDto,
  AutoOpportunityOutcomeSummaryDto, PromotedAlertOutcomeLinkDto, PromotedAlertListItemDto,
  PromotedAlertResolutionStatusDto,
} from '@/features/command/intelligence/autoEngineTypes'

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
      let msg = 'Motor Automático desabilitado neste ambiente.'
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

const BASE = '/api/intelligence/auto-engine'

function buildQuery(filters: Record<string, unknown>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export const autoEngineApi = {
  isBackendConfigured(): boolean { return getBackendUrl().length > 0 },

  getStatus() {
    return request<AutoEngineStatusDto>(`${BASE}/status`)
  },

  runScan(config: AutoEngineScanRequest = {}) {
    return request<AutoEngineRunDto>(`${BASE}/scan`, { method: 'POST', body: JSON.stringify(config) })
  },

  listRuns(limit = 50) {
    return request<AutoEngineRunDto[]>(`${BASE}/runs?limit=${limit}`)
  },

  getRun(runId: string) {
    return request<AutoEngineRunDto>(`${BASE}/runs/${encodeURIComponent(runId)}`)
  },

  /** Server-side filters honored by the backend: status, type, limit. The rest
   *  (league/team/score/band/dataQuality/blockReason/query) are applied client-side. */
  listOpportunities(filters: AutoOpportunityFilters = {}, limit = 200) {
    const q = buildQuery({ status: filters.status, type: filters.type, limit })
    return request<AutoOpportunityDto[]>(`${BASE}/opportunities${q}`)
  },

  getOpportunity(id: string) {
    return request<AutoOpportunityDto>(`${BASE}/opportunities/${encodeURIComponent(id)}`)
  },

  listFixtureOpportunities(fixtureId: string, limit = 50) {
    return request<AutoOpportunityDto[]>(`${BASE}/fixtures/${encodeURIComponent(fixtureId)}/opportunities?limit=${limit}`)
  },

  // ── B21: actions / feedback / notes / promotion / fixture context / search ──
  searchOpportunities(filters: AutoOpportunitySearchFilters = {}) {
    return request<AutoOpportunitySearchResponse>(`${BASE}/opportunities/search${buildQuery({ ...filters })}`)
  },

  getFixtureContext(fixtureId: string) {
    return request<AutoOpportunityFixtureContextDto>(`${BASE}/fixtures/${encodeURIComponent(fixtureId)}/context`)
  },

  createOpportunityAction(opportunityId: string, payload: { actionType: AutoOpportunityActionType; feedbackType?: AutoOpportunityFeedbackType; note?: string; reason?: string; metadata?: Record<string, unknown> }) {
    return request<ActionMutationResponse>(`${BASE}/opportunities/${encodeURIComponent(opportunityId)}/actions`, { method: 'POST', body: JSON.stringify(payload) })
  },

  listOpportunityActions(opportunityId: string, limit = 100) {
    return request<AutoOpportunityActionDto[]>(`${BASE}/opportunities/${encodeURIComponent(opportunityId)}/actions?limit=${limit}`)
  },

  getOpportunityActionSummary(opportunityId: string) {
    return request<AutoOpportunityActionSummaryDto>(`${BASE}/opportunities/${encodeURIComponent(opportunityId)}/action-summary`)
  },

  sendOpportunityFeedback(opportunityId: string, feedbackType: AutoOpportunityFeedbackType, note?: string) {
    return request<ActionMutationResponse>(`${BASE}/opportunities/${encodeURIComponent(opportunityId)}/feedback`, { method: 'POST', body: JSON.stringify({ feedbackType, note }) })
  },

  addOpportunityNote(opportunityId: string, note: string) {
    return request<ActionMutationResponse>(`${BASE}/opportunities/${encodeURIComponent(opportunityId)}/notes`, { method: 'POST', body: JSON.stringify({ note }) })
  },

  createPromotionPlan(opportunityId: string) {
    return request<AutoOpportunityPromotionPlanDto>(`${BASE}/opportunities/${encodeURIComponent(opportunityId)}/promotion-plan`, { method: 'POST', body: '{}' })
  },

  getPromotionPlan(opportunityId: string) {
    return request<AutoOpportunityPromotionPlanDto>(`${BASE}/opportunities/${encodeURIComponent(opportunityId)}/promotion-plan`)
  },

  // ── B22: manual opportunity → monitored alert ──
  getAlertPromotionPreview(opportunityId: string) {
    return request<ManualAlertPromotionPreviewDto>(`${BASE}/opportunities/${encodeURIComponent(opportunityId)}/alert-preview`)
  },

  promoteOpportunityToAlert(opportunityId: string, payload: ManualAlertPromotionRequestDto) {
    return request<ManualAlertPromotionResultDto>(`${BASE}/opportunities/${encodeURIComponent(opportunityId)}/promote-to-alert`, { method: 'POST', body: JSON.stringify(payload) })
  },

  getPromotedAlert(opportunityId: string) {
    return request<ManualPromotedAlertLinkDto>(`${BASE}/opportunities/${encodeURIComponent(opportunityId)}/promoted-alert`)
  },

  // ── B23: promoted alert resolution + opportunity outcome loop ──
  getOpportunityOutcomeSummary(opportunityId: string) {
    return request<AutoOpportunityOutcomeSummaryDto>(`${BASE}/opportunities/${encodeURIComponent(opportunityId)}/outcome-summary`)
  },

  getPromotedAlertOutcomeLink(alertId: string) {
    return request<PromotedAlertOutcomeLinkDto>(`${BASE}/promoted-alerts/${encodeURIComponent(alertId)}/outcome-link`)
  },

  listPromotedAlerts(limit = 100) {
    return request<PromotedAlertListItemDto[]>(`${BASE}/promoted-alerts?limit=${limit}`)
  },

  resolvePromotedAlertNow(alertId: string) {
    return request<PromotedAlertResolutionStatusDto>(`${BASE}/promoted-alerts/${encodeURIComponent(alertId)}/resolve-now`, { method: 'POST', body: JSON.stringify({}) })
  },
}
