/**
 * Radar Diagnostic Service — READ-ONLY engine diagnostic (Phase 3.1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Evaluates a radar draft against the SAME real live snapshots and the SAME
 * evaluator the Pattern Worker uses — but writes NOTHING:
 *   - no Alert, no Pattern, no Resolution, no performance counter
 *   - no Telegram, no snapshot mutation, no forced fixture status
 * It answers: "would this rule trigger right now, and if not, why?".
 */
import { createRepositories } from '../../repositories/index.js'
import { buildPatternInput } from './snapshotToPatternInput.js'
import { evaluateCondition, evaluatePatternAgainstInput } from './commandEvaluation.service.js'

const DEFAULT_USER = 'default'
const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT']
const SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000

/** Condition types the worker's evaluator can actually resolve. */
const BACKEND_SUPPORTED = new Set<string>([
  'is_live', 'minute_between', 'score_tied', 'score_diff_lte', 'goals_total_gte',
  'goals_total_lte', 'possession_gte', 'shots_on_target_gte', 'corners_gte',
  'cards_gte', 'is_final_phase', 'shots_total_gte', 'home_shots_on_target_gte',
  'away_shots_on_target_gte', 'home_possession_gte', 'away_possession_gte',
  'home_corners_gte', 'away_corners_gte',
])

/** Conditions that only gate WHEN a match can be evaluated (not opportunity). */
const ELIGIBILITY_TYPES = new Set<string>(['is_live', 'is_pre_live', 'minute_between', 'is_final_phase'])

const CONDITION_LABEL: Record<string, string> = {
  is_live: 'Partida ao vivo', is_pre_live: 'Pré-jogo', minute_between: 'Fora do intervalo de minuto',
  is_final_phase: 'Fora da reta final', score_tied: 'Placar não empatado', score_diff_lte: 'Placar aberto',
  goals_total_gte: 'Poucos gols', goals_total_lte: 'Muitos gols', possession_gte: 'Posse insuficiente',
  home_possession_gte: 'Posse mandante insuficiente', away_possession_gte: 'Posse visitante insuficiente',
  shots_on_target_gte: 'Sem chutes no alvo suficientes', home_shots_on_target_gte: 'Mandante sem chutes no alvo',
  away_shots_on_target_gte: 'Visitante sem chutes no alvo', shots_total_gte: 'Finalizações insuficientes',
  corners_gte: 'Escanteios insuficientes', home_corners_gte: 'Escanteios mandante insuficientes',
  away_corners_gte: 'Escanteios visitante insuficientes', cards_gte: 'Cartões insuficientes',
}

function conditionDataDependency(type: string): string | null {
  switch (type) {
    case 'is_live': case 'is_pre_live': return 'status ao vivo'
    case 'minute_between': case 'is_final_phase': return 'minuto'
    case 'score_tied': case 'score_diff_lte': case 'goals_total_gte': case 'goals_total_lte': return 'placar'
    case 'shots_on_target_gte': case 'home_shots_on_target_gte': case 'away_shots_on_target_gte': return 'chutes no alvo'
    case 'shots_total_gte': return 'finalizações'
    case 'possession_gte': case 'home_possession_gte': case 'away_possession_gte': return 'posse de bola'
    case 'corners_gte': case 'home_corners_gte': case 'away_corners_gte': return 'escanteios'
    case 'cards_gte': return 'cartões'
    default: return null
  }
}

export interface RadarDiagnosticInput {
  conditions: { type: string; params: Record<string, any> }[]
  minConfidence: number
  severity: string
  requireRichData?: boolean
  limit?: number
}

export interface RadarDiagnosticSample {
  matchLabel: string
  competition: string
  minute: number | null
  score: { home: number; away: number }
  signalState: string
  confidence: number
  matched: number
  total: number
  dataQuality: string
}

export interface RadarDiagnosticResult {
  ok: boolean
  code: 'OK' | 'NO_LIVE_FIXTURES' | 'DATA_INSUFFICIENT' | 'UNSUPPORTED_CONDITION'
  evaluatedFixtures: number
  eligibleFixtures: number
  sufficientDataFixtures: number
  wouldTrigger: number
  blockedReasons: Record<string, number>
  unsupportedConditions: string[]
  dataDependencies: string[]
  sampleFixtures: RadarDiagnosticSample[]
  warnings: string[]
}

export async function runRadarDiagnostic(input: RadarDiagnosticInput): Promise<RadarDiagnosticResult> {
  const conditions = Array.isArray(input.conditions) ? input.conditions : []
  const unsupportedConditions = [...new Set(conditions.map(c => c.type).filter(t => !BACKEND_SUPPORTED.has(t)))]
  const dataDependencies = [...new Set(conditions.map(c => conditionDataDependency(c.type)).filter((d): d is string => !!d))]
  const eligibilityConds = conditions.filter(c => ELIGIBILITY_TYPES.has(c.type))

  const result: RadarDiagnosticResult = {
    ok: true,
    code: 'OK',
    evaluatedFixtures: 0,
    eligibleFixtures: 0,
    sufficientDataFixtures: 0,
    wouldTrigger: 0,
    blockedReasons: {},
    unsupportedConditions,
    dataDependencies,
    sampleFixtures: [],
    warnings: [],
  }

  if (unsupportedConditions.length > 0) {
    result.warnings.push(`Condições não suportadas pelo motor: ${unsupportedConditions.join(', ')} (sempre falham na avaliação)`)
  }

  const repos = createRepositories()
  const fixtures = await repos.fixtures.listLive(LIVE_STATUSES, input.limit ?? 20)

  if (fixtures.length === 0) {
    result.code = 'NO_LIVE_FIXTURES'
    return result
  }

  const pseudoPattern = {
    id: 'diagnostic',
    name: 'diagnostic',
    conditions,
    minConfidence: input.minConfidence,
    severity: input.severity,
    requireRichData: input.requireRichData,
    action: 'register_alert', // force real-fire evaluation regardless of chosen action
    status: 'active',
  }

  const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] || 0) + 1 }

  for (const fixture of fixtures) {
    const snapshot = await repos.liveSnapshots.findLatestByFixture(fixture.id)
    if (!snapshot) continue
    const capturedAt = (snapshot as any).capturedAt
    const age = Date.now() - (typeof capturedAt === 'string' ? new Date(capturedAt) : capturedAt).getTime()
    if (age > SNAPSHOT_MAX_AGE_MS) continue

    const inputData = buildPatternInput(fixture as any, snapshot as any)
    result.evaluatedFixtures++
    if (inputData.dataQuality !== 'poor') result.sufficientDataFixtures++

    // Eligibility = all eligibility conditions match (when to evaluate)
    const eligible = eligibilityConds.every(c => evaluateCondition(c, inputData))
    if (eligible) result.eligibleFixtures++

    const evalResult = evaluatePatternAgainstInput(pseudoPattern, inputData)

    if (evalResult.shouldAlert) {
      result.wouldTrigger++
    } else if (evalResult.signalState === 'blocked') {
      bump(result.blockedReasons, evalResult.blockers[0] || 'Bloqueado')
    } else {
      // Not firing — attribute to the specific conditions that failed
      for (const c of conditions) {
        if (!evaluateCondition(c, inputData)) bump(result.blockedReasons, CONDITION_LABEL[c.type] || c.type)
      }
    }

    if (result.sampleFixtures.length < 6) {
      result.sampleFixtures.push({
        matchLabel: inputData.matchLabel,
        competition: inputData.competition,
        minute: inputData.minute,
        score: inputData.score,
        signalState: evalResult.signalState,
        confidence: evalResult.confidence,
        matched: evalResult.matchedConditions,
        total: evalResult.totalConditions,
        dataQuality: inputData.dataQuality,
      })
    }
  }

  if (result.evaluatedFixtures > 0 && result.sufficientDataFixtures === 0) result.code = 'DATA_INSUFFICIENT'
  else if (unsupportedConditions.length > 0 && result.wouldTrigger === 0) result.code = 'UNSUPPORTED_CONDITION'

  return result
}
