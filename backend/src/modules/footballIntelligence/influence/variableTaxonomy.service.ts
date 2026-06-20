/**
 * Variable Taxonomy (B46 / Bloco 3) — PURE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Central catalogue of every variable the GoalSense can reason about. The taxonomy
 * ONLY defines variables (key, category, default direction tendency, default
 * limitations) — it does NOT decide influence by itself. Deterministic, env-free.
 */
import type {
  VariableInfluenceCategory, VariableInfluenceDirection,
} from './variableInfluence.types.js'

export interface VariableDefinition {
  variableKey: string
  category: VariableInfluenceCategory
  label: string
  /** Default tendency when present and reliable — still re-evaluated by the rule engine. */
  defaultDirection: VariableInfluenceDirection
  /** True when this variable describes an ABSENCE/limitation rather than a fact. */
  absenceLimitation: boolean
  explanation: string
  defaultLimitations: string[]
}

function def(
  variableKey: string, category: VariableInfluenceCategory, label: string,
  defaultDirection: VariableInfluenceDirection, absenceLimitation: boolean,
  explanation: string, defaultLimitations: string[] = [],
): VariableDefinition {
  return { variableKey, category, label, defaultDirection, absenceLimitation, explanation, defaultLimitations }
}

const ABSENCE = 'Ausência de dado nunca vira fato negativo; permanece limitação/incerteza.'

const DEFINITIONS: VariableDefinition[] = [
  // ── Lineup ──
  def('lineup_confirmed', 'lineup', 'Escalação confirmada', 'positive', false, 'Escalação confirmada habilita leitura.'),
  def('lineup_missing', 'lineup', 'Escalação ausente', 'wait', true, 'Escalação ainda não saiu — esperar, não concluir.', [ABSENCE]),
  def('lineup_conflict', 'lineup', 'Conflito de escalação', 'blocking', false, 'Provável × confirmada divergem — revisar.'),
  def('goalkeeper_changed', 'lineup', 'Goleiro alterado', 'negative', false, 'Mudança de goleiro pode afetar clean-sheet.'),
  def('defensive_line_weakened', 'lineup', 'Defesa enfraquecida', 'negative', false, 'Defesa desfalcada pesa contra clean-sheet/under.'),
  def('attack_weakened', 'lineup', 'Ataque enfraquecido', 'negative', false, 'Ataque desfalcado pesa contra padrões de gol.'),
  def('key_player_missing', 'player_importance', 'Jogador-chave ausente', 'negative', false, 'Ausência de jogador importante pode pesar alto SE importância for conhecida.'),
  def('key_player_returned', 'player_importance', 'Jogador-chave retornou', 'positive', false, 'Retorno de jogador importante reforça leitura.'),
  def('heavy_rotation_detected', 'lineup', 'Rodízio pesado', 'uncertain', false, 'Rodízio aumenta incerteza.'),
  // ── Injury / Suspension ──
  def('injury_report_unavailable', 'injury', 'Lesões indisponíveis', 'uncertain', true, 'Lesões não coletadas — unknown ≠ "sem lesão".', [ABSENCE]),
  def('key_injury_confirmed', 'injury', 'Lesão de titular confirmada', 'negative', false, 'Lesão confirmada de jogador relevante pesa.'),
  def('key_suspension_confirmed', 'suspension', 'Suspensão de titular confirmada', 'negative', false, 'Suspensão confirmada de jogador relevante pesa.'),
  def('suspension_data_missing', 'suspension', 'Suspensões indisponíveis', 'uncertain', true, 'Suspensões não coletadas — unknown ≠ "sem suspensão".', [ABSENCE]),
  def('injury_data_missing', 'injury', 'Dados de lesão ausentes', 'uncertain', true, 'Sem dados de lesão — não inferir ausência.', [ABSENCE]),
  def('player_importance_unknown', 'player_importance', 'Importância de jogador desconhecida', 'uncertain', true, 'Sem squads → importância desconhecida; não superestimar ausência.', [ABSENCE]),
  // ── Context ──
  def('derby_or_classic', 'rivalry', 'Clássico/derby', 'positive', false, 'Clássico tende a elevar cartões/intensidade (depende do padrão).'),
  def('knockout_match', 'knockout', 'Mata-mata', 'uncertain', false, 'Mata-mata altera comportamento (mais cauteloso/volátil).'),
  def('semi_final_or_final', 'match_importance', 'Semi/final', 'uncertain', false, 'Decisão eleva importância e cautela.'),
  def('relegation_pressure', 'table_pressure', 'Pressão de rebaixamento', 'uncertain', false, 'Pressão de tabela afeta postura.'),
  def('title_pressure', 'table_pressure', 'Pressão por título', 'uncertain', false, 'Pressão por título afeta postura.'),
  def('low_importance_match', 'match_importance', 'Jogo de baixa importância', 'uncertain', false, 'Baixa importância reduz previsibilidade de postura.'),
  def('asymmetric_motivation', 'match_importance', 'Motivação assimétrica', 'uncertain', false, 'Motivações diferentes entre os times.'),
  def('home_advantage', 'home_away', 'Mando de campo', 'positive', false, 'Mando pode favorecer certos padrões.'),
  def('away_weakness', 'home_away', 'Fraqueza fora de casa', 'positive', false, 'Fraqueza visitante pode favorecer o mandante.'),
  // ── Memory ──
  def('team_memory_supports_pattern', 'team_memory', 'Memória do time apoia', 'positive', false, 'Histórico interno favorável (apoio, não probabilidade).'),
  def('team_memory_contradicts_pattern', 'team_memory', 'Memória do time contradiz', 'negative', false, 'Histórico interno desfavorável.'),
  def('matchup_memory_supports_pattern', 'matchup_memory', 'Memória de confronto apoia', 'positive', false, 'Confronto direto interno favorável.'),
  def('matchup_memory_contradicts_pattern', 'matchup_memory', 'Memória de confronto contradiz', 'negative', false, 'Confronto direto interno desfavorável.'),
  def('taboo_supported', 'taboo', 'Restrição histórica suportada', 'negative', false, 'Restrição histórica usável (advisory, não bloqueia alerta real).'),
  def('taboo_weak', 'taboo', 'Restrição histórica fraca', 'uncertain', true, 'Restrição com amostra fraca — não usar.', [ABSENCE]),
  def('sample_too_small', 'team_memory', 'Amostra pequena', 'uncertain', true, 'Amostra pequena reduz magnitude — não concluir.', [ABSENCE]),
  def('similar_scenario_supports', 'similar_scenario', 'Cenário similar apoia', 'positive', false, 'Cenários similares observados (retrieval, não previsão).'),
  def('similar_scenario_warns', 'similar_scenario', 'Cenário similar alerta', 'negative', false, 'Cenários similares com resultado contrário.'),
  // ── Provider / Data ──
  def('provider_domain_missing', 'data_readiness', 'Domínio de provider ausente', 'uncertain', true, 'Domínio crítico ausente — pode exigir wait/stay-out, não é fato negativo.', [ABSENCE]),
  def('provider_domain_stale', 'data_readiness', 'Domínio de provider desatualizado', 'wait', false, 'Dado stale — atualizar antes de confiar.'),
  def('provider_not_configured', 'provider_quality', 'Provider não configurado', 'uncertain', true, 'Provider sem env não é chamado — limitação, não negativo.', [ABSENCE]),
  def('endpoint_not_implemented', 'provider_quality', 'Endpoint não implementado', 'uncertain', true, 'Endpoint não documentado — não adivinhar.', [ABSENCE]),
  def('critical_data_missing', 'data_readiness', 'Dado crítico ausente', 'wait', true, 'Dado crítico ausente — esperar/colher manual.', [ABSENCE]),
  def('manual_data_high_reliability', 'data_readiness', 'Manual de alta confiabilidade', 'positive', false, 'Dado manual confiável (badge manual; nunca finge provider).'),
  def('manual_data_conflict', 'data_readiness', 'Conflito de dado manual', 'blocking', false, 'Manual × provider em conflito — revisar.'),
  def('evidence_missing', 'data_readiness', 'Evidência ausente', 'uncertain', true, 'Sem evidência registrada — limitação.', [ABSENCE]),
  // ── Live ──
  def('red_card_home', 'live_event', 'Vermelho (mandante)', 'negative', false, 'Vermelho muda o jogo (depende do padrão).'),
  def('red_card_away', 'live_event', 'Vermelho (visitante)', 'negative', false, 'Vermelho muda o jogo (depende do padrão).'),
  def('early_goal', 'live_event', 'Gol cedo', 'positive', false, 'Gol cedo altera o ambiente de gols.'),
  def('late_goal_pressure', 'live_event', 'Pressão por gol tardio', 'positive', false, 'Pressão no fim favorece padrões de gol tardio.'),
  def('substitution_key_player_out', 'live_event', 'Saída de jogador-chave', 'negative', false, 'Saída de jogador importante afeta leitura.'),
  def('substitution_key_player_in', 'live_event', 'Entrada de jogador-chave', 'positive', false, 'Entrada de reforço afeta leitura.'),
  def('tempo_increased', 'tactical_matchup', 'Ritmo aumentou', 'positive', false, 'Mais ritmo favorece gols/cartões.'),
  def('tempo_dropped', 'tactical_matchup', 'Ritmo caiu', 'negative', false, 'Menos ritmo desfavorece gols.'),
  def('card_pressure_high', 'card_risk', 'Pressão de cartões alta', 'positive', false, 'Cartões acima da média favorecem padrões de cartão.'),
  def('live_stats_unavailable', 'live_event', 'Stats ao vivo ausentes', 'live_confirmation_required', true, 'Ao vivo sem stats — exigir confirmação ao vivo.', [ABSENCE]),
]

const BY_KEY = new Map(DEFINITIONS.map(d => [d.variableKey, d]))

export function listVariableCategories(): VariableInfluenceCategory[] {
  return [...new Set(DEFINITIONS.map(d => d.category))]
}

export function listVariablesForCategory(category: VariableInfluenceCategory): VariableDefinition[] {
  return DEFINITIONS.filter(d => d.category === category)
}

export function listAllVariables(): VariableDefinition[] {
  return [...DEFINITIONS]
}

export function getVariableDefinition(variableKey: string): VariableDefinition | null {
  return BY_KEY.get(variableKey) ?? null
}

export function explainVariable(variableKey: string): string {
  const d = BY_KEY.get(variableKey)
  return d ? `${d.label} (${d.category}): ${d.explanation}` : `Variável desconhecida: ${variableKey}.`
}

export function getDefaultDirectionRules(variableKey: string): VariableInfluenceDirection {
  return BY_KEY.get(variableKey)?.defaultDirection ?? 'uncertain'
}

export function getDefaultLimitations(variableKey: string): string[] {
  return BY_KEY.get(variableKey)?.defaultLimitations ?? []
}

export function isAbsenceLimitation(variableKey: string): boolean {
  return BY_KEY.get(variableKey)?.absenceLimitation ?? false
}
