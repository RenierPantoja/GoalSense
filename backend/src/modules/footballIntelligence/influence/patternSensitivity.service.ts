/**
 * Pattern Family + Sensitivity Profiles (B46 / Bloco 3) — PURE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Knows which variables matter for each pattern family, so the same variable can
 * weigh differently per pattern. Advisory only; never alters patterns. A pattern
 * with unknown family falls back to a CONSERVATIVE default profile.
 */
import type {
  PatternFamily, PatternVariableSensitivityProfile, VariableInfluenceCategory,
} from './variableInfluence.types.js'

function norm(s: string): string { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

/** Infer a pattern family from a pattern's id/name/type — deterministic keyword match. */
export function inferPatternFamily(pattern: { id?: string; name?: string; type?: string; family?: string }): PatternFamily {
  const hay = norm([pattern.family, pattern.type, pattern.name, pattern.id].filter(Boolean).join(' '))
  if (!hay) return 'unknown'
  if (/(btts|ambas marcam|both teams)/.test(hay)) return 'btts'
  if (/(clean sheet|nao sofre|sem sofrer|clean_sheet)/.test(hay)) return 'clean_sheet'
  if (/(late goal|gol tardio|fim de jogo|late_goal)/.test(hay)) return 'late_goal'
  if (/(first half|primeiro tempo|ht goal|1t)/.test(hay)) return 'first_half_goal'
  if (/(second half|segundo tempo|2t)/.test(hay)) return 'second_half_goal'
  if (/(comeback|virada)/.test(hay)) return 'comeback'
  if (/(red card|cartao vermelho|expulsao)/.test(hay)) return 'red_card'
  if (/(card|cartao|cartoes|booking)/.test(hay)) return 'cards'
  if (/(pressure|pressao|sufoco)/.test(hay)) return 'pressure'
  if (/(momentum|embalo)/.test(hay)) return 'momentum'
  if (/(collapse|colapso|defensive_collapse)/.test(hay)) return 'defensive_collapse'
  if (/(favorite|favorito|dominance)/.test(hay)) return 'favorite_dominance'
  if (/(underdog|zebra|resistance)/.test(hay)) return 'underdog_resistance'
  if (/(goal|gol|over|under|total)/.test(hay)) return 'goals'
  return 'unknown'
}

const COMMON_WAIT = ['lineup_missing', 'provider_domain_stale', 'critical_data_missing']
const COMMON_LIVE = ['live_stats_unavailable']
const COMMON_BLOCK = ['lineup_conflict', 'manual_data_conflict']

interface FamilyConfig {
  sensitiveCategories: VariableInfluenceCategory[]
  criticalVariables: string[]
  notes: string[]
}

const FAMILY_CONFIG: Record<PatternFamily, FamilyConfig> = {
  goals: {
    sensitiveCategories: ['lineup', 'player_importance', 'injury', 'tactical_matchup', 'goal_environment', 'team_memory', 'pattern_memory', 'live_event'],
    criticalVariables: ['attack_weakened', 'key_player_missing', 'defensive_line_weakened', 'tempo_dropped', 'early_goal'],
    notes: ['Ataque desfalcado pesa negativo; defesa adversária desfalcada pesa positivo.'],
  },
  btts: {
    sensitiveCategories: ['lineup', 'player_importance', 'tactical_matchup', 'goal_environment', 'team_memory', 'pattern_memory'],
    criticalVariables: ['attack_weakened', 'defensive_line_weakened', 'goalkeeper_changed'],
    notes: ['Depende dos dois ataques e das duas defesas.'],
  },
  clean_sheet: {
    sensitiveCategories: ['lineup', 'injury', 'suspension', 'player_importance', 'tactical_matchup', 'team_memory'],
    criticalVariables: ['defensive_line_weakened', 'goalkeeper_changed', 'attack_weakened'],
    notes: ['Zaga desfalcada/goleiro reserva pesa negativo; adversário sem atacante-chave pesa positivo; H2H antigo não pesa forte.'],
  },
  comeback: {
    sensitiveCategories: ['live_event', 'tactical_matchup', 'team_memory', 'match_importance'],
    criticalVariables: ['red_card_home', 'red_card_away', 'late_goal_pressure'],
    notes: ['Estado do placar e eventos ao vivo dominam.'],
  },
  late_goal: {
    sensitiveCategories: ['live_event', 'tactical_matchup', 'team_memory', 'pattern_memory', 'match_importance'],
    criticalVariables: ['late_goal_pressure', 'substitution_key_player_in', 'tempo_increased', 'tempo_dropped'],
    notes: ['Substituições, cansaço, pressão e necessidade de resultado pesam; memória de gols tardios ajuda.'],
  },
  first_half_goal: {
    sensitiveCategories: ['lineup', 'tactical_matchup', 'goal_environment', 'pattern_memory', 'live_event'],
    criticalVariables: ['early_goal', 'attack_weakened', 'tempo_dropped'],
    notes: ['Foco no início; tempo e ataque pesam.'],
  },
  second_half_goal: {
    sensitiveCategories: ['live_event', 'tactical_matchup', 'pattern_memory'],
    criticalVariables: ['substitution_key_player_in', 'tempo_increased', 'late_goal_pressure'],
    notes: ['Substituições e ritmo no 2T pesam.'],
  },
  cards: {
    sensitiveCategories: ['rivalry', 'knockout', 'match_importance', 'table_pressure', 'card_risk', 'team_memory', 'pattern_memory'],
    criticalVariables: ['derby_or_classic', 'knockout_match', 'card_pressure_high'],
    notes: ['Clássico/mata-mata/pressão pesam positivo; árbitro desconhecido vira incerteza; dado de cartões ausente limita.'],
  },
  red_card: {
    sensitiveCategories: ['rivalry', 'knockout', 'card_risk', 'live_event', 'team_memory'],
    criticalVariables: ['derby_or_classic', 'card_pressure_high', 'red_card_home', 'red_card_away'],
    notes: ['Intensidade e histórico de cartões pesam.'],
  },
  pressure: {
    sensitiveCategories: ['live_event', 'tactical_matchup', 'table_pressure', 'match_importance'],
    criticalVariables: ['tempo_increased', 'late_goal_pressure'],
    notes: ['Ambiente ao vivo domina.'],
  },
  momentum: {
    sensitiveCategories: ['live_event', 'tactical_matchup', 'team_memory'],
    criticalVariables: ['tempo_increased', 'tempo_dropped', 'early_goal'],
    notes: ['Eventos recentes e ritmo pesam.'],
  },
  defensive_collapse: {
    sensitiveCategories: ['lineup', 'injury', 'live_event', 'tactical_matchup'],
    criticalVariables: ['defensive_line_weakened', 'red_card_home', 'red_card_away'],
    notes: ['Desfalques defensivos e expulsões dominam.'],
  },
  favorite_dominance: {
    sensitiveCategories: ['home_away', 'player_importance', 'team_memory', 'match_importance'],
    criticalVariables: ['key_player_missing', 'home_advantage', 'away_weakness'],
    notes: ['Força relativa e desfalques do favorito pesam.'],
  },
  underdog_resistance: {
    sensitiveCategories: ['tactical_matchup', 'team_memory', 'match_importance', 'home_away'],
    criticalVariables: ['away_weakness', 'key_player_missing'],
    notes: ['Postura defensiva e desfalques do favorito pesam.'],
  },
  unknown: {
    sensitiveCategories: ['data_readiness', 'provider_quality', 'team_memory', 'lineup'],
    criticalVariables: [],
    notes: ['Família desconhecida — perfil conservador: tratar sinais como contextuais, exigir confirmação.'],
  },
}

export function getPatternSensitivityProfile(pattern: { id?: string; name?: string; type?: string; family?: string }): PatternVariableSensitivityProfile {
  const family = inferPatternFamily(pattern)
  const cfg = FAMILY_CONFIG[family] ?? FAMILY_CONFIG.unknown
  const conservative = family === 'unknown'
  return {
    patternId: String(pattern.id ?? 'unknown'),
    patternName: String(pattern.name ?? pattern.id ?? 'unknown'),
    patternFamily: family,
    sensitiveCategories: cfg.sensitiveCategories,
    criticalVariables: cfg.criticalVariables,
    blockingVariables: COMMON_BLOCK,
    waitVariables: COMMON_WAIT,
    liveConfirmationVariables: COMMON_LIVE,
    lowImpactVariables: conservative ? [] : ['rivalry', 'home_away'],
    notes: cfg.notes,
    limitations: [
      'Sensibilidade é advisory; não altera patterns.',
      ...(conservative ? ['Família desconhecida → perfil conservador (nada vira forte sem confirmação).'] : []),
    ],
  }
}

export function getSensitiveVariables(pattern: { id?: string; name?: string; type?: string; family?: string }): string[] {
  return getPatternSensitivityProfile(pattern).criticalVariables
}

export function explainPatternSensitivity(pattern: { id?: string; name?: string; type?: string; family?: string }): string {
  const p = getPatternSensitivityProfile(pattern)
  return `${p.patternName} (família ${p.patternFamily}): críticas [${p.criticalVariables.join(', ') || 'nenhuma específica'}]. ${p.notes[0] ?? ''}`
}
