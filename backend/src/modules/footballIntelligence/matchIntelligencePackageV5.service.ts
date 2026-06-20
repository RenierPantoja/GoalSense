/**
 * Match Intelligence Package V5 (B46 / Bloco 3).
 * ─────────────────────────────────────────────────────────────────────────────
 * Composes V4 (memory) with the variable-influence layer: per-variable influences,
 * the aggregate by pattern (fixture-level here), blocking/wait/live-confirmation
 * variables, positive/negative/uncertain influences, conflicts and a summary.
 * Read-only; composes influence WITHOUT persisting. Advisory only — never changes
 * score/confidence/patterns/alerts.
 */
import { buildMatchIntelligencePackageV4, type MatchIntelligencePackageV4 } from './matchIntelligencePackageV4.service.js'
import { composeInfluence } from './influence/influenceLedger.service.js'
import type {
  VariableInfluenceAssessment, InfluenceAggregate, VariableConflict, VariableInfluenceInput,
} from './influence/variableInfluence.types.js'

export interface MatchIntelligencePackageV5 {
  base: MatchIntelligencePackageV4 | null
  variableInfluences: VariableInfluenceInput[]
  influenceAggregateByPattern: Record<string, InfluenceAggregate>
  blockingVariables: VariableInfluenceAssessment[]
  waitVariables: VariableInfluenceAssessment[]
  liveConfirmationVariables: VariableInfluenceAssessment[]
  positiveInfluences: VariableInfluenceAssessment[]
  negativeInfluences: VariableInfluenceAssessment[]
  uncertaintyInfluences: VariableInfluenceAssessment[]
  influenceSummary: string
  conflicts: VariableConflict[]
  influenceLedgerRefs: string[]
  limitations: string[]
}

export async function buildMatchIntelligencePackageV5(fixtureId: string): Promise<MatchIntelligencePackageV5 | null> {
  const base = await buildMatchIntelligencePackageV4(fixtureId).catch(() => null)
  const composed = await composeInfluence(fixtureId, null, base).catch(() => null)
  if (!base && !composed) return null

  const agg = composed?.aggregate
  const influenceAggregateByPattern: Record<string, InfluenceAggregate> = agg ? { fixture: agg } : {}

  return {
    base,
    variableInfluences: composed?.variables ?? [],
    influenceAggregateByPattern,
    blockingVariables: agg?.blockingInfluences ?? [],
    waitVariables: agg?.waitInfluences ?? [],
    liveConfirmationVariables: agg?.liveConfirmationInfluences ?? [],
    positiveInfluences: agg?.positiveInfluences ?? [],
    negativeInfluences: agg?.negativeInfluences ?? [],
    uncertaintyInfluences: agg?.uncertaintyInfluences ?? [],
    influenceSummary: composed?.summary ?? 'sem influência (insufficient_data)',
    conflicts: composed?.conflicts ?? [],
    influenceLedgerRefs: composed ? [`ile_${fixtureId}__fixture`] : [],
    limitations: ['Pacote V5: camada de influência advisory; influenceScore não é probabilidade; não altera score/confiança/padrões/alertas.'],
  }
}
