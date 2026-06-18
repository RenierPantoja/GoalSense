/**
 * Pure learning statistics (Phase B13) — deterministic, testable, no side effects.
 * ─────────────────────────────────────────────────────────────────────────────
 * Rules:
 *  - Rates are computed over RESOLVED alerts only (pending excluded).
 *  - usefulCount = confirmed + confirmed_partial (partial counts as partial use).
 *  - failedRate numerator = failed only (unknown is NOT a failure).
 *  - unknownRate = (unknown + expired) / resolved (no-data grouped, explicit).
 *  - sampleQuality protects against conclusions from small samples.
 */
import type { AlertResult } from '../contracts/intelligence.types.js'
import type { OutcomeDistribution, SampleQuality } from '../contracts/learning.types.js'

export function newDistribution(): OutcomeDistribution {
  return { total: 0, pending: 0, confirmed: 0, confirmedPartial: 0, failed: 0, unknown: 0, expired: 0 }
}

export function addResult(dist: OutcomeDistribution, result: AlertResult): void {
  dist.total++
  switch (result) {
    case 'confirmed': dist.confirmed++; break
    case 'confirmed_partial': dist.confirmedPartial++; break
    case 'failed': dist.failed++; break
    case 'unknown': dist.unknown++; break
    case 'expired': dist.expired++; break
    default: dist.pending++; break
  }
}

export function mergeDistribution(into: OutcomeDistribution, from: OutcomeDistribution): void {
  into.total += from.total; into.pending += from.pending
  into.confirmed += from.confirmed; into.confirmedPartial += from.confirmedPartial
  into.failed += from.failed; into.unknown += from.unknown; into.expired += from.expired
}

/** Resolved = everything except pending. */
export function resolvedCount(d: OutcomeDistribution): number {
  return d.confirmed + d.confirmedPartial + d.failed + d.unknown + d.expired
}

export function usefulCount(d: OutcomeDistribution): number {
  return d.confirmed + d.confirmedPartial
}

function rate(n: number, denom: number): number | null {
  if (denom <= 0) return null
  return Math.round((n / denom) * 1000) / 1000
}

export function usefulRate(d: OutcomeDistribution): number | null {
  return rate(usefulCount(d), resolvedCount(d))
}
export function failedRate(d: OutcomeDistribution): number | null {
  return rate(d.failed, resolvedCount(d))
}
export function unknownRate(d: OutcomeDistribution): number | null {
  return rate(d.unknown + d.expired, resolvedCount(d))
}

/** Sample-quality gate based on the RESOLVED sample (rates are meaningless on pending). */
export function sampleQualityOf(resolved: number): SampleQuality {
  if (resolved < 5) return 'insufficient'
  if (resolved < 15) return 'low'
  if (resolved < 40) return 'moderate'
  return 'strong'
}

export function avg(sum: number, n: number): number | null {
  if (n <= 0) return null
  return Math.round((sum / n) * 10) / 10
}
