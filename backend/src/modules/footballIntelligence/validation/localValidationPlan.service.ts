/**
 * Local Validation Plan Engine (B49 / Bloco 6).
 * ─────────────────────────────────────────────────────────────────────────────
 * Plans a safe local validation for today's fixtures: selects within local caps,
 * estimates cost, and flags risks — WITHOUT calling any provider (estimate only).
 * Respects LOCAL_VALIDATION_MAX_FIXTURES and the local guards' intent. Never selects
 * "every game in the world".
 */
import { buildTodayMatchScope } from '../matchDayScope.service.js'
import { env } from '../../../env.js'
import type { LocalValidationPlan, ValidationPlanFixture, LocalValidationMode } from './localValidation.types.js'

function maxFixtures(): number {
  return Math.min(Number(env.LOCAL_VALIDATION_MAX_FIXTURES ?? 10), Number(env.LOCAL_MAX_LIVE_FIXTURES ?? 10))
}
function mode(): LocalValidationMode { return (String(env.LOCAL_VALIDATION_MODE) as LocalValidationMode) || 'shadow_only' }
export function isLocalValidationEnabled(): boolean { return String(env.ENABLE_LOCAL_LONG_RUN_VALIDATION).toLowerCase() === 'true' }

export async function buildTodayValidationPlan(date: Date = new Date()): Promise<LocalValidationPlan> {
  const scope = await buildTodayMatchScope(date).catch(() => null)
  const cap = maxFixtures()
  const all = scope?.scopedFixtures ?? []

  const fixtures: ValidationPlanFixture[] = []
  let selected = 0
  for (const f of all) {
    const reasons: string[] = []
    const skipReasons: string[] = []
    // Selection: live/finished or near kickoff, within cap, with some data sufficiency.
    const eligible = f.isLive || f.isFinished || f.dataSufficiency !== 'unknown'
    if (!eligible) skipReasons.push('Sem dados suficientes / fora de janela.')
    if (selected >= cap) skipReasons.push(`Limite local atingido (${cap}).`)
    const willSelect = eligible && selected < cap
    if (willSelect) { selected++; reasons.push(f.isLive ? 'Ao vivo.' : f.isFinished ? 'Finalizado (pós-jogo).' : 'Próximo do início.'); reasons.push(...f.includedReasons.slice(0, 1)) }
    fixtures.push({
      fixtureId: f.fixtureId, teams: `${f.homeTeam} x ${f.awayTeam}`, competition: f.competition, status: f.status,
      kickoffAt: f.kickoffAt, selected: willSelect, reasons, skipReasons: willSelect ? [] : skipReasons.length ? skipReasons : [...f.skippedReasons].slice(0, 1),
    })
  }

  const skippedCount = fixtures.length - selected
  // Cost estimate (no provider call here): per selected fixture, a handful of reads/writes.
  const estimatedFirebaseReads = selected * 12
  const estimatedFirebaseWrites = selected * 6
  const estimatedProviderCalls = String(env.ENABLE_PROVIDER_API_FOOTBALL).toLowerCase() === 'true' ? selected * 2 : 0

  const risks: string[] = []
  if (selected >= cap) risks.push(`Plano no limite (${cap} fixtures) — runs longos podem custar leituras/escritas no Firebase.`)
  if (estimatedProviderCalls > 0) risks.push('Provider configurado — chamadas reais possíveis (guardadas por ProviderUsageGuard).')
  if (String(env.PERSISTENCE_PROVIDER) !== 'firebase') risks.push('PERSISTENCE_PROVIDER≠firebase — métricas/casos não persistem (Noop).')

  return {
    date: scope?.date ?? date.toISOString().slice(0, 10), mode: mode(),
    totalFixturesKnown: scope?.totalFixturesKnown ?? all.length, fixtures,
    selectedCount: selected, skippedCount, estimatedProviderCalls, estimatedFirebaseReads, estimatedFirebaseWrites,
    risks, limitations: ['Estimativa de custo é aproximada e não chama provider; seleção respeita limites locais.'],
  }
}

export function explainFixtureSelection(plan: LocalValidationPlan, fixtureId: string): string {
  const f = plan.fixtures.find(x => x.fixtureId === fixtureId)
  if (!f) return 'Fixture não encontrada no plano.'
  return f.selected ? `Selecionada: ${f.reasons.join(' ')}` : `Pulada: ${f.skipReasons.join(' ')}`
}

export function estimateValidationCost(plan: LocalValidationPlan): { reads: number; writes: number; providerCalls: number } {
  return { reads: plan.estimatedFirebaseReads, writes: plan.estimatedFirebaseWrites, providerCalls: plan.estimatedProviderCalls }
}

export function detectValidationRisks(plan: LocalValidationPlan): string[] { return plan.risks }
