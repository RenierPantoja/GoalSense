/**
 * Command Center intelligence helpers.
 * Groups, prioritizes, and generates operational state from real data.
 */
import type { LiveFixture } from '@/lib/apiClient'
import { getMatchImportanceScore, getMatchImportanceReason } from '@/utils/matchImportance'

function toScoring(fx: LiveFixture) {
  return { competition: { name: fx.league.name }, homeTeam: { name: fx.homeTeam.name, shortName: fx.homeTeam.name }, awayTeam: { name: fx.awayTeam.name, shortName: fx.awayTeam.name }, score: { fullTime: { home: fx.score.home, away: fx.score.away } }, status: fx.status.short === 'LIVE' || fx.status.short === 'HT' ? 'IN_PLAY' : fx.status.short === 'FT' ? 'FINISHED' : 'TIMED', utcDate: fx.date, area: { name: fx.league.country } }
}

export function isLiveFx(fx: LiveFixture) { return fx.status.short === 'LIVE' || fx.status.short === 'HT' || (fx as any).status?.state === 'in' }

// ─── Operational State ───────────────────────────────────────────────────────

export interface OperationalState {
  mode: 'active' | 'pre-round' | 'idle'
  headline: string
  metrics: { label: string; value: number; attention: boolean; color: string }[]
}

export function getOperationalState(fixtures: LiveFixture[], liveCount: number, soonCount: number, favCount: number, alertCount: number): OperationalState {
  const mainCount = Math.min(fixtures.length, 8)
  const mode = liveCount > 0 ? 'active' : soonCount > 0 ? 'pre-round' : 'idle'
  const headline = mode === 'active' ? `Rodada ativa · ${liveCount} ${liveCount === 1 ? 'jogo' : 'jogos'} ao vivo` : mode === 'pre-round' ? `Pré-rodada · ${soonCount} ${soonCount === 1 ? 'jogo começa' : 'jogos começam'} em breve` : 'Sem jogos ao vivo no momento'

  return {
    mode, headline,
    metrics: [
      { label: 'Ao vivo', value: liveCount, attention: liveCount > 0, color: 'emerald' },
      { label: 'Principais', value: mainCount, attention: true, color: 'cyan' },
      { label: 'Favoritos', value: favCount, attention: favCount > 0, color: 'rose' },
      { label: 'Alertas', value: alertCount, attention: alertCount > 0, color: 'amber' },
      { label: 'Em breve', value: soonCount, attention: soonCount > 0, color: 'violet' },
    ]
  }
}

// ─── Match Groups ────────────────────────────────────────────────────────────

export interface CommandGroup {
  id: string
  title: string
  matches: LiveFixture[]
}

export function groupCommandMatches(fixtures: LiveFixture[], isFavoriteTeam: (n: string) => boolean): CommandGroup[] {
  const groups: CommandGroup[] = []
  const live = fixtures.filter(isLiveFx)
  const sorted = [...live].sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a)))

  // High attention (live, high score)
  const highAttention = sorted.filter(fx => getMatchImportanceScore(toScoring(fx)) >= 90).slice(0, 4)
  if (highAttention.length > 0) groups.push({ id: 'high', title: 'Alta atenção', matches: highAttention })

  // Final phase (70+ minutes, close score)
  const finalPhase = live.filter(fx => (fx.status.elapsed || 0) >= 70 && Math.abs((fx.score.home ?? 0) - (fx.score.away ?? 0)) <= 1).slice(0, 4)
  if (finalPhase.length > 0) groups.push({ id: 'final', title: 'Reta final', matches: finalPhase })

  // Favorites
  const favs = fixtures.filter(fx => isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)).slice(0, 4)
  if (favs.length > 0) groups.push({ id: 'favorites', title: 'Favoritos', matches: favs })

  // Soon
  const soon = fixtures.filter(fx => fx.status.short === 'NS' && new Date(fx.date).getTime() - Date.now() <= 3600000 && new Date(fx.date).getTime() > Date.now()).sort((a, b) => getMatchImportanceScore(toScoring(b)) - getMatchImportanceScore(toScoring(a))).slice(0, 4)
  if (soon.length > 0) groups.push({ id: 'soon', title: 'Em breve', matches: soon })

  // Brazil
  const brazil = live.filter(fx => fx.league.name.toLowerCase().includes('brasil') || fx.league.country === 'Brazil').slice(0, 3)
  if (brazil.length > 0) groups.push({ id: 'brazil', title: 'Brasil', matches: brazil })

  // Global
  const global = live.filter(fx => { const n = fx.league.name.toLowerCase(); return n.includes('premier') || n.includes('champions') || n.includes('la liga') || n.includes('serie a') || n.includes('bundesliga') }).slice(0, 4)
  if (global.length > 0 && !groups.some(g => g.id === 'high')) groups.push({ id: 'global', title: 'Global', matches: global })

  return groups
}

// ─── Decision Match Reason ───────────────────────────────────────────────────

export function getDecisionReason(fx: LiveFixture, isFavoriteTeam: (n: string) => boolean): string {
  const live = isLiveFx(fx)
  const isFav = isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)
  const elapsed = fx.status.elapsed || 0
  const scoreDiff = Math.abs((fx.score.home ?? 0) - (fx.score.away ?? 0))

  if (isFav && live) return 'Favorito ao vivo em campo'
  if (live && elapsed >= 75 && scoreDiff <= 1) return 'Reta final com placar apertado'
  if (live && elapsed >= 75) return 'Jogo em fase decisiva'
  if (live && getMatchImportanceScore(toScoring(fx)) >= 100) return 'Jogo global ao vivo com alta relevância'
  if (live) return 'Partida ao vivo relevante'
  const diff = Math.round((new Date(fx.date).getTime() - Date.now()) / 60000)
  if (diff > 0 && diff <= 30) return 'Começa em menos de 30 minutos'
  if (diff > 0 && diff <= 60) return 'Partida relevante prestes a começar'
  return getMatchImportanceReason(toScoring(fx))
}

// ─── Action Plan ─────────────────────────────────────────────────────────────

export interface ActionItem {
  label: string
  target: string
}

export function getActionPlan(liveCount: number, favCount: number, alertCount: number, soonCount: number): ActionItem[] {
  const actions: ActionItem[] = []
  if (liveCount > 0) actions.push({ label: 'Ver todos os jogos ao vivo', target: '/app/live' })
  if (soonCount > 0) actions.push({ label: 'Ver partidas em breve', target: '/app/matches' })
  if (favCount === 0) actions.push({ label: 'Favoritar times para personalizar', target: '/app/matches' })
  if (alertCount === 0) actions.push({ label: 'Criar alertas de monitoramento', target: '/app/alerts' })
  actions.push({ label: 'Abrir Live Radar completo', target: '/app/live' })
  actions.push({ label: 'Ver calendário de partidas', target: '/app/matches' })
  return actions.slice(0, 5)
}

// ─── Data Health (advanced) ──────────────────────────────────────────────────

export interface DataHealth {
  totalFixtures: number
  withLogos: number
  liveWithStats: number
  providers: string[]
  lastUpdate: string
}

export function getDataHealth(fixtures: LiveFixture[], lastUpdate: Date | null): DataHealth {
  const withLogos = fixtures.filter(fx => fx.homeTeam.logo && fx.awayTeam.logo).length
  const providers = [...new Set(fixtures.map(fx => fx.provider).filter(Boolean))]
  return {
    totalFixtures: fixtures.length,
    withLogos,
    liveWithStats: 0, // would need stats data
    providers: providers.length > 0 ? providers : ['espn'],
    lastUpdate: lastUpdate?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) || '—',
  }
}
