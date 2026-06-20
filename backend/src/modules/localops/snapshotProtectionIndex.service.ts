/**
 * Snapshot Protection Index (Phase B32) — protect-first dependency resolution.
 * ─────────────────────────────────────────────────────────────────────────────
 * Decides whether a snapshot is protected from deletion. Because no per-snapshot
 * link exists from alerts/outcomes/backtest/replay/learning, protection is
 * derived conservatively from the fixture (has alerts?), the snapshot payload
 * (timed events = evidence), and age. When a dependency cannot be proven safe,
 * the snapshot is protected (`unknown_dependency`). Never invents a link.
 */
import type { Repositories } from '../../repositories/index.js'
import { deriveProtectionReasons, type ProtectionResult } from './utils/localOps.util.js'
import { findProtectedSnapshotsForSource } from '../intelligence/evidence/evidenceLineage.service.js'
import { env } from '../../env.js'

const DAY_MS = 24 * 60 * 60 * 1000

export interface ProtectionContext {
  /** Per-fixture alert presence, cached across a retention scan. */
  fixtureHasAlert: (fixtureId: string) => Promise<boolean>
}

/** Build a context with a per-fixture alert cache and conservative error handling. */
export function buildProtectionContext(repos: Repositories): ProtectionContext {
  const cache = new Map<string, boolean>()
  return {
    async fixtureHasAlert(fixtureId: string): Promise<boolean> {
      if (!fixtureId) return false
      if (cache.has(fixtureId)) return cache.get(fixtureId) as boolean
      let has = false
      try { const alerts = await repos.alerts.findByFixtureIds(fixtureId); has = Array.isArray(alerts) && alerts.length > 0 }
      catch { has = true /* on error, protect conservatively */ }
      cache.set(fixtureId, has)
      return has
    },
  }
}

function hasTimedEvents(snapshot: any): boolean {
  const raw = snapshot?.eventsJson
  if (!raw) return false
  try { const arr = JSON.parse(raw); return Array.isArray(arr) && arr.length > 0 } catch { return false }
}

export interface SnapshotProtection extends ProtectionResult {
  ageDays: number
  dependencyResolvable: boolean
  /** B33: precise evidence-link protection (exact/inferred), when available. */
  evidenceExactLink: boolean
  evidenceInferredLink: boolean
}

/**
 * Resolve protection for a single snapshot doc. `rawRetentionDays` defines the
 * "recent" window that always protects. B33: when the snapshot has a real id, its
 * exact/inferred evidence links take precedence — precise protection that lets
 * retention stop over-protecting every snapshot of a fixture.
 */
export async function resolveSnapshotProtection(
  snapshot: any,
  ctx: ProtectionContext,
  rawRetentionDays: number,
  now: number = Date.now(),
): Promise<SnapshotProtection> {
  const capturedAt = snapshot?.capturedAt ? new Date(snapshot.capturedAt).getTime() : now
  const ageDays = Math.max(0, (now - capturedAt) / DAY_MS)
  const fixtureId = String(snapshot?.fixtureId || '')
  const snapshotId = String(snapshot?.id || '')

  // Dependency resolvable only when we have a usable fixtureId and capturedAt.
  const dependencyResolvable = !!fixtureId && !!snapshot?.capturedAt

  // B33: precise evidence links by snapshotId (exact > inferred).
  const lineageOn = String(env.ENABLE_EVIDENCE_LINEAGE).toLowerCase() === 'true'
  let evidenceExactLink = false, evidenceInferredLink = false
  const evidenceReasons: string[] = []
  if (lineageOn && snapshotId) {
    try {
      const ev = await findProtectedSnapshotsForSource(snapshotId)
      evidenceExactLink = ev.hasExactLink
      evidenceInferredLink = ev.hasInferredLink
      evidenceReasons.push(...ev.protectionReasons)
    } catch { /* honest: fall through to conservative */ }
  }

  let linkedToAlert = false
  if (dependencyResolvable) {
    try { linkedToAlert = await ctx.fixtureHasAlert(fixtureId) } catch { linkedToAlert = true }
  }

  const result = deriveProtectionReasons({
    ageDays,
    rawRetentionDays,
    // Exact/inferred evidence links protect precisely; fixture-alert is the fallback.
    linkedToAlert: linkedToAlert || evidenceReasons.includes('linked_to_alert'),
    linkedToOutcome: linkedToAlert,
    linkedToBacktest: evidenceReasons.includes('linked_to_backtest'),
    linkedToReplay: evidenceReasons.includes('linked_to_replay'),
    linkedToLearning: evidenceReasons.includes('linked_to_learning'),
    linkedToPromotedAlert: evidenceReasons.includes('linked_to_promoted_alert'),
    manualProtected: evidenceReasons.includes('manual_protection'),
    hasImportantEvent: hasTimedEvents(snapshot),
    dependencyResolvable,
  })

  return { ...result, ageDays, dependencyResolvable, evidenceExactLink, evidenceInferredLink }
}
