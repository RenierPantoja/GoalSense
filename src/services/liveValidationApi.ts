/**
 * liveValidationApi (Phase B37) — client for live validation sessions.
 * ─────────────────────────────────────────────────────────────────────────────
 * Token-aware (Bearer when a session exists). Reads degrade honestly; mutating
 * calls surface tagged errors (403/disabled).
 */
import { apiFetch } from './apiClient'
import type {
  LiveValidationSessionDto, LiveValidationSessionFixtureDto, LiveValidationSessionEventDto,
  LiveValidationSessionSummaryDto, LiveValidationSessionReportDto, LiveValidationFixtureScopeDto, LiveValidationGoal,
} from '@/features/validation/liveValidationTypes'

const BASE = '/api/validation/live-sessions'

export interface CreateSessionPayload {
  name: string
  description?: string | null
  fixtureScope?: LiveValidationFixtureScopeDto
  goals?: LiveValidationGoal[]
}

export const liveValidationApi = {
  list() { return apiFetch<LiveValidationSessionDto[]>(BASE) },
  create(payload: CreateSessionPayload) { return apiFetch<LiveValidationSessionDto>(BASE, { method: 'POST', body: JSON.stringify(payload) }) },
  get(id: string) { return apiFetch<LiveValidationSessionDto>(`${BASE}/${encodeURIComponent(id)}`) },
  update(id: string, patch: Partial<CreateSessionPayload>) { return apiFetch<LiveValidationSessionDto>(`${BASE}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }) },
  start(id: string) { return apiFetch<{ session: LiveValidationSessionDto | null; attached: number; limitations: string[] }>(`${BASE}/${encodeURIComponent(id)}/start`, { method: 'POST', body: '{}' }) },
  pause(id: string) { return apiFetch<LiveValidationSessionDto>(`${BASE}/${encodeURIComponent(id)}/pause`, { method: 'POST', body: '{}' }) },
  resume(id: string) { return apiFetch<LiveValidationSessionDto>(`${BASE}/${encodeURIComponent(id)}/resume`, { method: 'POST', body: '{}' }) },
  complete(id: string) { return apiFetch<LiveValidationSessionDto>(`${BASE}/${encodeURIComponent(id)}/complete`, { method: 'POST', body: '{}' }) },
  cancel(id: string) { return apiFetch<LiveValidationSessionDto>(`${BASE}/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' }) },
  fixtures(id: string) { return apiFetch<LiveValidationSessionFixtureDto[]>(`${BASE}/${encodeURIComponent(id)}/fixtures`) },
  events(id: string) { return apiFetch<LiveValidationSessionEventDto[]>(`${BASE}/${encodeURIComponent(id)}/events`) },
  summary(id: string) { return apiFetch<LiveValidationSessionSummaryDto>(`${BASE}/${encodeURIComponent(id)}/summary`) },
  generateReport(id: string) { return apiFetch<LiveValidationSessionReportDto>(`${BASE}/${encodeURIComponent(id)}/report`, { method: 'POST', body: '{}' }) },
  getReport(id: string) { return apiFetch<LiveValidationSessionReportDto>(`${BASE}/${encodeURIComponent(id)}/report`) },
}
