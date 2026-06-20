/**
 * Live Validation Event Recorder (Phase B37) — compact, non-fatal timeline.
 * ─────────────────────────────────────────────────────────────────────────────
 * Records small operational events for a session. No tokens, no secrets, no giant
 * payloads. Recording never throws; failure to record never breaks anything.
 */
import { randomUUID } from 'node:crypto'
import { createRepositories } from '../../repositories/index.js'
import type { LiveValidationSessionEvent, LiveValidationEventType } from './liveValidation.types.js'

export interface RecordEventInput {
  sessionId: string
  type: LiveValidationEventType
  fixtureId?: string | null
  source?: string
  severity?: 'info' | 'warning' | 'critical'
  message: string
  metadata?: Record<string, unknown>
}

function sanitize(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (/token|secret|key|password|authorization/i.test(k)) continue
    if (v === undefined) continue
    if (typeof v === 'string' && v.length > 200) { out[k] = v.slice(0, 200); continue }
    out[k] = v
  }
  return out
}

export async function recordSessionEvent(input: RecordEventInput): Promise<LiveValidationSessionEvent | null> {
  try {
    const event: LiveValidationSessionEvent = {
      id: `lve_${randomUUID()}`,
      sessionId: input.sessionId,
      fixtureId: input.fixtureId ?? null,
      type: input.type,
      source: input.source || 'validation',
      severity: input.severity || 'info',
      message: String(input.message || '').slice(0, 240),
      metadata: sanitize(input.metadata),
      createdAt: new Date().toISOString(),
    }
    const repos = createRepositories()
    await repos.intelligence.createLiveValidationSessionEvent(event)
    return event
  } catch (e: any) {
    console.warn(`[B37] session event record failed (non-fatal): ${String(e?.message || e).slice(0, 80)}`)
    return null
  }
}
