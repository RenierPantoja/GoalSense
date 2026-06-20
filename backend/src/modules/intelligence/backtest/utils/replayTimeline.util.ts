/**
 * Replay timeline ordering (Phase B14) — pure.
 * ─────────────────────────────────────────────────────────────────────────────
 * Orders raw snapshots chronologically (capturedAt asc, then minute asc) so the
 * replay/backtest walks the match in real time. Never fabricates points.
 */
export interface RawSnapshot {
  id?: string | null
  minute?: number | null
  scoreHome?: number
  scoreAway?: number
  penaltyHome?: number | null
  penaltyAway?: number | null
  status?: string | null
  statsJson?: string | null
  eventsJson?: string | null
  dataQuality?: string | null
  provider?: string | null
  capturedAt?: string | null
}

export function orderSnapshotsChronologically<T extends RawSnapshot>(snapshots: T[]): T[] {
  return [...snapshots].sort((a, b) => {
    const t = (a.capturedAt || '').localeCompare(b.capturedAt || '')
    if (t !== 0) return t
    return (a.minute ?? -1) - (b.minute ?? -1)
  })
}

/** Snapshots strictly after a given trigger snapshot (chronological). */
export function snapshotsAfter<T extends RawSnapshot>(ordered: T[], triggerIndex: number): T[] {
  if (triggerIndex < 0) return []
  return ordered.slice(triggerIndex + 1)
}
