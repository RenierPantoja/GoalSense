/**
 * Command Center types — Pattern Engine, Triggered Alerts, Scanner.
 */
import type { LiveFixture } from '@/lib/apiClient'

// ─── Pattern Types ───────────────────────────────────────────────────────────

export type PatternSeverity = 'critical' | 'attention' | 'info'
export type PatternStatus = 'active' | 'paused' | 'archived'
export type ConfidenceLevel = 'alta' | 'média' | 'baixa'

export type PatternConditionType =
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
  | 'goals_total_lte'
  | 'away_shots_on_target_gte'
  | 'away_goals_gte'
  | 'away_possession_gte'
  // V3.14 — additional safe types: every one is backed by data already
  // present in FixtureStatsForPattern or the fixture itself, so the evaluator
  // can return a real boolean. No mocked sources.
  | 'home_shots_on_target_gte'
  | 'home_goals_gte'
  | 'home_possession_gte'
  | 'home_corners_gte'
  | 'away_corners_gte'
  | 'shots_total_gte'
  | 'yellow_cards_gte'
  | 'red_cards_gte'

export interface PatternCondition {
  type: PatternConditionType
  params: Record<string, number | string | boolean>
}

export type PatternScope = 'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams' | 'specific_matches'
export type PatternAction = 'register_alert' | 'suggest_only' | 'highlight'

export type PatternSyncStatus = 'synced' | 'pending_create' | 'pending_update' | 'pending_delete' | 'error' | 'local_only'

export interface Pattern {
  id: string
  name: string
  description: string
  conditions: PatternCondition[]
  severity: PatternSeverity
  status: PatternStatus
  isTemplate: boolean
  templateId?: string
  scope: PatternScope
  scopeFilter?: string[]
  // Advanced scope filters (optional, additive — backward compatible)
  excludeLeagues?: string[]
  excludeTeams?: string[]
  matches?: string[]          // canonical match ids (or free-text labels) the radar is restricted to
  excludeMatches?: string[]   // canonical match ids excluded from this radar
  requireRichData?: boolean
  onlyLive?: boolean
  onlyPreMatch?: boolean
  minConfidence: number
  action: PatternAction
  maxTriggersPerMatch: number
  antiDuplicateWindow: number // minutes
  createdAt: string
  updatedAt: string
  // ─── Backend Sync Metadata (Phase B3.3) ────────────────────────────────
  backendId?: string
  syncStatus?: PatternSyncStatus
  lastSyncedAt?: string
  syncError?: string
}

export interface PatternTemplate {
  id: string
  name: string
  description: string
  conditions: PatternCondition[]
  severity: PatternSeverity
  defaultConfidence: ConfidenceLevel
}

// ─── Pattern Hit ─────────────────────────────────────────────────────────────

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

export type TriggeredAlertStatus = 'pending' | 'confirmed' | 'confirmed_partial' | 'failed' | 'expired' | 'unknown'

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
  resolutionReason?: string
}

// ─── Auto-Discovery Config ───────────────────────────────────────────────────

export interface AutoDiscoveryConfig {
  enabled: boolean
  userConfigured: boolean
  minSeverity: PatternSeverity
  minConfidence: number
  monitorFavorites: boolean
  monitorMainLeagues: boolean
  monitorAllLeagues: boolean
  includePreMatch: boolean
  includeLive: boolean
  registerAlertAuto: boolean
  maxAlertsPerMatch: number
  antiDuplicateMinutes: number
  /** V11: Precision rigor level for auto-discovery validation. */
  rigor: 'conservative' | 'balanced' | 'aggressive'
}

export const DEFAULT_AUTO_DISCOVERY_CONFIG: AutoDiscoveryConfig = {
  enabled: false,
  userConfigured: false,
  minSeverity: 'info',
  minConfidence: 50,
  monitorFavorites: true,
  monitorMainLeagues: true,
  monitorAllLeagues: true,
  includePreMatch: true,
  includeLive: true,
  registerAlertAuto: false,
  maxAlertsPerMatch: 3,
  antiDuplicateMinutes: 5,
  rigor: 'balanced',
}

// ─── Scanner Entry ───────────────────────────────────────────────────────────

export interface ScannerEntry {
  fixture: LiveFixture
  patterns: PatternHit[]
  topPattern: PatternHit | null
  priority: 'critical' | 'attention' | 'watch' | 'low'
  confidence: number
  reason: string
  /** V5 precision signal state. */
  signalState?: 'ready_to_alert' | 'strong_candidate' | 'watch_only' | 'blocked'
  /** Blockers preventing alert (from precision engine). */
  blockers?: string[]
  /** Data quality assessment. */
  dataQuality?: 'rich' | 'partial' | 'poor'
  /** V5 Phase 7: momentum source. */
  momentumSource?: 'timed_events' | 'mixed' | 'stats_proxy' | 'insufficient'
  /** V5 Phase 7: recency confidence 0-100. */
  recencyConfidence?: number
  /** V5 Phase 7: recent events used for momentum (max 5). */
  recentEventsUsed?: { minute: number; type: string; side: string; teamName?: string; playerName?: string }[]
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
