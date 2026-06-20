/**
 * Match Context Engine (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Understands the NATURE of a match: competition type, stage, knockout/final,
 * importance, rivalry, home/away, momentum. Grounded in what we actually have
 * (competition name heuristic + ESPN live state + internal memory). Everything
 * not derivable is honestly `unknown` — no invented classics, no invented finals.
 */
import { createRepositories } from '../../repositories/index.js'
import { deriveMatchContext } from '../command/matchContext.service.js'
import type { CanonicalCompetitionContext, CanonicalMatchImportance, CanonicalMeta, ImportanceLevel } from './footballIntelligence.types.js'

function heuristicMeta(extra: string[] = []): CanonicalMeta {
  return {
    provider: 'heuristic', providerIds: {}, fetchedAt: new Date().toISOString(),
    dataQuality: 'partial', availability: 'partially_available', reliability: 'low', confidenceOfData: 'low',
    source: 'competition_name_heuristic', limitations: ['Derivado do nome da competição (texto), não de dados do provider.', ...extra],
  }
}

export type RivalryLevel = 'none' | 'derby' | 'classic' | 'high_pressure' | 'unknown'
export type PressureLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown'
export type VolatilityRisk = 'low' | 'medium' | 'high' | 'unknown'

export interface MatchContextProfile {
  fixtureId: string
  competitionContext: CanonicalCompetitionContext
  importance: CanonicalMatchImportance
  importanceLevel: ImportanceLevel
  pressureLevel: PressureLevel
  rivalryLevel: RivalryLevel
  rotationRisk: 'low' | 'medium' | 'high' | 'unknown'
  motivationAsymmetry: 'none' | 'possible' | 'unknown'
  volatilityRisk: VolatilityRisk
  tacticalConservatismExpected: 'low' | 'medium' | 'high' | 'unknown'
  homeAdvantageNote: string
  limitations: string[]
}

export async function buildMatchContext(fixtureId: string): Promise<MatchContextProfile | null> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return null

  const ctx = deriveMatchContext(fixture.competition)
  const meta = heuristicMeta()

  const importanceLevel: ImportanceLevel =
    ctx.importanceLabel === 'decisiva' ? 'critical' : ctx.importanceLabel === 'alta' ? 'high' : ctx.importanceLabel === 'média' ? 'medium' : 'low'

  const competitionContext: CanonicalCompetitionContext = {
    competition: { name: fixture.competition || 'unknown', competitionType: ctx.competitionType, country: null, meta },
    stage: ctx.stage,
    isKnockout: ctx.isKnockout,
    isFinal: ctx.stage === 'final',
    isSemiFinal: ctx.stage === 'semifinal',
    isTwoLegged: 'unknown',
    legType: 'unknown',
    aggregateScore: null,
    meta,
  }

  const importance: CanonicalMatchImportance = {
    importanceLevel,
    reasons: ctx.notes.length ? ctx.notes : ['Importância estimada pelo tipo/fase da competição.'],
    titleImplication: 'unknown',
    relegationImplication: 'unknown',
    continentalImplication: ctx.competitionType === 'continental' ? true : 'unknown',
    meta,
  }

  const limitations = [
    'Rivalidade/clássico não é coletado — marcado unknown (não inventamos clássico).',
    'Tabela/classificação ausente — implicação de título/rebaixamento é unknown.',
    'Rotação/motivação assimétrica não inferíveis sem escalação/contexto — unknown.',
  ]

  // Knockout / final raises volatility & pressure honestly; otherwise unknown-leaning.
  const pressureLevel: PressureLevel = importanceLevel === 'critical' ? 'critical' : importanceLevel === 'high' ? 'high' : importanceLevel === 'medium' ? 'medium' : 'low'
  const volatilityRisk: VolatilityRisk = ctx.isKnockout ? 'high' : importanceLevel === 'low' ? 'low' : 'medium'

  return {
    fixtureId,
    competitionContext,
    importance,
    importanceLevel,
    pressureLevel,
    rivalryLevel: 'unknown',
    rotationRisk: 'unknown',
    motivationAsymmetry: 'unknown',
    volatilityRisk,
    tacticalConservatismExpected: ctx.isKnockout ? 'high' : 'unknown',
    homeAdvantageNote: 'Desempenho casa/fora não coletado — vantagem de mando é unknown.',
    limitations,
  }
}
