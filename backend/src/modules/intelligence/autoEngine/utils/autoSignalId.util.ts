/**
 * Deterministic ids for Auto Engine runs/opportunities (Phase B19).
 * Opportunity id is stable per (fixture, type, minute-bucket) so re-scans within
 * the same window upsert instead of duplicating.
 */
function slug(s: string): string {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
}

export function autoRunId(): string {
  return `aer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/** 5-minute bucket so repeated scans in the same window dedupe to one opportunity. */
export function autoOpportunityId(fixtureId: string, type: string, minute: number | null): string {
  const bucket = minute == null ? 'na' : String(Math.floor(minute / 5) * 5)
  return `aop_${slug(fixtureId)}__${slug(type)}__${bucket}`
}
