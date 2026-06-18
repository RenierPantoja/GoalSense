/**
 * Backtest Evaluation Adapter (Phase B14).
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts a historical fixture + recorded snapshot into the SAME
 * PatternEvaluationInput the live worker uses — so the very same pure evaluator
 * (`evaluateCondition` / `evaluatePatternAgainstInput`) runs offline.
 *
 * Crucially it uses the SNAPSHOT's status (not the fixture's current/FT status)
 * so eligibility gates (is_live, minute_between) behave as they did live. Never
 * synthesizes stats: missing data stays missing (dataQuality poor/unknown).
 */
import { buildPatternInput, type PatternEvaluationInput } from '../../command/snapshotToPatternInput.js'
import { deriveMatchContext, type MatchContext } from '../../command/matchContext.service.js'

export interface BacktestFixtureView {
  id: string
  canonicalKey: string
  homeName: string
  awayName: string
  competition: string
  status: string
}

export interface BacktestSnapshotView {
  minute: number | null
  scoreHome: number
  scoreAway: number
  penaltyHome: number | null
  penaltyAway: number | null
  status?: string | null
  statsJson: string | null
  eventsJson: string | null
  dataQuality: string
  provider: string
  capturedAt: string
}

/** Build the evaluation input for one snapshot tick, attaching match context. */
export function buildBacktestInput(
  fixture: BacktestFixtureView,
  snapshot: BacktestSnapshotView,
  context: MatchContext,
): PatternEvaluationInput {
  const fixtureForInput = {
    id: fixture.id,
    canonicalKey: fixture.canonicalKey,
    homeName: fixture.homeName,
    awayName: fixture.awayName,
    competition: fixture.competition,
    // Snapshot status drives eligibility (the live state at capture time).
    status: snapshot.status || fixture.status,
  }
  const input = buildPatternInput(fixtureForInput as any, snapshot as any)
  input.context = context
  return input
}

export function contextForFixture(competition: string): MatchContext {
  return deriveMatchContext(competition)
}
