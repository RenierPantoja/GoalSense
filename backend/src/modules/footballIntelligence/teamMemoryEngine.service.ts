/**
 * Team Memory Engine (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * The GoalSense should remember what it already analyzed about each club. Reads
 * its OWN history (team learning profiles + signal ledger + alert outcomes) — never
 * a provider. Small samples are flagged small and never over-weighted. Empty memory
 * is `insufficient_history`, never a negative finding. unknown/not_evaluable ≠ failed.
 */
import { createRepositories } from '../../repositories/index.js'

function norm(s: string): string { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() }

export interface TeamIntelligenceMemory {
  teamName: string
  sampleSize: number
  sampleQuality: 'insufficient' | 'low' | 'moderate' | 'strong'
  fixturesAnalyzed: number
  patternsTriggered: number
  patternsConfirmed: number
  patternsConfirmedPartial: number
  patternsFailed: number
  unknownOutcomes: number
  notEvaluable: number
  competitionsAnalyzed: string[]
  commonSuccessReasons: string[]
  commonFailureReasons: string[]
  dataQualityHistory: Record<string, number>
  limitations: string[]
  source: 'goalsense_internal_memory'
}

function sampleQuality(n: number): TeamIntelligenceMemory['sampleQuality'] {
  if (n >= 30) return 'strong'
  if (n >= 12) return 'moderate'
  if (n >= 4) return 'low'
  return 'insufficient'
}

export async function buildTeamMemory(teamName: string): Promise<TeamIntelligenceMemory> {
  const repos = createRepositories()
  const target = norm(teamName)
  const limitations: string[] = []

  let ledger: any[] = []
  let outcomes: any[] = []
  try { ledger = await repos.intelligence.listAllSignalLedgerEntries(2000) } catch { /* noop repo */ }
  try { outcomes = await repos.intelligence.listAllAlertOutcomes(2000) } catch { /* noop repo */ }

  const teamLedger = ledger.filter(e => norm(e.homeTeam) === target || norm(e.awayTeam) === target)
  const fixtureIds = new Set(teamLedger.map(e => e.fixtureId))
  const competitions = new Set(teamLedger.map(e => e.leagueName).filter(Boolean))
  const alertIds = new Set(teamLedger.map(e => e.alertId).filter(Boolean))

  const teamOutcomes = outcomes.filter(o => alertIds.has(o.alertId) || fixtureIds.has(o.fixtureId))
  let confirmed = 0, partial = 0, failed = 0, unknown = 0, notEval = 0
  const failureReasons = new Map<string, number>()
  const successReasons = new Map<string, number>()
  const dq: Record<string, number> = {}
  for (const o of teamOutcomes) {
    switch (o.result) {
      case 'confirmed': confirmed++; if (o.outcomeReason) successReasons.set(o.outcomeReason, (successReasons.get(o.outcomeReason) || 0) + 1); break
      case 'confirmed_partial': partial++; break
      case 'failed': failed++; if (o.outcomeReason) failureReasons.set(o.outcomeReason, (failureReasons.get(o.outcomeReason) || 0) + 1); break
      case 'unknown': case 'expired': unknown++; break
      default: notEval++; break
    }
    const q = o.dataQualityAtResolution || 'unknown'
    dq[q] = (dq[q] || 0) + 1
  }

  const sampleSize = teamOutcomes.length
  if (ledger.length === 0) limitations.push('Memória interna vazia (persistência Firebase desligada ou sem histórico) — insufficient_history, não é achado negativo.')
  if (sampleSize > 0 && sampleSize < 4) limitations.push('Amostra muito pequena — não tirar conclusões (sem tabu/curse).')

  const topN = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`)

  return {
    teamName,
    sampleSize,
    sampleQuality: sampleQuality(sampleSize),
    fixturesAnalyzed: fixtureIds.size,
    patternsTriggered: teamLedger.length,
    patternsConfirmed: confirmed,
    patternsConfirmedPartial: partial,
    patternsFailed: failed,
    unknownOutcomes: unknown,
    notEvaluable: notEval,
    competitionsAnalyzed: [...competitions],
    commonSuccessReasons: topN(successReasons),
    commonFailureReasons: topN(failureReasons),
    dataQualityHistory: dq,
    limitations,
    source: 'goalsense_internal_memory',
  }
}

export async function explainTeamMemory(teamName: string): Promise<string> {
  const m = await buildTeamMemory(teamName)
  if (m.sampleSize === 0) return `Sem histórico interno suficiente sobre ${teamName} (insufficient_history).`
  return `${teamName}: ${m.sampleSize} outcomes (${m.sampleQuality}); conf ${m.patternsConfirmed}/parcial ${m.patternsConfirmedPartial}/falha ${m.patternsFailed}/unknown ${m.unknownOutcomes}. unknown/not_evaluable não são falha.`
}

export async function compareTeamMemories(teamA: string, teamB: string): Promise<{ a: TeamIntelligenceMemory; b: TeamIntelligenceMemory; note: string }> {
  const [a, b] = await Promise.all([buildTeamMemory(teamA), buildTeamMemory(teamB)])
  return { a, b, note: 'Comparação observacional de memória interna; amostras pequenas não comparáveis com confiança.' }
}
