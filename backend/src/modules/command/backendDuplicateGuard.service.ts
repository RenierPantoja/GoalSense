/**
 * Backend Duplicate Guard — prevents duplicate alerts in the database.
 */
import { prisma } from '../../db/client.js'

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
 * Check if a similar alert already exists in the database.
 */
export async function checkDuplicate(
  patternId: string,
  fixtureId: string,
  scoreHome: number,
  scoreAway: number,
  minute: number | null,
): Promise<DuplicateCheckResult> {
  const signature = buildDuplicateSignature(patternId, fixtureId, scoreHome, scoreAway, minute)
  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS)

  // Check by signature
  const bySignature = await prisma.alert.findFirst({
    where: {
      userId: DEFAULT_USER,
      duplicateSignature: signature,
      createdAt: { gte: cutoff },
    },
    select: { id: true },
  })

  if (bySignature) {
    return { duplicate: true, reason: 'Same signature within 5min window', existingAlertId: bySignature.id }
  }

  // Also check by patternId + fixtureId within window (broader check)
  const byPatternFixture = await prisma.alert.findFirst({
    where: {
      userId: DEFAULT_USER,
      patternId,
      fixtureId,
      createdAt: { gte: cutoff },
    },
    select: { id: true },
  })

  if (byPatternFixture) {
    return { duplicate: true, reason: 'Same pattern+fixture within 5min window', existingAlertId: byPatternFixture.id }
  }

  return { duplicate: false }
}
