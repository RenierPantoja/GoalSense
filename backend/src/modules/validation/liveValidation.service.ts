/**
 * Live Validation Service (Phase B37) — session lifecycle + scope, observational.
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates/controls validation sessions. NEVER starts workers, never changes guard
 * mode/env, never alters results. Single running session by default. Cancel does
 * not delete data. All failures are non-fatal.
 */
import { randomUUID } from 'node:crypto'
import { env } from '../../env.js'
import { createRepositories } from '../../repositories/index.js'
import { discoverSessionFixtures } from './liveValidationFixtureDiscovery.service.js'
import { recordSessionEvent } from './liveValidationEventRecorder.service.js'
import { buildSessionSummary, buildSessionReport } from './liveValidationReport.service.js'
import { invalidateSessionContext } from './liveValidationSessionContext.service.js'
import type {
  LiveValidationSession, LiveValidationSessionStatus, CreateSessionInput, LiveValidationSessionFixture,
} from './liveValidation.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export function isSessionsEnabled(): boolean { return flag(env.ENABLE_LIVE_VALIDATION_SESSIONS) }
function allowMultiple(): boolean { return flag(env.LIVE_VALIDATION_ALLOW_MULTIPLE_RUNNING) }
function guardMode(): string { return String(env.LOCAL_OPS_GUARD_MODE) }

export async function listSessions(limit = 50): Promise<LiveValidationSession[]> {
  const repos = createRepositories()
  try { return await repos.intelligence.listLiveValidationSessions(limit) } catch { return [] }
}
export async function getSession(id: string): Promise<LiveValidationSession | null> {
  const repos = createRepositories()
  try { return await repos.intelligence.getLiveValidationSession(id) } catch { return null }
}
export async function listActiveSessions(): Promise<LiveValidationSession[]> {
  return (await listSessions(100)).filter(s => s.status === 'running' || s.status === 'paused')
}
export async function getCurrentSessionContext(): Promise<LiveValidationSession | null> {
  return (await listActiveSessions()).find(s => s.status === 'running') ?? null
}

export async function createSession(input: CreateSessionInput): Promise<LiveValidationSession> {
  const repos = createRepositories()
  const now = new Date().toISOString()
  const session: LiveValidationSession = {
    id: `lvs_${randomUUID()}`,
    name: input.name || 'Sessão de validação',
    description: input.description ?? null,
    status: 'draft',
    createdAt: now, startedAt: null, pausedAt: null, completedAt: null, cancelledAt: null,
    createdBy: input.createdBy ?? null,
    provider: 'espn', appEnv: String(env.APP_ENV), localRuntimeProfile: String(env.LOCAL_RUNTIME_PROFILE), guardMode: guardMode(),
    fixtureScope: input.fixtureScope ?? {},
    goals: input.goals ?? [],
    notes: [], summary: null, limitations: [],
  }
  await repos.intelligence.createLiveValidationSession(session)
  return session
}

export async function updateSession(id: string, patch: Partial<LiveValidationSession>): Promise<LiveValidationSession | null> {
  const repos = createRepositories()
  // Never allow patching computed/lifecycle-only fields through here.
  const safe: Partial<LiveValidationSession> = {}
  if (patch.name !== undefined) safe.name = patch.name
  if (patch.description !== undefined) safe.description = patch.description
  if (patch.fixtureScope !== undefined) safe.fixtureScope = patch.fixtureScope
  if (patch.goals !== undefined) safe.goals = patch.goals
  if (patch.notes !== undefined) safe.notes = patch.notes
  await repos.intelligence.updateLiveValidationSession(id, safe)
  return getSession(id)
}

async function setStatus(id: string, status: LiveValidationSessionStatus, stamp: Partial<LiveValidationSession>): Promise<LiveValidationSession | null> {
  const repos = createRepositories()
  await repos.intelligence.updateLiveValidationSession(id, { status, ...stamp })
  invalidateSessionContext()
  return getSession(id)
}

export interface StartResult { session: LiveValidationSession | null; attached: number; limitations: string[] }

export async function startSession(id: string): Promise<StartResult> {
  const repos = createRepositories()
  const session = await getSession(id)
  if (!session) return { session: null, attached: 0, limitations: ['session_not_found'] }
  const limitations: string[] = []
  if (!allowMultiple()) {
    const running = (await listActiveSessions()).filter(s => s.status === 'running' && s.id !== id)
    if (running.length > 0) {
      limitations.push(`Já existe sessão running (${running[0].id}). Conclua/pause antes, ou habilite LIVE_VALIDATION_ALLOW_MULTIPLE_RUNNING.`)
      return { session, attached: 0, limitations }
    }
  }
  // Discover + attach fixtures (read-only, guard-respecting).
  let attached = 0
  if (flag(env.LIVE_VALIDATION_AUTO_ATTACH)) {
    const disc = await discoverSessionFixtures(session.fixtureScope)
    limitations.push(...disc.limitations)
    for (const d of disc.fixtures) {
      const fixture: LiveValidationSessionFixture = {
        id: `lvf_${session.id}_${d.fixtureId}`, sessionId: session.id, fixtureId: d.fixtureId,
        providerFixtureId: d.providerFixtureId, homeTeam: d.homeTeam, awayTeam: d.awayTeam,
        competition: d.competition, kickoffAt: d.kickoffAt, status: d.status, includedAt: new Date().toISOString(),
        coverageStatus: 'unknown', snapshotCount: 0, signalCount: 0, alertCount: 0, opportunityCount: 0, outcomeCount: 0,
        providerQuality: 'unknown', limitations: [],
      }
      try { await repos.intelligence.addLiveValidationSessionFixture(fixture); attached++; void recordSessionEvent({ sessionId: session.id, type: 'fixture_attached', fixtureId: d.fixtureId, message: `Fixture anexada: ${d.homeTeam} vs ${d.awayTeam}` }) }
      catch { /* non-fatal */ }
    }
  }
  const status: LiveValidationSessionStatus = limitations.some(l => l.includes('cobertura ausente')) || attached === 0 ? 'running' : 'running'
  const updated = await setStatus(id, status, { startedAt: new Date().toISOString() })
  void recordSessionEvent({ sessionId: id, type: 'session_started', message: `Sessão iniciada (perfil ${env.LOCAL_RUNTIME_PROFILE}, guard ${guardMode()}, ${attached} fixtures).`, metadata: { attached } })
  if (limitations.length > 0 && updated) { await repos.intelligence.updateLiveValidationSession(id, { limitations }) }
  return { session: updated, attached, limitations }
}

export async function pauseSession(id: string): Promise<LiveValidationSession | null> {
  void recordSessionEvent({ sessionId: id, type: 'session_paused', message: 'Sessão pausada (não pausa workers globais).' })
  return setStatus(id, 'paused', { pausedAt: new Date().toISOString() })
}
export async function resumeSession(id: string): Promise<LiveValidationSession | null> {
  void recordSessionEvent({ sessionId: id, type: 'session_resumed', message: 'Sessão retomada.' })
  return setStatus(id, 'running', {})
}
export async function cancelSession(id: string): Promise<LiveValidationSession | null> {
  void recordSessionEvent({ sessionId: id, type: 'session_cancelled', message: 'Sessão cancelada (dados preservados).' })
  return setStatus(id, 'cancelled', { cancelledAt: new Date().toISOString() })
}

export async function completeSession(id: string): Promise<LiveValidationSession | null> {
  const repos = createRepositories()
  const session = await getSession(id)
  if (!session) return null
  let summary = null
  try { summary = await buildSessionSummary(session) } catch { /* non-fatal */ }
  await repos.intelligence.updateLiveValidationSession(id, { status: 'completed', completedAt: new Date().toISOString(), summary: summary ?? undefined })
  invalidateSessionContext()
  void recordSessionEvent({ sessionId: id, type: 'session_completed', message: 'Sessão concluída — relatório disponível.' })
  // Generate + persist the report.
  try { await buildSessionReport({ ...session, status: 'completed', summary }) } catch { /* non-fatal */ }
  return getSession(id)
}

export { buildSessionSummary, buildSessionReport }
