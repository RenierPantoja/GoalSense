/**
 * Pattern Studio formatters and templates taxonomy
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helpers: human-readable strings for conditions, template categorization
 * and the matching label maps. No React, no UI tokens beyond Tailwind classes
 * the consumers may pass through.
 */
import type { PatternCondition, PatternConditionType, PatternTemplate } from '../types/commandTypes'

export const COND_LABELS: Record<PatternConditionType, string> = {
  is_live: 'Jogo ao vivo',
  is_final_phase: 'Reta final (70\'+)',
  is_pre_live: 'Começa em breve',
  minute_between: 'Minuto entre',
  score_tied: 'Placar empatado',
  score_diff_lte: 'Diferença gols ≤',
  favorite_involved: 'Favorito envolvido',
  shots_recent_gte: 'Finalizações ≥',
  shots_on_target_gte: 'No alvo ≥',
  corners_gte: 'Escanteios ≥',
  cards_gte: 'Cartões ≥',
  possession_gte: 'Posse ≥',
  goals_total_gte: 'Gols totais ≥',
  goals_total_lte: 'Gols totais ≤',
  away_shots_on_target_gte: 'Visitante no alvo ≥',
  away_goals_gte: 'Gols visitante ≥',
  away_possession_gte: 'Posse visitante ≥',
  home_shots_on_target_gte: 'Mandante no alvo ≥',
  home_goals_gte: 'Gols mandante ≥',
  home_possession_gte: 'Posse mandante ≥',
  home_corners_gte: 'Escanteios mandante ≥',
  away_corners_gte: 'Escanteios visitante ≥',
  shots_total_gte: 'Finalizações totais ≥',
  yellow_cards_gte: 'Amarelos ≥',
  red_cards_gte: 'Vermelhos ≥',
}

/** Pretty-print a condition with its current params. */
export function formatConditionHuman(c: PatternCondition): string {
  const v = (k: string) => Number(c.params[k] ?? 0)
  switch (c.type) {
    case 'is_live': return 'Partida ao vivo'
    case 'is_final_phase': return 'Reta final (após 70\')'
    case 'is_pre_live': return `Começa em até ${v('minutes') || 60} minutos`
    case 'minute_between': return `Entre ${v('min')}\' e ${v('max')}\''`
    case 'score_tied': return 'Placar empatado'
    case 'score_diff_lte': return v('maxDiff') === 0 ? 'Placar empatado' : `Diferença no placar até ${v('maxDiff')} gol${v('maxDiff') === 1 ? '' : 's'}`
    case 'favorite_involved': return 'Favorito envolvido'
    case 'shots_recent_gte': return `Pelo menos ${v('value')} finalizações recentes`
    case 'shots_on_target_gte': return `Pelo menos ${v('value')} chutes no alvo`
    case 'corners_gte': return `${v('value')}+ escanteios`
    case 'cards_gte': return `${v('value')}+ cartões`
    case 'possession_gte': return `Posse acima de ${v('value')}%`
    case 'goals_total_gte': return `${v('value')}+ gols na partida`
    case 'goals_total_lte': return `Até ${v('value')} gol${v('value') === 1 ? '' : 's'} na partida`
    case 'away_shots_on_target_gte': return `Visitante com ${v('value')}+ chutes no alvo`
    case 'away_goals_gte': return `Visitante com ${v('value')}+ gols`
    case 'away_possession_gte': return `Visitante com posse acima de ${v('value')}%`
    case 'home_shots_on_target_gte': return `Mandante com ${v('value')}+ chutes no alvo`
    case 'home_goals_gte': return `Mandante com ${v('value')}+ gols`
    case 'home_possession_gte': return `Mandante com posse acima de ${v('value')}%`
    case 'home_corners_gte': return `Mandante com ${v('value')}+ escanteios`
    case 'away_corners_gte': return `Visitante com ${v('value')}+ escanteios`
    case 'shots_total_gte': return `${v('value')}+ finalizações totais`
    case 'yellow_cards_gte': return `${v('value')}+ cartões amarelos`
    case 'red_cards_gte': return `${v('value')}+ cartões vermelhos`
  }
}

export type TemplateCategory = 'pressao' | 'reta_final' | 'favoritos' | 'gols' | 'disciplina' | 'visitante'

export function categorizeTemplate(t: PatternTemplate): TemplateCategory {
  const id = t.id.toLowerCase()
  if (id.includes('card')) return 'disciplina'
  if (id.includes('away') || id.includes('dangerous_away') || id.includes('visitante')) return 'visitante'
  if (id.includes('favorite') || id.includes('underdog')) return 'favoritos'
  if (id.includes('open') || id.includes('over') || id.includes('locked')) return 'gols'
  if (id.includes('final') || id.includes('late') || id.includes('hot_second')) return 'reta_final'
  return 'pressao'
}

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  pressao: 'Pressão ofensiva',
  reta_final: 'Reta final',
  favoritos: 'Favoritos e zebras',
  gols: 'Gols',
  disciplina: 'Disciplina',
  visitante: 'Visitante / mandante',
}
