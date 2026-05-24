/**
 * Command Center types — Pattern Engine, Triggered Alerts, Scanner.
 */
import type { LiveFixture } from '@/lib/apiClient'

// ─── Pattern Types ───────────────────────────────────────────────────────────

export type PatternSeverity = 'critical' | 'attention' | 'info'
export type PatternStatus = 'active' | 'paused' | 'archived'
export type ConfidenceLevel = 'alta' | 'média' | 'baixa'

export interface PatternCondition {
  type:
    | 'minute_between'
    | 'score_tied'
    | 'score_diff_lte'
    | 'favorite_involved'
    | 'shots_recent_gte'
    | 'shots_on_target_gte'
    | 'corners_gte'
    | 'cards_gte'
    | 'possession_gte'
    | 'is_live'
    | 'is_final_phase'
    | 'is_pre_live'
    | 'goals_total_gte'
  params: Record<string, number | string | boolean>
}

export interface Pattern {
  id: string
  name: string
  description: string
  conditions: PatternCondition[]
  severity: PatternSeverity
  status: PatternStatus
  isTemplate: boolean
  templateId?: string
  createdAt: string
  updatedAt: string
}

export interface PatternTemplate {
  id: string
  name: string
  description: string
  conditions: PatternCondition[]
  severity: PatternSeverity
  defaultConfidence: ConfidenceLevel
}

// ─── Pattern Hit (when a pattern matches a live fixture) ─────────────────────

export interface PatternHit {
  patternId: string
  patternName: string
  fixtureId: number
  fixture: LiveFixture
  confidence: number
  confidenceLevel: ConfidenceLevel
  severity: PatternSeverity
  reasons: string[]
  matchedConditions: number
  totalConditions: number
  timestamp: string
}

// ─── Triggered Alert ─────────────────────────────────────────────────────────

export type TriggeredAlertStatus = 'active' | 'confirmed' | 'not_confirmed' | 'expired'

export interface TriggeredAlert {
  id: string
  patternId: string
  patternName: string
  fixtureId: number
  homeTeam: string
  awayTeam: string
  league: string
  minute: number | null
  confidence: number
  reasons: string[]
  timestamp: string
  status: TriggeredAlertStatus
  confirmedAt?: string
  scoreAtTrigger: { home: number; away: number }
  scoreAtResolution?: { home: number; away: number }
}

// ─── Pattern Performance ─────────────────────────────────────────────────────

export interface PatternPerformance {
  patternId: string
  patternName: string
  totalHits: number
  confirmed: number
  notConfirmed: number
  pending: number
  hitRate: number
  avgConfidence: number
  lastHit: string | null
}

// ─── Scanner Entry ───────────────────────────────────────────────────────────

export interface ScannerEntry {
  fixture: LiveFixture
  patterns: PatternHit[]
  topPattern: PatternHit | null
  priority: 'critical' | 'attention' | 'watch' | 'low'
  confidence: number
}

// ─── Stats for pattern evaluation ────────────────────────────────────────────

export interface FixtureStatsForPattern {
  possession?: { home: number; away: number }
  shots?: { home: number; away: number }
  shotsOnTarget?: { home: number; away: number }
  corners?: { home: number; away: number }
  yellowCards?: { home: number; away: number }
  redCards?: { home: number; away: number }
}
