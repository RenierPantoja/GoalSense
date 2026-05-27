/**
 * Trigger Library (V3.14)
 * ─────────────────────────────────────────────────────────────────────────────
 * Data-driven catalog of every gatilho the Trigger Lab exposes. Every entry
 * here is backed by a real condition the evaluator can resolve — no fake
 * triggers. Coverage tells the user how reliable provider data is for that
 * signal so they can decide what to combine.
 *
 * Pure module: no React, no UI tokens beyond Tailwind classes used by the
 * UI consumers. Safe to import from any layer (UI, tests, evaluators).
 */
import type { PatternConditionType } from '../types/commandTypes'

export type TriggerCategory = 'tempo' | 'placar' | 'pressao' | 'controle' | 'escanteios' | 'disciplina' | 'contexto'
export type TriggerCoverage = 'high' | 'medium' | 'variable'
export type TriggerMode = 'pre_match' | 'live' | 'post_match'

export interface TriggerSpec {
  id: string
  type: PatternConditionType
  category: TriggerCategory
  title: string
  description: string
  coverage: TriggerCoverage
  modes: TriggerMode[]
  defaultParams: Record<string, number | string | boolean>
  /** Bounds for the editable numeric params (used by the param editor). */
  paramBounds?: Partial<Record<string, { min: number; max: number; step?: number; label?: string }>>
  requires: string[]
}

export const TRIGGER_LIBRARY: TriggerSpec[] = [
  // ── TEMPO ───────────────────────────────────────────────────────────────────
  { id: 't_live', type: 'is_live', category: 'tempo', title: 'Partida ao vivo', description: 'Avalia somente quando a partida está em andamento.', coverage: 'high', modes: ['live'], defaultParams: {}, requires: ['status'] },
  { id: 't_prelive', type: 'is_pre_live', category: 'tempo', title: 'Começa em breve', description: 'Partida ainda não começou e está dentro do intervalo configurado.', coverage: 'high', modes: ['pre_match'], defaultParams: { minutes: 60 }, paramBounds: { minutes: { min: 5, max: 240, step: 5, label: 'minutos' } }, requires: ['status', 'date'] },
  { id: 't_minute', type: 'minute_between', category: 'tempo', title: 'Minuto entre', description: 'Avalia somente entre dois minutos da partida.', coverage: 'high', modes: ['live'], defaultParams: { min: 60, max: 90 }, paramBounds: { min: { min: 0, max: 120, label: 'min' }, max: { min: 0, max: 120, label: 'max' } }, requires: ['minute'] },
  { id: 't_final', type: 'is_final_phase', category: 'tempo', title: 'Reta final (70\'+)', description: 'Após o minuto 70 da partida.', coverage: 'high', modes: ['live'], defaultParams: {}, requires: ['minute'] },

  // ── PLACAR ──────────────────────────────────────────────────────────────────
  { id: 't_tied', type: 'score_tied', category: 'placar', title: 'Placar empatado', description: 'Mandante e visitante com o mesmo número de gols.', coverage: 'high', modes: ['live'], defaultParams: {}, requires: ['score'] },
  { id: 't_diff_lte', type: 'score_diff_lte', category: 'placar', title: 'Placar curto', description: 'Diferença no placar de no máximo X gols.', coverage: 'high', modes: ['live'], defaultParams: { maxDiff: 1 }, paramBounds: { maxDiff: { min: 0, max: 10, label: 'até' } }, requires: ['score'] },
  { id: 't_goals_gte', type: 'goals_total_gte', category: 'placar', title: 'Gols totais ≥', description: 'Soma dos gols de mandante e visitante alcançou o limite.', coverage: 'high', modes: ['live'], defaultParams: { value: 3 }, paramBounds: { value: { min: 0, max: 20, label: 'gols' } }, requires: ['score'] },
  { id: 't_goals_lte', type: 'goals_total_lte', category: 'placar', title: 'Gols totais ≤', description: 'Soma dos gols ainda abaixo do limite — útil para under/jogo travado.', coverage: 'high', modes: ['live'], defaultParams: { value: 1 }, paramBounds: { value: { min: 0, max: 20, label: 'gols' } }, requires: ['score'] },
  { id: 't_home_goals', type: 'home_goals_gte', category: 'placar', title: 'Mandante marcou ≥', description: 'Quantidade mínima de gols do mandante.', coverage: 'high', modes: ['live'], defaultParams: { value: 1 }, paramBounds: { value: { min: 0, max: 20, label: 'gols' } }, requires: ['score'] },
  { id: 't_away_goals', type: 'away_goals_gte', category: 'placar', title: 'Visitante marcou ≥', description: 'Quantidade mínima de gols do visitante.', coverage: 'high', modes: ['live'], defaultParams: { value: 1 }, paramBounds: { value: { min: 0, max: 20, label: 'gols' } }, requires: ['score'] },

  // ── PRESSÃO OFENSIVA ────────────────────────────────────────────────────────
  { id: 't_shots_recent', type: 'shots_recent_gte', category: 'pressao', title: 'Finalizações totais ≥', description: 'Soma de finalizações dos dois times.', coverage: 'medium', modes: ['live'], defaultParams: { value: 8 }, paramBounds: { value: { min: 0, max: 50, label: 'finalizações' } }, requires: ['stats'] },
  { id: 't_shots_total', type: 'shots_total_gte', category: 'pressao', title: 'Finalizações totais grandes', description: 'Atinge volume alto de finalizações na partida.', coverage: 'medium', modes: ['live'], defaultParams: { value: 18 }, paramBounds: { value: { min: 0, max: 50, label: 'finalizações' } }, requires: ['stats'] },
  { id: 't_sot', type: 'shots_on_target_gte', category: 'pressao', title: 'Chutes no alvo ≥', description: 'Soma de chutes no alvo dos dois times.', coverage: 'medium', modes: ['live'], defaultParams: { value: 4 }, paramBounds: { value: { min: 0, max: 30, label: 'no alvo' } }, requires: ['stats'] },
  { id: 't_home_sot', type: 'home_shots_on_target_gte', category: 'pressao', title: 'Mandante no alvo ≥', description: 'Mandante atingiu volume mínimo de chutes no alvo.', coverage: 'medium', modes: ['live'], defaultParams: { value: 3 }, paramBounds: { value: { min: 0, max: 30, label: 'no alvo' } }, requires: ['stats'] },
  { id: 't_away_sot', type: 'away_shots_on_target_gte', category: 'pressao', title: 'Visitante no alvo ≥', description: 'Visitante atingiu volume mínimo de chutes no alvo.', coverage: 'medium', modes: ['live'], defaultParams: { value: 3 }, paramBounds: { value: { min: 0, max: 30, label: 'no alvo' } }, requires: ['stats'] },

  // ── CONTROLE / DOMÍNIO ──────────────────────────────────────────────────────
  { id: 't_poss', type: 'possession_gte', category: 'controle', title: 'Posse acima de X%', description: 'Pelo menos um dos times atingiu posse alta.', coverage: 'medium', modes: ['live'], defaultParams: { value: 60 }, paramBounds: { value: { min: 30, max: 90, label: '% posse' } }, requires: ['stats'] },
  { id: 't_home_poss', type: 'home_possession_gte', category: 'controle', title: 'Posse mandante acima de X%', description: 'Mandante dominando a posse.', coverage: 'medium', modes: ['live'], defaultParams: { value: 58 }, paramBounds: { value: { min: 30, max: 90, label: '% posse' } }, requires: ['stats'] },
  { id: 't_away_poss', type: 'away_possession_gte', category: 'controle', title: 'Posse visitante acima de X%', description: 'Visitante controlando o jogo.', coverage: 'medium', modes: ['live'], defaultParams: { value: 50 }, paramBounds: { value: { min: 30, max: 90, label: '% posse' } }, requires: ['stats'] },

  // ── ESCANTEIOS ──────────────────────────────────────────────────────────────
  { id: 't_corners', type: 'corners_gte', category: 'escanteios', title: 'Escanteios totais ≥', description: 'Total de escanteios na partida.', coverage: 'variable', modes: ['live'], defaultParams: { value: 6 }, paramBounds: { value: { min: 0, max: 30, label: 'escanteios' } }, requires: ['stats'] },
  { id: 't_home_corners', type: 'home_corners_gte', category: 'escanteios', title: 'Escanteios mandante ≥', description: 'Mandante batendo escanteios em volume.', coverage: 'variable', modes: ['live'], defaultParams: { value: 4 }, paramBounds: { value: { min: 0, max: 30, label: 'escanteios' } }, requires: ['stats'] },
  { id: 't_away_corners', type: 'away_corners_gte', category: 'escanteios', title: 'Escanteios visitante ≥', description: 'Visitante batendo escanteios em volume.', coverage: 'variable', modes: ['live'], defaultParams: { value: 4 }, paramBounds: { value: { min: 0, max: 30, label: 'escanteios' } }, requires: ['stats'] },

  // ── DISCIPLINA ──────────────────────────────────────────────────────────────
  { id: 't_cards', type: 'cards_gte', category: 'disciplina', title: 'Cartões totais ≥', description: 'Soma dos cartões na partida (amarelos contam).', coverage: 'variable', modes: ['live'], defaultParams: { value: 4 }, paramBounds: { value: { min: 0, max: 20, label: 'cartões' } }, requires: ['stats'] },
  { id: 't_yellow', type: 'yellow_cards_gte', category: 'disciplina', title: 'Amarelos ≥', description: 'Total de cartões amarelos.', coverage: 'variable', modes: ['live'], defaultParams: { value: 4 }, paramBounds: { value: { min: 0, max: 20, label: 'amarelos' } }, requires: ['stats'] },
  { id: 't_red', type: 'red_cards_gte', category: 'disciplina', title: 'Vermelhos ≥', description: 'Pelo menos X expulsões na partida.', coverage: 'variable', modes: ['live'], defaultParams: { value: 1 }, paramBounds: { value: { min: 0, max: 5, label: 'vermelhos' } }, requires: ['stats'] },

  // ── CONTEXTO ────────────────────────────────────────────────────────────────
  { id: 't_fav', type: 'favorite_involved', category: 'contexto', title: 'Favorito envolvido', description: 'Pelo menos um time favorito está jogando.', coverage: 'high', modes: ['pre_match', 'live'], defaultParams: {}, requires: ['favorites'] },
]

export const TRIGGER_BY_TYPE: Record<PatternConditionType, TriggerSpec | undefined> = TRIGGER_LIBRARY.reduce((acc, t) => {
  acc[t.type] = t
  return acc
}, {} as Record<PatternConditionType, TriggerSpec | undefined>)

export const TRIGGER_CATEGORY_LABELS: Record<TriggerCategory, string> = {
  tempo: 'Tempo',
  placar: 'Placar',
  pressao: 'Pressão',
  controle: 'Controle',
  escanteios: 'Escanteios',
  disciplina: 'Disciplina',
  contexto: 'Contexto',
}

export const TRIGGER_CATEGORY_HINTS: Record<TriggerCategory, string> = {
  tempo: 'Quando o radar deve estar atento.',
  placar: 'Estado do placar e total de gols.',
  pressao: 'Volume ofensivo do jogo.',
  controle: 'Domínio territorial via posse.',
  escanteios: 'Cobertura varia por provedor.',
  disciplina: 'Cartões e expulsões.',
  contexto: 'Favoritos e contexto do usuário.',
}

export const COVERAGE_LABEL: Record<TriggerCoverage, string> = { high: 'Alta', medium: 'Média', variable: 'Variável' }
export const COVERAGE_TONE: Record<TriggerCoverage, string> = {
  high: 'text-emerald-200/80 bg-emerald-500/8 border-emerald-400/15',
  medium: 'text-cyan-200/80 bg-cyan-500/8 border-cyan-400/15',
  variable: 'text-amber-200/80 bg-amber-500/8 border-amber-400/15',
}

export const MODE_LABEL: Record<TriggerMode, string> = { pre_match: 'Pré', live: 'Ao vivo', post_match: 'Pós' }
