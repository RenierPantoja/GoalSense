/**
 * Centralized Portuguese labels for match-detail UI.
 * Keeping accent-bearing strings in one place reduces the risk of encoding
 * regressions when files are saved with the wrong codepage.
 */

export const MATCH_TAB_LABELS = {
  summary: 'Resumo',
  pressure: 'Pressão',
  statistics: 'Estatísticas',
  timeline: 'Linha do tempo',
  narration: 'Narração',
  lineups: 'Elenco',
  preMatch: 'Pré-jogo',
} as const

export const EVENT_FILTER_LABELS = {
  important: 'Importantes',
  all: 'Todos',
  goals: 'Gols',
  cards: 'Cartões',
  substitutions: 'Substituições',
  shots: 'Finalizações',
} as const

export const LIVE_COPY = {
  liveNarration: 'Narração ao vivo',
  recentActions: 'Ações recentes',
  lastMinutes: 'Últimos 10 minutos',
  lastTen: 'Últimos',
  fewRelevantActions: 'Poucas ações relevantes nos últimos minutos.',
  noEventsInCategory: 'Nenhum evento nesta categoria.',
  matchNotFound: 'Partida não encontrada',
  detailsUnavailable: 'Detalhes indisponíveis para esta partida.',
  backToMatches: 'Voltar às Partidas',
  oneAction: 'ação',
  manyActions: 'ações',
} as const

export const STAT_LABELS = {
  shots: 'Finalizações',
  shotsOnTarget: 'No alvo',
  precision: 'Precisão',
  blocked: 'Bloqueadas',
  possession: 'Posse',
  accuratePasses: 'Passes certos',
  passes: 'Passes',
  passCompletion: 'Precisão',
  tackles: 'Desarmes',
  attempts: 'Tentativas',
  interceptions: 'Interceptações',
  saves: 'Defesas',
  clearances: 'Cortes',
  fouls: 'Faltas',
  yellowCards: 'Amarelos',
  redCards: 'Vermelhos',
  corners: 'Escanteios',
  offsides: 'Impedimentos',
  dangerousAttacks: 'Ataques perigosos',
  attacks: 'Ataques',
} as const

export const COVERAGE_LABELS = {
  statistics: 'Estatísticas',
  events: 'Eventos',
  narration: 'Narração',
  lineups: 'Escalações',
} as const
