/**
 * autoEngineTypes — frontend mirror of the B19 Auto Engine backend contracts.
 * ─────────────────────────────────────────────────────────────────────────────
 * Only the fields the UI consumes are typed; everything else stays optional/loose
 * and safe. Missing fields are treated as unknown/null by the UI. No odds, no
 * market, no probability: scores are signal-QUALITY. Opportunity ≠ alert.
 */

export type OpportunityType =
  | 'late_goal_pressure'
  | 'first_half_goal_pressure'
  | 'corners_pressure'
  | 'cards_pressure'
  | 'comeback_pressure'
  | 'dominant_home_pressure'
  | 'dominant_away_pressure'
  | 'pattern_similarity'
  | 'unknown'

export type OpportunityStatus = 'candidate' | 'watch' | 'strong' | 'blocked' | 'ignored'
export type ConfidenceBand = 'low' | 'medium' | 'high' | 'insufficient_data'
export type SampleQuality = 'insufficient' | 'low' | 'moderate' | 'strong'
export type DataQuality = 'rich' | 'partial' | 'poor' | 'unknown'
export type RiskDecision = 'allow' | 'reduce' | 'block'

export interface AutoSignalScoreDto {
  baseScore: number
  liveContextScore: number
  patternLearningScore: number
  competitionScore: number
  teamContextScore: number
  minuteWindowScore: number
  dataQualityScore: number
  riskPenalty: number
  finalScore: number
  scoringNotes: string[]
}

export interface AutoSignalEvidenceDto {
  liveStatsUsed: Record<string, number> | null
  minute: number | null
  scoreState: { home: number; away: number }
  recentOffensiveEvents: number
  passedSignals: string[]
  missingData: string[]
  dataQuality: DataQuality
  provider: string
}

export interface AutoSignalContextFitDto {
  competitionType: string | null
  importanceLabel: string | null
  minuteWindow: string
  matchedLearningContexts: string[]
  sampleQuality: SampleQuality
  source: 'observed' | 'heuristic' | 'limited'
  notes: string[]
}

export interface AutoSignalRiskGateDto {
  allowed: boolean
  blockReasons: string[]
  penalties: { reason: string; amount: number }[]
  warnings: string[]
  finalDecision: RiskDecision
}

export interface AutoSignalExplanationDto {
  headline: string
  whyNow: string[]
  evidenceUsed: string[]
  historicalContext: string[]
  risks: string[]
  relatedPatternNote: string | null
}

export interface AutoOpportunityDto {
  id: string
  runId: string
  fixtureId: string
  fixtureLabel: string
  leagueName: string
  homeTeam: string
  awayTeam: string
  minute: number | null
  scoreState: { home: number; away: number }
  opportunityType: OpportunityType
  status: OpportunityStatus
  score: number
  confidenceBand: ConfidenceBand
  scoreBreakdown: AutoSignalScoreDto
  evidence: AutoSignalEvidenceDto
  contextFit: AutoSignalContextFitDto
  riskGate: AutoSignalRiskGateDto
  relatedPatternIds: string[]
  learningProfileRefs: string[]
  dataAvailability: Record<string, boolean>
  explanation: AutoSignalExplanationDto
  createdAt: string
  updatedAt: string
}

export interface AutoEngineRunConfigDto {
  maxFixtures: number
  minSampleQuality: SampleQuality
  minScore: number
  maxOppsPerFixture: number
  write: boolean
  dryRun: boolean
}

export interface AutoEngineRunDto {
  id: string
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'completed' | 'failed' | 'skipped'
  enabled: boolean
  write: boolean
  config: AutoEngineRunConfigDto
  fixturesScanned: number
  opportunitiesFound: number
  strong: number
  watch: number
  candidate: number
  blocked: number
  blockReasons: Record<string, number>
  notes: string[]
  /** Present on a fresh scan response (ranked, not persisted unless write). */
  opportunities?: AutoOpportunityDto[]
}

export interface AutoEngineStatusDto {
  enabled: boolean
  writeEnabled: boolean
  schedulerEnabled: boolean
  toAlertsEnabled: boolean
  lastRun: AutoEngineRunDto | null
  opportunitiesTotal: number
  strong: number
  watch: number
  candidate: number
  blocked: number
  topOpportunityTypes: { type: string; count: number }[]
  dataQualityBreakdown: Record<string, number>
  blockReasons: Record<string, number>
  limitations: string[]
  latestOpportunities: AutoOpportunityDto[]
  generatedAt: string
}

export interface AutoEngineScanRequest {
  dryRun?: boolean
  limit?: number
  persist?: boolean
}

export interface AutoOpportunityFilters {
  status?: OpportunityStatus | ''
  type?: OpportunityType | ''
  league?: string
  team?: string
  minScore?: number
  confidenceBand?: ConfidenceBand | ''
  dataQuality?: DataQuality | ''
  blockReason?: string
  onlyBlocked?: boolean
  onlyStrong?: boolean
  query?: string
}

// ── Display label / tone maps (co-located, mirror of the convention) ─────────

export const OPP_TYPE_LABEL: Record<OpportunityType, string> = {
  late_goal_pressure: 'Pressão por gol — reta final',
  first_half_goal_pressure: 'Pressão por gol — 1º tempo',
  corners_pressure: 'Pressão de escanteios',
  cards_pressure: 'Jogo quente — cartões',
  comeback_pressure: 'Pressão de virada',
  dominant_home_pressure: 'Domínio do mandante',
  dominant_away_pressure: 'Domínio do visitante',
  pattern_similarity: 'Contexto parecido com radar',
  unknown: 'Oportunidade',
}

export const STATUS_LABEL: Record<OpportunityStatus, string> = {
  strong: 'Forte',
  watch: 'Em observação',
  candidate: 'Candidata',
  blocked: 'Bloqueada',
  ignored: 'Ignorada',
}

/** Sober tones — never betting green/red. Status is analytical, not a verdict. */
export const STATUS_TONE: Record<OpportunityStatus, string> = {
  strong: 'bg-[#13B8A6]/12 border-[#2DD4BF]/30 text-[#7FE9DC]',
  watch: 'bg-sky-500/10 border-sky-400/20 text-sky-200/80',
  candidate: 'bg-white/[0.05] border-white/[0.1] text-white/60',
  blocked: 'bg-amber-500/8 border-amber-400/18 text-amber-100/75',
  ignored: 'bg-white/[0.03] border-white/[0.07] text-white/40',
}

export const BAND_LABEL: Record<ConfidenceBand, string> = {
  high: 'Sinal alto',
  medium: 'Sinal médio',
  low: 'Sinal baixo',
  insufficient_data: 'Dados insuficientes',
}

export const SAMPLE_LABEL: Record<SampleQuality, string> = {
  strong: 'amostra forte',
  moderate: 'amostra moderada',
  low: 'amostra baixa',
  insufficient: 'amostra insuficiente',
}

export const DATA_QUALITY_LABEL: Record<DataQuality, string> = {
  rich: 'completos',
  partial: 'parciais',
  poor: 'pobres',
  unknown: 'desconhecidos',
}

/** Human pt-BR text for risk-gate block reasons (mirror of the backend map). */
export const BLOCK_REASON_LABEL: Record<string, string> = {
  auto_engine_disabled: 'motor automático desabilitado',
  not_live: 'partida não está ao vivo',
  data_poor: 'dados ao vivo pobres/desconhecidos',
  provider_stale: 'último dado do provedor desatualizado',
  missing_required_data: 'faltam estatísticas necessárias',
  sample_quality_insufficient: 'amostra histórica insuficiente',
  historically_weak: 'contexto histórico fraco',
  recent_manual_alert: 'já há alerta manual recente no jogo',
  duplicate_opportunity: 'oportunidade equivalente já existe',
  max_opportunities_per_fixture: 'limite de oportunidades por jogo atingido',
  score_below_minimum: 'score abaixo do mínimo',
  too_much_unknown: 'dados demais ausentes no contexto',
  no_evidence: 'sem evidência ao vivo suficiente',
}

export function blockReasonLabel(reason: string): string {
  return BLOCK_REASON_LABEL[reason] || reason.replace(/_/g, ' ')
}
