/**
 * Live Validation Attribution (Phase B38) — non-fatal session stamping.
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolves the active session for a fixture and returns the (optional) attribution
 * to stamp onto a record. NEVER alters results/scores; absence of a session is not
 * a failure; any error → no attribution (writers continue unchanged).
 */
import { getActiveSessionForFixture } from './liveValidationSessionContext.service.js'
import { recordSessionEvent, type RecordEventInput } from './liveValidationEventRecorder.service.js'

export interface SessionAttribution {
  validationSessionId: string
  sessionName: string
  sessionAttachedAt: string
}

/** Returns attribution for a fixture during an active session, or null. Never throws. */
export async function resolveSessionAttribution(fixtureId: string): Promise<SessionAttribution | null> {
  try {
    const ctx = await getActiveSessionForFixture(fixtureId)
    if (!ctx) return null
    return { validationSessionId: ctx.sessionId, sessionName: ctx.sessionName, sessionAttachedAt: new Date().toISOString() }
  } catch { return null }
}

/** Convenience: just the session id (or null). */
export async function resolveSessionIdForFixture(fixtureId: string): Promise<string | null> {
  const a = await resolveSessionAttribution(fixtureId)
  return a?.validationSessionId ?? null
}

/** Record a session event tied to a write (best-effort, never throws). */
export async function recordAttributionEvent(input: RecordEventInput): Promise<void> {
  try { await recordSessionEvent(input) } catch { /* non-fatal */ }
}
