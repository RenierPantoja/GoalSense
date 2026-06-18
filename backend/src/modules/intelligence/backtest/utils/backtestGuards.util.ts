/**
 * Backtest guards (Phase B14) — config validation + env gating.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { env } from '../../../../env.js'
import type { BacktestRunConfig } from '../backtest.types.js'

export const BACKTEST_MAX_FIXTURES_HARD_CAP = 300
export const BACKTEST_DEFAULT_MAX_FIXTURES = 80

/** The write/run API is disabled unless explicitly enabled by env. */
export function isBacktestApiEnabled(): boolean {
  return String(env.ENABLE_BACKTEST_API).toLowerCase() === 'true'
}

export interface NormalizedConfig extends BacktestRunConfig {
  maxFixtures: number
  evaluationMode: 'strict' | 'diagnostic'
  includeUnknown: boolean
}

export function validateAndNormalizeConfig(raw: Partial<BacktestRunConfig>): { ok: true; config: NormalizedConfig } | { ok: false; error: string } {
  if (!raw.patternId || typeof raw.patternId !== 'string') {
    return { ok: false, error: 'patternId is required' }
  }
  const maxFixtures = Math.min(
    Math.max(1, Number(raw.maxFixtures) || BACKTEST_DEFAULT_MAX_FIXTURES),
    BACKTEST_MAX_FIXTURES_HARD_CAP,
  )
  return {
    ok: true,
    config: {
      patternId: raw.patternId,
      dateFrom: raw.dateFrom ?? null,
      dateTo: raw.dateTo ?? null,
      leagues: Array.isArray(raw.leagues) ? raw.leagues : undefined,
      teams: Array.isArray(raw.teams) ? raw.teams : undefined,
      fixtures: Array.isArray(raw.fixtures) ? raw.fixtures : undefined,
      includeUnknown: raw.includeUnknown !== false,
      maxFixtures,
      evaluationMode: raw.evaluationMode === 'strict' ? 'strict' : 'diagnostic',
      useExistingSnapshotsOnly: true,
      dryRun: !!raw.dryRun,
    },
  }
}
