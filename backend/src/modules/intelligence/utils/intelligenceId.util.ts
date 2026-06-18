/**
 * Deterministic id helpers for the intelligence memory.
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic ids make every write idempotent: re-running creation/resolution
 * never duplicates a ledger entry, outcome or failure analysis for the same alert.
 */

function slug(s: string): string {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

/** Ledger id: 1:1 with the alert when present, else a stable signal fingerprint. */
export function ledgerId(input: { alertId?: string | null; fixtureId: string; patternId?: string | null; minute?: number | null }): string {
  if (input.alertId) return `led_${input.alertId}`
  const m = input.minute == null ? 'na' : String(input.minute)
  return `led_${slug(input.fixtureId)}__${slug(input.patternId || 'nopattern')}__${m}`
}

/** Outcome id: exactly one per alert (mirrors the alertResolutions deterministic id). */
export function outcomeId(alertId: string): string {
  return `out_${alertId}`
}

/** Failure-analysis id: one per alert. */
export function failureId(alertId: string): string {
  return `fail_${alertId}`
}

/** Missed-opportunity id: stable per fixture+pattern+event so re-scans don't duplicate. */
export function missedOpportunityId(input: { fixtureId: string; patternId?: string | null; eventType: string; eventMinute?: number | null }): string {
  const m = input.eventMinute == null ? 'na' : String(input.eventMinute)
  return `miss_${slug(input.fixtureId)}__${slug(input.patternId || 'nopattern')}__${slug(input.eventType)}__${m}`
}

/** Learning-event id: time-ordered + random suffix (many per pattern). */
export function learningEventId(): string {
  return `lrn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
