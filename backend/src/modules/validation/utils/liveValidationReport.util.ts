/**
 * Live Validation report helpers (Phase B37) — pure, smoke-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 * Operational recommendations + go/no-go from a session summary. CAUTIOUS and
 * honest: never promises hit-rate/profit/odds/stakes; coverage-absent and unknown
 * are never failures.
 */
import type { LiveValidationSessionSummary } from '../liveValidation.types.js'

export type GoNoGo = 'go' | 'go_with_limitations' | 'insufficient_data' | 'no_go'

export function buildRecommendations(s: LiveValidationSessionSummary): string[] {
  const recs: string[] = []
  if (s.fixturesObserved === 0) recs.push('Nenhum jogo observado — cobertura ausente (não é falha). Rode durante jogos ao vivo das ligas-alvo.')
  if (s.providerCallsBlocked > 0) recs.push('Houve bloqueio de orçamento de provider — reduza fixtures ou aumente o intervalo de snapshot.')
  if (s.snapshotsSkipped > s.snapshotsWritten && s.snapshotsWritten > 0) recs.push('Muitos snapshots pulados vs escritos — revise o intervalo mínimo/dedup se quiser mais granularidade para replay.')
  const dq = s.dataQualityBreakdown
  const totalDq = dq.rich + dq.partial + dq.poor + dq.unknown
  if (totalDq > 0 && (dq.poor + dq.unknown) / totalDq > 0.5) recs.push('Provider com baixa cobertura de dados nesta sessão — valide com outra liga ou aguarde enriquecimento.')
  if (s.signalsCreated === 0 && s.fixturesObserved > 0) recs.push('Sem sinais nesta sessão — amostra insuficiente para conclusão; observe mais jogos.')
  if (s.outcomesResolved === 0 && s.alertsCreated > 0) recs.push('Alertas criados mas ainda sem outcome resolvido — aguarde dados pós-gatilho.')
  if (s.exactEvidenceLinks === 0 && s.inferredEvidenceLinks > 0) recs.push('Evidência apenas inferida — considere reprocessar ou rodar replay para vínculo exato.')
  if (s.operationalRisk === 'high' || s.operationalRisk === 'unsafe') recs.push('Risco operacional elevado — reduza o escopo de fixtures e mantenha o perfil safe_local.')
  if (recs.length === 0) recs.push('Sessão dentro do esperado — sem ajustes obrigatórios. Acumule mais amostra antes de conclusões.')
  return recs
}

export function deriveGoNoGo(s: LiveValidationSessionSummary): GoNoGo {
  if (s.operationalRisk === 'unsafe') return 'no_go'
  if (s.fixturesObserved === 0 || (s.signalsCreated === 0 && s.alertsCreated === 0 && s.opportunitiesCreated === 0)) return 'insufficient_data'
  const dq = s.dataQualityBreakdown
  const totalDq = dq.rich + dq.partial + dq.poor + dq.unknown
  const poorRatio = totalDq > 0 ? (dq.poor + dq.unknown) / totalDq : 1
  if (s.providerCallsBlocked > 0 || poorRatio > 0.5 || s.operationalRisk === 'high') return 'go_with_limitations'
  return 'go'
}

/** unknown / not_evaluable are NOT failures — surfaced separately, never summed into a failure rate. */
export function evidenceBreakdown(exact: number, inferred: number, unknown: number): { exact: number; inferred: number; unknown: number } {
  return { exact: Math.max(0, exact), inferred: Math.max(0, inferred), unknown: Math.max(0, unknown) }
}
