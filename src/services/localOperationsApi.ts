/**
 * localOperationsApi (Phase B30) — client for the local operations panel.
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses the token-aware apiClient (Bearer when a session exists). Read endpoints
 * return null/[] honestly; controls surface tagged errors (403/disabled).
 */
import { apiFetch } from './apiClient'
import type {
  LocalOperationsStatusDto, ProviderUsageDto, SnapshotGuardDto, CoverageDto, WorkerDto,
} from '@/features/command/intelligence/localOperationsTypes'

const BASE = '/api/system/local-operations'

export const localOperationsApi = {
  getStatus() { return apiFetch<LocalOperationsStatusDto>(`${BASE}/status`) },
  getProviderUsage() { return apiFetch<ProviderUsageDto>(`${BASE}/provider-usage`) },
  getSnapshotGuard() { return apiFetch<SnapshotGuardDto>(`${BASE}/snapshot-guard`) },
  getCoverage() { return apiFetch<CoverageDto>(`${BASE}/coverage`) },
  getWorkers() { return apiFetch<WorkerDto[]>(`${BASE}/workers`) },
  pauseWorker(name: string) { return apiFetch<{ worker: string; paused: boolean }>(`${BASE}/workers/${encodeURIComponent(name)}/pause`, { method: 'POST', body: '{}' }) },
  resumeWorker(name: string) { return apiFetch<{ worker: string; paused: boolean }>(`${BASE}/workers/${encodeURIComponent(name)}/resume`, { method: 'POST', body: '{}' }) },
  resetGuardCounters() { return apiFetch<{ reset: boolean; note: string }>(`${BASE}/guards/reset-counters`, { method: 'POST', body: '{}' }) },
}
