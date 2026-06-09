/**
 * Backend Duplicate Guard — prevents duplicate alerts (repository-backed).
 */
import { createRepositories } from '../../repositories/index.js'

const DEFAULT_USER = 'default'
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export interface DuplicateCheckResult {
  duplicate: boolean
  reason?: string
  existingAlertId?: string
}

/**
 * Build a duplicate signature for an alert.
 * Format: patternId:fixtureId:scoreHome-scoreAway:minuteBucket
 */
export function buildDuplicateSignature(
  patternId: string,
  fixtureId: string,
  scoreHome: number,
  scoreAway: number,
  minute: number | null,
): string {
  const minuteBucket = minute != null ? Math.floor(minute / 5) * 5 : 0
  return `${patternId}:${fixtureId}:${scoreHome}-${scoreAway}:${minuteBucket}`
}

/**
 * Check if a similar alert already exists (signature or pattern+fixture within window).
 * Works identically in Prisma and Firebase modes via the repository layer.
 */
export async function checkDuplicate(
  patternId: string,
  fixtureId: string,
  scoreHome: number,
  scoreAway: number,
  minute: number | null,
): Promise<DuplicateCheckResult> {
  const repos = createRepositories()
  const signature = buildDuplicateSignature(patternId, fixtureId, scoreHome, scoreAway, minute)

  // Check by signature within 5min window
  const bySignature = await repos.alerts.findByDuplicateSignature(signature, DUPLICATE_WINDOW_MS, DEFAULT_USER)
  if (bySignature) {
    return { duplicate: true, reason: 'Same signature within 5min window', existingAlertId: bySignature.id }
  }

  // Broader check: same pattern+fixture within window (blocks pending/unknown spam)
  const byPatternFixture = await repos.alerts.findRecentByPatternFixture(patternId, fixtureId, DUPLICATE_WINDOW_MS, DEFAULT_USER)
  if (byPatternFixture) {
    return { duplicate: true, reason: 'Same pattern+fixture within 5min window', existingAlertId: byPatternFixture.id }
  }

  return { duplicate: false }
}
