/**
 * Evidence Lineage — frontend types (Phase B33).
 */
export type EvidenceLinkStrengthDto = 'exact' | 'strong_inferred' | 'window_inferred' | 'weak_inferred' | 'unknown'

export type EvidenceLinkSourceDto =
  | 'signal_ledger' | 'alert_outcome' | 'failure_analysis' | 'backtest_run' | 'backtest_result'
  | 'replay_run' | 'replay_step' | 'learning_event' | 'auto_opportunity' | 'auto_opportunity_outcome'
  | 'promoted_alert' | 'auto_alert_policy_evaluation' | 'manual_feedback' | 'retention_backfill'

export type EvidenceKindDto =
  | 'trigger_state' | 'pre_trigger_state' | 'post_trigger_state' | 'outcome_state' | 'replay_step'
  | 'backtest_evaluation' | 'learning_sample' | 'auto_opportunity_evidence' | 'policy_gate_evidence'
  | 'manual_review_evidence' | 'retention_protection'

export interface EvidenceSnapshotReferenceDto {
  id: string
  snapshotId: string | null
  fixtureId: string
  provider: string | null
  capturedAt: string | null
  minute: number | null
  linkStrength: EvidenceLinkStrengthDto
  source: EvidenceLinkSourceDto
  sourceId: string | null
  sourceType: string | null
  alertId: string | null
  patternId: string | null
  opportunityId: string | null
  backtestRunId: string | null
  replayRunId: string | null
  learningEventId: string | null
  outcomeId: string | null
  policyEvaluationId: string | null
  reason: string
  evidenceKind: EvidenceKindDto
  createdAt: string
  createdBy: string | null
  limitations: string[]
}

export interface EvidenceTimelineEntryDto {
  snapshotId: string | null
  capturedAt: string | null
  minute: number | null
  linkStrength: EvidenceLinkStrengthDto
  source: EvidenceLinkSourceDto
  evidenceKind: EvidenceKindDto
}

export interface EvidenceLineageBundleDto {
  fixtureId: string
  snapshotIds: string[]
  exactLinks: EvidenceSnapshotReferenceDto[]
  inferredLinks: EvidenceSnapshotReferenceDto[]
  unknownLinks: EvidenceSnapshotReferenceDto[]
  sources: EvidenceLinkSourceDto[]
  timeline: EvidenceTimelineEntryDto[]
  protectionReasons: string[]
  limitations: string[]
}

export interface EvidenceLineageSearchParams {
  snapshotId?: string
  fixtureId?: string
  alertId?: string
  opportunityId?: string
  source?: string
  sourceId?: string
  limit?: number
}

export const LINK_STRENGTH_LABEL: Record<EvidenceLinkStrengthDto, string> = {
  exact: 'Exato',
  strong_inferred: 'Inferido (forte)',
  window_inferred: 'Inferido (janela)',
  weak_inferred: 'Inferido (fraco)',
  unknown: 'Desconhecido',
}

export const SOURCE_LABEL: Record<EvidenceLinkSourceDto, string> = {
  signal_ledger: 'Alerta (ledger)',
  alert_outcome: 'Outcome',
  failure_analysis: 'Análise de falha',
  backtest_run: 'Backtest',
  backtest_result: 'Backtest',
  replay_run: 'Replay',
  replay_step: 'Replay',
  learning_event: 'Aprendizado',
  auto_opportunity: 'Oportunidade',
  auto_opportunity_outcome: 'Oportunidade (outcome)',
  promoted_alert: 'Alerta promovido',
  auto_alert_policy_evaluation: 'Política automática',
  manual_feedback: 'Feedback manual',
  retention_backfill: 'Backfill',
}
