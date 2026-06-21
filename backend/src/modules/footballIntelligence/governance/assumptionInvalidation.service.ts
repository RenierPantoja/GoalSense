/**
 * Assumption Invalidation Engine (B47 / Bloco 4).
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects when a previous (pre-match) reading no longer holds, so the system stops
 * treating pre-match as static. Observational only; never sends an alert, never
 * changes alert results. Persists an auditable record.
 */
import { createRepositories } from '../../../repositories/index.js'
import type {
  AssumptionInvalidation, AlertGovernanceRecheckTrigger, AlertDecisionSeverity,
} from './alertDecisionGovernance.types.js'

let seq = 0
function invId(): string { seq = (seq + 1) % 1e9; return `ainv_${Date.now().toString(36)}_${seq.toString(36)}` }

interface TriggerMapping {
  assumption: string
  severity: AlertDecisionSeverity
  recommendedAction: AssumptionInvalidation['recommendedAction']
  reason: string
}

const TRIGGER_MAP: Partial<Record<AlertGovernanceRecheckTrigger, TriggerMapping>> = {
  lineup_confirmed: { assumption: 'Escalação provável assumida', severity: 'caution', recommendedAction: 'recheck', reason: 'Escalação confirmada — reavaliar leitura provável.' },
  lineup_changed: { assumption: 'Escalação anterior assumida', severity: 'strong_caution', recommendedAction: 'recheck', reason: 'Escalação mudou — leitura anterior pode não valer.' },
  red_card: { assumption: '11 contra 11 assumido', severity: 'critical', recommendedAction: 'live_confirmation', reason: 'Cartão vermelho altera o jogo — reavaliar ao vivo.' },
  substitution: { assumption: 'Jogadores em campo assumidos', severity: 'caution', recommendedAction: 'recheck', reason: 'Substituição pode mudar o ritmo/leitura.' },
  injury_event: { assumption: 'Elenco saudável assumido', severity: 'caution', recommendedAction: 'recheck', reason: 'Lesão em jogo pode invalidar a leitura.' },
  domain_refreshed: { assumption: 'Dado crítico ausente assumido', severity: 'informational', recommendedAction: 'recheck', reason: 'Domínio crítico chegou — reavaliar com dado real.' },
  manual_record_created: { assumption: 'Dado de provider assumido', severity: 'caution', recommendedAction: 'recheck', reason: 'Registro manual adicionado — pode contradizer provider.' },
  mapping_confirmed: { assumption: 'Mapping pendente assumido', severity: 'informational', recommendedAction: 'recheck', reason: 'Mapping confirmado — pode desbloquear dado crítico.' },
  goal: { assumption: 'Placar anterior assumido', severity: 'caution', recommendedAction: 'recheck', reason: 'Gol muda o game-state — reavaliar.' },
}

export async function detectAssumptionInvalidation(fixtureId: string, trigger: AlertGovernanceRecheckTrigger, patternId: string | null = null, governanceResultId: string | null = null): Promise<AssumptionInvalidation | null> {
  const map = TRIGGER_MAP[trigger]
  if (!map) return null
  const inv: AssumptionInvalidation = {
    id: invId(), fixtureId, patternId, governanceResultId,
    invalidatedAssumption: map.assumption, trigger, severity: map.severity,
    recommendedAction: map.recommendedAction, reason: map.reason, evidenceRefs: [], createdAt: new Date().toISOString(),
  }
  try { await createRepositories().intelligence.saveAssumptionInvalidation(inv) } catch { /* noop */ }
  return inv
}

export async function listAssumptionInvalidations(fixtureId: string): Promise<AssumptionInvalidation[]> {
  try { return await createRepositories().intelligence.listAssumptionInvalidationsByFixture(fixtureId, 100) } catch { return [] }
}
