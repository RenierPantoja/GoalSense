/**
 * Snapshot → Pattern Evaluation Input adapter.
 * Converts raw DB records into a stable input for the evaluation engine.
 */
import type { LiveMatchStats, BackendTimedEvent } from '../../providers/espn.provider.js'

export interface PatternEvaluationInput {
  fixtureId: string
  canonicalKey: string
  matchLabel: string
  competition: string
  status: string
  minute: number | null
  score: { home: number; away: number }
  penaltyScore: { home: number; away: number } | null
  stats: LiveMatchStats | null
  events: BackendTimedEvent[]
  dataQuality: 'rich' | 'partial' | 'poor'
  provider: string
  capturedAt: string
}

function safeParseJson<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback
  try { return JSON.parse(str) as T } catch { return fallback }
}

export function buildPatternInput(
  fixture: { id: string; canonicalKey: string; homeName: string; awayName: string; competition: string; status: string },
  snapshot: { minute: number | null; scoreHome: number; scoreAway: number; penaltyHome: number | null; penaltyAway: number | null; statsJson: string | null; eventsJson: string | null; dataQuality: string; provider: string; capturedAt: Date | string },
): PatternEvaluationInput {
  return {
    fixtureId: fixture.id,
    canonicalKey: fixture.canonicalKey,
    matchLabel: `${fixture.homeName} vs ${fixture.awayName}`,
    competition: fixture.competition,
    status: fixture.status,
    minute: snapshot.minute,
    score: { home: snapshot.scoreHome, away: snapshot.scoreAway },
    penaltyScore: snapshot.penaltyHome != null ? { home: snapshot.penaltyHome, away: snapshot.penaltyAway ?? 0 } : null,
    stats: safeParseJson<LiveMatchStats | null>(snapshot.statsJson, null),
    events: safeParseJson<BackendTimedEvent[]>(snapshot.eventsJson, []),
    dataQuality: (snapshot.dataQuality as 'rich' | 'partial' | 'poor') || 'poor',
    provider: snapshot.provider,
    // capturedAt may be a Date (Prisma) or an ISO string (Firebase).
    capturedAt: typeof snapshot.capturedAt === 'string' ? snapshot.capturedAt : snapshot.capturedAt.toISOString(),
  }
}
