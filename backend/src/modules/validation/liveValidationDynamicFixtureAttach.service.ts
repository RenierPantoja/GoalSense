/**
 * Live Validation Dynamic Fixture Attach (Phase B39) — attach games going live mid-session.
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-scans ALREADY-collected live data (via the read-only discovery service) for a
 * running session and attaches newly-eligible fixtures that match the session scope
 * but were not present at start. NEVER calls a provider unless explicitly enabled,
 * never invents fixtures, respects the local fixture cap and a per-run cap. Each run
 * is recorded as a DynamicFixtureAttachRun. Coverage-absent is a limitation, not a
 * failure. Attaching invalidates the session context cache so attribution sees it.
 */
import { env } from '../../env.js'
import { createRepositories } from '../../repositories/index.js'
import { discoverSessionFixtures } from './liveValidationFixtureDiscovery.service.js'
import { recordSessionEvent } from './liveValidationEventRecorder.service.js'
import { invalidateSessionContext } from './liveValidationSessionContext.service.js'
import { listActiveSessions, getSession } from './liveValidation.service.js'
import type { LiveValidationSession, LiveValidationSessionFixture } from './liveValidation.types.js'
import type { DynamicFixtureAttachRun } from './liveValidationIndex.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'
export function isDynamicAttachEnabled(): boolean { return flag(env.ENABLE_LIVE_VALIDATION_DYNAMIC_ATTACH) }

function runId(sessionId: string): string { return `dfar_${sessionId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` }

/** Run dynamic attach for ONE running session. Non-fatal; returns the recorded run. */
export async function runDynamicAttachForSession(sessionId: string): Promise<DynamicFixtureAttachRun> {
  const repos = createRepositories()
  const startedAt = new Date().toISOString()
  const run: DynamicFixtureAttachRun = {
    id: runId(sessionId), validationSessionId: sessionId, startedAt, completedAt: null,
    scannedFixtures: 0, matchedFixtures: 0, attachedFixtures: 0, skippedFixtures: 0,
    providerCallsBlocked: 0, limitations: [], status: 'completed',
  }
  if (!isDynamicAttachEnabled()) {
    run.completedAt = new Date().toISOString(); run.status = 'completed_with_limitations'
    run.limitations.push('Anexação dinâmica desabilitada (ENABLE_LIVE_VALIDATION_DYNAMIC_ATTACH=false).')
    try { await repos.intelligence.createDynamicFixtureAttachRun(run) } catch { /* non-fatal */ }
    return run
  }
  try {
    const session = await getSession(sessionId)
    if (!session || session.status !== 'running') {
      run.limitations.push('Sessão não está running — nada a anexar.')
      run.completedAt = new Date().toISOString(); run.status = 'completed_with_limitations'
      try { await repos.intelligence.createDynamicFixtureAttachRun(run) } catch { /* non-fatal */ }
      return run
    }

    // Read-only discovery from already-collected data. Provider lookup stays off unless enabled.
    if (!flag(env.LIVE_VALIDATION_DYNAMIC_ATTACH_PROVIDER_LOOKUP)) {
      // Discovery never calls a provider; record that we intentionally skipped any provider call.
      run.providerCallsBlocked += 0
    }
    const disc = await discoverSessionFixtures(session.fixtureScope)
    run.limitations.push(...disc.limitations)
    run.scannedFixtures = disc.fixtures.length

    const existing = await repos.intelligence.listLiveValidationSessionFixtures(sessionId, 1000).catch(() => [])
    const existingIds = new Set((existing as LiveValidationSessionFixture[]).map(f => f.fixtureId))
    const cap = Math.min(session.fixtureScope?.maxFixtures ?? env.LOCAL_MAX_LIVE_FIXTURES, env.LOCAL_MAX_LIVE_FIXTURES)
    const perRunCap = Math.max(1, Number(env.LIVE_VALIDATION_DYNAMIC_ATTACH_MAX_PER_RUN) || 20)

    const candidates = disc.fixtures.filter(d => !existingIds.has(d.fixtureId))
    run.matchedFixtures = candidates.length

    let attached = 0
    for (const d of candidates) {
      if (existingIds.size + attached >= cap) { run.skippedFixtures++; run.limitations.push(`Cap local de ${cap} jogos atingido — fixture ${d.fixtureId} não anexada (guard B31).`); continue }
      if (attached >= perRunCap) { run.skippedFixtures++; run.limitations.push(`Limite por execução (${perRunCap}) atingido — restantes adiados para a próxima varredura.`); break }
      const fixture: LiveValidationSessionFixture = {
        id: `lvf_${sessionId}_${d.fixtureId}`, sessionId, fixtureId: d.fixtureId,
        providerFixtureId: d.providerFixtureId, homeTeam: d.homeTeam, awayTeam: d.awayTeam,
        competition: d.competition, kickoffAt: d.kickoffAt, status: d.status, includedAt: new Date().toISOString(),
        coverageStatus: 'unknown', snapshotCount: 0, signalCount: 0, alertCount: 0, opportunityCount: 0, outcomeCount: 0,
        providerQuality: 'unknown', limitations: ['Anexada dinamicamente (entrou ao vivo durante a sessão).'],
      }
      try {
        await repos.intelligence.addLiveValidationSessionFixture(fixture)
        attached++
        void recordSessionEvent({ sessionId, type: 'fixture_attached', fixtureId: d.fixtureId, message: `Fixture anexada dinamicamente: ${d.homeTeam} vs ${d.awayTeam}`, metadata: { dynamic: true } })
      } catch { run.skippedFixtures++ }
    }
    run.attachedFixtures = attached
    if (attached > 0) invalidateSessionContext()
    if (run.limitations.length > 0) run.status = 'completed_with_limitations'
  } catch (e: any) {
    run.status = 'failed_non_fatal'
    run.limitations.push(`Falha não-fatal na anexação dinâmica: ${String(e?.message || e).slice(0, 80)}`)
  }
  run.completedAt = new Date().toISOString()
  try { await repos.intelligence.createDynamicFixtureAttachRun(run) } catch { /* non-fatal */ }
  return run
}

/** Run dynamic attach for ALL running sessions (scheduler entry). */
export async function runDynamicAttachAllSessions(): Promise<{ sessions: number; attached: number }> {
  if (!isDynamicAttachEnabled()) return { sessions: 0, attached: 0 }
  const running = (await listActiveSessions().catch(() => [] as LiveValidationSession[])).filter(s => s.status === 'running')
  let attached = 0
  for (const s of running) {
    try { const run = await runDynamicAttachForSession(s.id); attached += run.attachedFixtures } catch { /* non-fatal */ }
  }
  return { sessions: running.length, attached }
}

export async function listAttachRuns(sessionId: string, limit = 50): Promise<DynamicFixtureAttachRun[]> {
  try { return await createRepositories().intelligence.listDynamicFixtureAttachRuns(sessionId, limit) } catch { return [] }
}

export async function getAttachRun(id: string): Promise<DynamicFixtureAttachRun | null> {
  try { return await createRepositories().intelligence.getDynamicFixtureAttachRun(id) } catch { return null }
}
