/**
 * Fundamental Analysis Readiness Engine (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Before analyzing, decides whether there is ENOUGH base. Returns a readiness
 * status + readiness score (NOT a probability), what critical/optional data is
 * missing, and whether pre-match / live / post-match analysis is possible. Honest:
 * missing lineup near kickoff → wait_for_lineup; empty internal memory →
 * insufficient_history; live game with no stats → wait_for_live_data.
 */
import { createRepositories } from '../../repositories/index.js'
import type { CanonicalAnalysisReadiness, ReadinessStatus } from './footballIntelligence.types.js'
import { buildSquadAvailability } from './squadAvailabilityEngine.service.js'
import { buildTeamMemory } from './teamMemoryEngine.service.js'

const LIVE = ['1H', '2H', 'HT', 'ET', 'BT', 'P']
const FINISHED = ['FT', 'AET', 'PEN']

export async function buildFundamentalReadiness(fixtureId: string): Promise<CanonicalAnalysisReadiness | null> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return null

  const isLive = LIVE.includes(fixture.status)
  const isFinished = FINISHED.includes(fixture.status)
  const isPre = !isLive && !isFinished

  const [squad, snap, memHome, memAway] = await Promise.all([
    buildSquadAvailability(fixtureId),
    repos.liveSnapshots.findLatestByFixture(fixtureId).catch(() => null),
    buildTeamMemory(fixture.homeName || '').catch(() => null),
    buildTeamMemory(fixture.awayName || '').catch(() => null),
  ])

  const missingCritical: string[] = []
  const missingOptional: string[] = []
  const waitReasons: string[] = []

  // Pre-match data is largely absent.
  missingOptional.push('escalação', 'lesões', 'suspensões', 'tabela/classificação', 'confronto direto (H2H)', 'forma recente')

  const hasInternalMemory = (memHome?.sampleSize ?? 0) + (memAway?.sampleSize ?? 0) > 0
  if (!hasInternalMemory) missingOptional.push('memória interna dos clubes')

  const hasLiveStats = !!snap?.statsJson
  let canAnalyzeLive = false
  if (isLive) {
    if (!hasLiveStats) { waitReasons.push('Jogo ao vivo sem stats coletadas — aguardar dados ao vivo.'); missingCritical.push('stats ao vivo') }
    else canAnalyzeLive = true
  }

  // Lineup wait recommendation (temporal).
  if (squad?.waitForLineupRecommended) waitReasons.push('Escalação ainda não disponível (janela ~1h antes).')

  // Determine status.
  let status: ReadinessStatus
  if (isFinished) {
    status = 'partially_ready' // post-match study possible from snapshots
  } else if (isLive && !hasLiveStats) {
    status = 'wait_for_live_data'
  } else if (isLive && hasLiveStats) {
    status = hasInternalMemory ? 'partially_ready' : 'insufficient_history'
  } else if (isPre && squad?.waitForLineupRecommended) {
    status = 'wait_for_lineup'
  } else if (isPre) {
    // Pre-match within lineup window but we never collect lineups → provider limited.
    status = hasInternalMemory ? 'partially_ready' : 'provider_limited'
  } else {
    status = 'not_ready'
  }

  // Readiness score (0-100), readiness ONLY.
  let score = 20
  if (hasInternalMemory) score += 25
  if (hasLiveStats) score += 30
  if (isLive) score += 10
  if (isFinished) score += 15
  if (status === 'wait_for_lineup' || status === 'wait_for_live_data') score = Math.min(score, 45)
  score = Math.max(0, Math.min(100, score))

  const limitations = [
    'Prontidão ≠ probabilidade de acerto. Mede apenas se há base para analisar.',
    'Dados pré-jogo (escalação/lesões/suspensões/tabela/H2H) não são coletados — pré-jogo é provider_limited por natureza.',
  ]
  if (!hasInternalMemory) limitations.push('Sem memória interna (Firebase off ou histórico vazio) → insufficient_history, não é negativo.')

  return {
    status,
    score,
    missingCriticalData: [...new Set(missingCritical)],
    missingOptionalData: [...new Set(missingOptional)],
    waitReasons,
    canAnalyzePreMatch: isPre && hasInternalMemory,
    canAnalyzeLive,
    canAnalyzePostMatch: isFinished && !!snap,
    limitations,
  }
}
