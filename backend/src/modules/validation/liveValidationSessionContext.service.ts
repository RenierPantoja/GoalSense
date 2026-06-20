/**
 * Live Validation Session Context cache (Phase B38).
 * ─────────────────────────────────────────────────────────────────────────────
 * Cheap, TTL-cached view of the RUNNING session + its attached fixtures, so live
 * writers can resolve attribution without a Firestore read per write. Refresh is
 * best-effort; if it fails, attribution is simply absent (never blocks anything).
 */
import { env } from '../../env.js'
import { createRepositories } from '../../repositories/index.js'

export interface LiveValidationSessionContext {
  sessionId: string
  sessionName: string
  status: string
  startedAt: string | null
  guardMode: string
  localRuntimeProfile: string
  autoAttach: boolean
  broadScope: boolean
  attachedFixtureIds: Set<string>
  limitations: string[]
}

const flag = (v: unknown) => String(v).toLowerCase() === 'true'
const TTL_MS = 15_000
let cache: { ctx: LiveValidationSessionContext | null; at: number } = { ctx: null, at: 0 }

/** Invalidate the cache (call on any session lifecycle change). */
export function invalidateSessionContext(): void { cache = { ctx: null, at: 0 } }

async function refresh(): Promise<LiveValidationSessionContext | null> {
  if (!flag(env.ENABLE_LIVE_VALIDATION_SESSIONS)) return null
  const repos = createRepositories()
  let sessions: any[] = []
  try { sessions = await repos.intelligence.listLiveValidationSessions(100) } catch { return null }
  const running = sessions.find((s: any) => s.status === 'running')
  if (!running) return null
  const scope = running.fixtureScope || {}
  const broadScope = !((scope.fixtureIds?.length) || (scope.leagueNames?.length) || (scope.teamNames?.length))
  const attachedFixtureIds = new Set<string>()
  try {
    const fixtures = await repos.intelligence.listLiveValidationSessionFixtures(running.id, 500)
    for (const f of fixtures as any[]) if (f.fixtureId) attachedFixtureIds.add(String(f.fixtureId))
  } catch { /* honest: empty set */ }
  // Explicit fixtureIds in scope also count as attached targets.
  for (const fid of (scope.fixtureIds || [])) attachedFixtureIds.add(String(fid))
  return {
    sessionId: running.id, sessionName: running.name, status: running.status,
    startedAt: running.startedAt ?? null, guardMode: running.guardMode || String(env.LOCAL_OPS_GUARD_MODE),
    localRuntimeProfile: running.localRuntimeProfile || String(env.LOCAL_RUNTIME_PROFILE),
    autoAttach: flag(env.LIVE_VALIDATION_AUTO_ATTACH), broadScope, attachedFixtureIds, limitations: [],
  }
}

export async function getActiveSessionContext(): Promise<LiveValidationSessionContext | null> {
  const now = Date.now()
  if (cache.ctx !== null && now - cache.at < TTL_MS) return cache.ctx
  if (cache.ctx === null && now - cache.at < TTL_MS) return null // cache a recent "none" too
  try { const ctx = await refresh(); cache = { ctx, at: Date.now() }; return ctx }
  catch { cache = { ctx: null, at: Date.now() }; return null }
}

/** Resolve the validation session that should claim a write for this fixture. */
export async function getActiveSessionForFixture(fixtureId: string): Promise<LiveValidationSessionContext | null> {
  const ctx = await getActiveSessionContext()
  if (!ctx || ctx.status !== 'running' || !ctx.autoAttach) return null
  if (ctx.broadScope) return ctx
  if (fixtureId && ctx.attachedFixtureIds.has(String(fixtureId))) return ctx
  return null
}
