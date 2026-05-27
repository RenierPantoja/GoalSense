/**
 * Command Center intelligence helpers.
 * Groups, prioritizes, and generates operational state from real data.
 */
import type { LiveFixture } from '@/lib/apiClient'
import { getMatchImportanceScore, getMatchImportanceReason } from '@/utils/matchImportance'
import { toScoring } from './utils/fixtureScoring'

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

// ─── Operational Decision per match ──────────────────────────────────────────

export interface OperationalDecision {
  action: 'open_now' | 'monitor' | 'prepare_alert' | 'watch_later' | 'low_priority'
  label: string
  reason: string
  urgency: number
  confidence: 'alta' | 'média' | 'baixa'
}

export function getOperationalDecision(fx: LiveFixture, isFavoriteTeam: (n: string) => boolean, _hasAlert: boolean): OperationalDecision {
  const live = isLiveFx(fx)
  const isFav = isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)
  const elapsed = fx.status.elapsed || 0
  const scoreDiff = Math.abs((fx.score.home ?? 0) - (fx.score.away ?? 0))
  const imp = getMatchImportanceScore(toScoring(fx))

  // Open now
  if (isFav && live) return { action: 'open_now', label: 'Abrir agora', reason: 'Favorito ao vivo', urgency: 95, confidence: 'alta' }
  if (live && elapsed >= 75 && scoreDiff <= 1) return { action: 'open_now', label: 'Abrir agora', reason: 'Reta final com placar curto', urgency: 90, confidence: 'alta' }
  if (live && imp >= 100) return { action: 'open_now', label: 'Abrir agora', reason: 'Jogo global ao vivo', urgency: 85, confidence: 'alta' }

  // Monitor
  if (live && imp >= 70) return { action: 'monitor', label: 'Monitorar', reason: 'Jogo relevante em andamento', urgency: 60, confidence: 'média' }
  if (live) return { action: 'monitor', label: 'Monitorar', reason: 'Ao vivo', urgency: 40, confidence: 'média' }

  // Prepare alert
  const diff = Math.round((new Date(fx.date).getTime() - Date.now()) / 60000)
  if (diff > 0 && diff <= 60 && imp >= 80) return { action: 'prepare_alert', label: 'Preparar alerta', reason: `Começa em ${diff} min`, urgency: 55, confidence: 'média' }
  if (diff > 0 && diff <= 60 && isFav) return { action: 'prepare_alert', label: 'Preparar alerta', reason: `Favorito começa em ${diff} min`, urgency: 65, confidence: 'alta' }

  // Watch later
  if (isFav && diff > 60) return { action: 'watch_later', label: 'Acompanhar depois', reason: 'Favorito joga mais tarde', urgency: 30, confidence: 'baixa' }
  if (imp >= 80 && diff > 60) return { action: 'watch_later', label: 'Acompanhar depois', reason: 'Jogo relevante mais tarde', urgency: 25, confidence: 'baixa' }

  return { action: 'low_priority', label: 'Baixa prioridade', reason: 'Pouca relevância atual', urgency: 10, confidence: 'baixa' }
}

// ─── Change Radar ────────────────────────────────────────────────────────────

export interface ChangeEvent {
  id: string
  text: string
  type: 'status_change' | 'final_phase' | 'new_live' | 'score_change' | 'soon'
}

export function detectChanges(current: LiveFixture[], previous: LiveFixture[] | null): ChangeEvent[] {
  if (!previous || previous.length === 0) return []
  const changes: ChangeEvent[] = []

  for (const fx of current) {
    const prev = previous.find(p => p.id === fx.id)
    if (!prev) {
      if (isLiveFx(fx)) changes.push({ id: `new-${fx.id}`, text: `${fx.homeTeam.name} x ${fx.awayTeam.name} entrou ao vivo`, type: 'new_live' })
      continue
    }
    // Entered final phase
    if ((fx.status.elapsed || 0) >= 75 && (prev.status.elapsed || 0) < 75) {
      changes.push({ id: `final-${fx.id}`, text: `${fx.homeTeam.name} x ${fx.awayTeam.name} entrou em reta final`, type: 'final_phase' })
    }
    // Score changed
    if ((fx.score.home ?? 0) + (fx.score.away ?? 0) > (prev.score.home ?? 0) + (prev.score.away ?? 0)) {
      changes.push({ id: `score-${fx.id}`, text: `Gol em ${fx.homeTeam.name} x ${fx.awayTeam.name}`, type: 'score_change' })
    }
  }

  return changes.slice(0, 5)
}

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
    liveWithStats: 0,
    providers: providers.length > 0 ? providers : ['espn'],
    lastUpdate: lastUpdate?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) || '—',
  }
}
