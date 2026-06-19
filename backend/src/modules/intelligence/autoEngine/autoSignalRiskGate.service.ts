/**
 * Auto Signal Risk Gate (Phase B19) — conservative, explainable gating.
 * ─────────────────────────────────────────────────────────────────────────────
 * Better to block than to signal weakly. Missing data is a block reason, NEVER a
 * failure. No odds, no probabilities. Returns allow / reduce / block + reasons.
 */
import type { DataQuality, SampleQuality } from '../contracts/learning.types.js'
import type { AutoSignalRiskGateResult, AutoSignalBlockReason } from './autoEngine.types.js'
import { meetsSampleQuality } from './utils/autoSignalContext.util.js'

export interface RiskGateInput {
  isLive: boolean
  dataQuality: DataQuality
  snapshotAgeMs: number | null
  requiredDataPresent: boolean
  hasEvidence: boolean
  learningDependent: boolean
  sampleQuality: SampleQuality
  minSampleQuality: SampleQuality
  historicallyWeak: boolean
  unknownRate: number | null
  hasRecentManualAlert: boolean
  isDuplicate: boolean
  oppCountForFixture: number
  maxOppsPerFixture: number
  score: number
  minScore: number
}

const STALE_MS = 5 * 60 * 1000

export function evaluateRiskGate(i: RiskGateInput): AutoSignalRiskGateResult {
  const blockReasons: AutoSignalBlockReason[] = []
  const penalties: { reason: string; amount: number }[] = []
  const warnings: string[] = []

  if (!i.isLive) blockReasons.push('not_live')
  if (i.dataQuality === 'poor' || i.dataQuality === 'unknown') blockReasons.push('data_poor')
  if (i.snapshotAgeMs != null && i.snapshotAgeMs > STALE_MS) blockReasons.push('provider_stale')
  if (!i.requiredDataPresent) blockReasons.push('missing_required_data')
  if (!i.hasEvidence) blockReasons.push('no_evidence')
  if (i.hasRecentManualAlert) blockReasons.push('recent_manual_alert')
  if (i.isDuplicate) blockReasons.push('duplicate_opportunity')
  if (i.oppCountForFixture >= i.maxOppsPerFixture) blockReasons.push('max_opportunities_per_fixture')
  // Learning-dependent strategies require a real sample; live ones do not.
  if (i.learningDependent && !meetsSampleQuality(i.sampleQuality, i.minSampleQuality)) blockReasons.push('sample_quality_insufficient')
  if (i.historicallyWeak) blockReasons.push('historically_weak')
  if (i.unknownRate != null && i.unknownRate >= 0.6) blockReasons.push('too_much_unknown')
  if (i.score < i.minScore) blockReasons.push('score_below_minimum')

  // Non-blocking penalties / warnings (applied to score by the caller upstream).
  if (i.dataQuality === 'partial') { penalties.push({ reason: 'partial_data', amount: 6 }); warnings.push('Dados parciais') }
  if (!i.learningDependent && i.sampleQuality === 'insufficient') warnings.push('Sem histórico suficiente — contexto limitado')
  if (i.unknownRate != null && i.unknownRate >= 0.4 && i.unknownRate < 0.6) warnings.push('Taxa de "sem dados" alta neste contexto')

  const allowed = blockReasons.length === 0
  return {
    allowed,
    blockReasons,
    penalties,
    warnings,
    finalDecision: allowed ? (penalties.length > 0 ? 'reduce' : 'allow') : 'block',
  }
}
