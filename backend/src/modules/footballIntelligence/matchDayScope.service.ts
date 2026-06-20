/**
 * Match Day Scope (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Focuses on TODAY's matches, not the whole world. Reads only fixtures already
 * ingested by the backend (ESPN), respects LOCAL_MAX_LIVE_FIXTURES, and prioritizes
 * by live state, kickoff proximity, data sufficiency and competition relevance.
 * Never fetches "everything"; never invents fixtures.
 */
import { env } from '../../env.js'
import { createRepositories } from '../../repositories/index.js'
import { deriveMatchContext } from '../command/matchContext.service.js'

const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P']
const SCOPE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'NS', 'FT', 'AET', 'PEN']

export interface ScopedFixture {
  fixtureId: string
  homeTeam: string
  awayTeam: string
  competition: string
  status: string
  kickoffAt: string | null
  isLive: boolean
  isFinished: boolean
  priorityScore: number
  importanceLabel: string
  includedReasons: string[]
  skippedReasons: string[]
  dataSufficiency: 'live_data' | 'pending_kickoff' | 'finished' | 'unknown'
}

export interface MatchDayScope {
  date: string
  totalFixturesKnown: number
  scopedFixtures: ScopedFixture[]
  cap: number
  cappedOut: number
  limitations: string[]
  generatedAt: string
}

export interface ScopeFilters {
  competitions?: string[]
  onlyLive?: boolean
  maxFixtures?: number
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate()
}

function norm(s: string): string { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() }

async function readTodayFixtures(date: Date): Promise<any[]> {
  const repos = createRepositories()
  let rows: any[] = []
  try { rows = await repos.fixtures.listLive(SCOPE_STATUSES, 300) } catch { return [] }
  return rows.filter(f => {
    const st = f.startTime ? new Date(f.startTime) : null
    // Live/finished today, or scheduled today.
    if (st && isSameDay(st, date)) return true
    if (LIVE_STATUSES.includes(f.status)) return true // live now, count it regardless
    return false
  })
}

function scoreFixture(f: any): { priorityScore: number; importanceLabel: string; isLive: boolean; isFinished: boolean; included: string[]; skipped: string[]; dataSufficiency: ScopedFixture['dataSufficiency'] } {
  const isLive = LIVE_STATUSES.includes(f.status)
  const isFinished = ['FT', 'AET', 'PEN'].includes(f.status)
  const ctx = deriveMatchContext(f.competition)
  const included: string[] = []
  const skipped: string[] = []
  let score = 0
  if (isLive) { score += 50; included.push('jogo ao vivo agora') }
  else if (f.status === 'NS') { score += 20; included.push('começa hoje') }
  else if (isFinished) { score += 5; included.push('finalizado hoje (pós-jogo)') }
  score += Math.round(ctx.importance * 0.3)
  if (ctx.isKnockout) { score += 10; included.push('mata-mata/fase decisiva') }
  if (ctx.importanceLabel === 'decisiva' || ctx.importanceLabel === 'alta') included.push(`competição relevante (${ctx.importanceLabel})`)
  const dataSufficiency: ScopedFixture['dataSufficiency'] = isLive ? 'live_data' : isFinished ? 'finished' : f.status === 'NS' ? 'pending_kickoff' : 'unknown'
  return { priorityScore: score, importanceLabel: ctx.importanceLabel, isLive, isFinished, included, skipped, dataSufficiency }
}

export async function buildTodayMatchScope(date: Date = new Date(), filters: ScopeFilters = {}): Promise<MatchDayScope> {
  const limitations: string[] = []
  const all = await readTodayFixtures(date)
  if (all.length === 0) limitations.push('Nenhuma fixture de hoje no backend (ingestão ESPN pode estar desligada ou sem jogos hoje).')

  let working = all
  if (filters.competitions && filters.competitions.length > 0) {
    const wanted = filters.competitions.map(norm)
    working = working.filter(f => wanted.some(w => norm(f.competition).includes(w)))
  }
  if (filters.onlyLive) working = working.filter(f => LIVE_STATUSES.includes(f.status))

  const scored: ScopedFixture[] = working.map(f => {
    const s = scoreFixture(f)
    return {
      fixtureId: String(f.id), homeTeam: f.homeName || 'unknown', awayTeam: f.awayName || 'unknown',
      competition: f.competition || 'unknown', status: f.status, kickoffAt: f.startTime ? new Date(f.startTime).toISOString() : null,
      isLive: s.isLive, isFinished: s.isFinished, priorityScore: s.priorityScore, importanceLabel: s.importanceLabel,
      includedReasons: s.included, skippedReasons: s.skipped, dataSufficiency: s.dataSufficiency,
    }
  }).sort((a, b) => b.priorityScore - a.priorityScore)

  const cap = Math.min(filters.maxFixtures ?? env.LOCAL_MAX_LIVE_FIXTURES, env.LOCAL_MAX_LIVE_FIXTURES)
  let cappedOut = 0
  let selected = scored
  if (scored.length > cap) {
    cappedOut = scored.length - cap
    selected = scored.slice(0, cap)
    selected.forEach(() => {})
    scored.slice(cap).forEach(s => s.skippedReasons.push(`Fora do cap local de ${cap} jogos.`))
    limitations.push(`Escopo limitado ao cap local de ${cap} (${cappedOut} jogos fora — guard B31 respeitado).`)
  }

  return {
    date: date.toISOString().slice(0, 10),
    totalFixturesKnown: all.length,
    scopedFixtures: selected,
    cap,
    cappedOut,
    limitations,
    generatedAt: new Date().toISOString(),
  }
}

export async function listTodayFixtures(date: Date = new Date()): Promise<ScopedFixture[]> {
  return (await buildTodayMatchScope(date)).scopedFixtures
}

export async function selectFixturesForAnalysis(date: Date = new Date(), max?: number): Promise<ScopedFixture[]> {
  const scope = await buildTodayMatchScope(date, { maxFixtures: max })
  return scope.scopedFixtures
}

export function explainWhyFixtureIncluded(f: ScopedFixture): string {
  return f.includedReasons.length ? f.includedReasons.join('; ') : 'Incluída por estar no escopo do dia.'
}

export function explainWhyFixtureSkipped(f: ScopedFixture): string {
  return f.skippedReasons.length ? f.skippedReasons.join('; ') : 'Não pulada.'
}
