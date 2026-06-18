/**
 * Match Context Service — derives competition/stage/importance intelligence.
 * ─────────────────────────────────────────────────────────────────────────────
 * The backend only receives the competition as free-text (ESPN scoreboard
 * competition name). This service turns that text into a structured, conservative
 * read of the match's nature so the evaluator can:
 *   1. Reward genuinely high-stakes matches (finals, knockouts, derbies) with a
 *      small, bounded confidence nudge — never flipping a non-match into a match.
 *   2. Attach a human, auditable "why this match matters" note to each alert.
 *
 * No invented data: every signal here is parsed from strings we already store.
 * When nothing is recognizable we return `unknown` with neutral importance.
 */

export type CompetitionType = 'league' | 'cup' | 'continental' | 'national_team' | 'friendly' | 'unknown'
export type MatchStage = 'final' | 'semifinal' | 'quarterfinal' | 'round_of_16' | 'group' | 'knockout' | 'regular' | 'unknown'
export type ImportanceLabel = 'baixa' | 'média' | 'alta' | 'decisiva'

export interface MatchContext {
  competitionType: CompetitionType
  stage: MatchStage
  isKnockout: boolean
  /** 0..100 — how much this match's *context* matters, independent of the live state. */
  importance: number
  importanceLabel: ImportanceLabel
  /** Short, human, pt-BR explanations surfaced in the alert evidence. */
  notes: string[]
}

/** Lowercase + strip diacritics for resilient keyword matching. */
function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// Continental / high-prestige competitions (CONMEBOL, UEFA, intercontinental).
const CONTINENTAL_KEYS = [
  'libertadores', 'sudamericana', 'sul-americana', 'recopa',
  'champions league', 'champions', 'uefa', 'europa league', 'conference league',
  'conmebol', 'mundial', 'club world cup', 'fifa club',
]
// National-team competitions.
const NATIONAL_TEAM_KEYS = [
  'copa do mundo', 'world cup', 'eurocopa', 'euro ', 'copa america', 'copa américa',
  'nations league', 'eliminatorias', 'eliminatórias', 'qualifier', 'qualifiers',
]
// Cup / knockout competitions (domestic cups).
const CUP_KEYS = [
  'copa', 'cup', 'taca', 'taça', 'pokal', 'coppa', 'copa do brasil', 'fa cup',
  'efl cup', 'carabao', 'dfb', 'coupe', 'playoff', 'play-off', 'knockout', 'trophy',
]
const FRIENDLY_KEYS = ['amistoso', 'friendly', 'club friendly', 'preseason', 'pré-temporada', 'pre-season']

const STAGE_PATTERNS: { stage: MatchStage; keys: string[]; importance: number; note: string }[] = [
  { stage: 'final', keys: ['final', 'finais'], importance: 100, note: 'Final — partida decisiva' },
  { stage: 'semifinal', keys: ['semi', 'semifinal', 'semi-final', 'semifinais'], importance: 88, note: 'Semifinal — fase decisiva' },
  { stage: 'quarterfinal', keys: ['quarter', 'quartas', 'quarter-final', 'quartas de final'], importance: 78, note: 'Quartas de final — mata-mata' },
  { stage: 'round_of_16', keys: ['round of 16', 'oitavas', 'last 16'], importance: 70, note: 'Oitavas de final — mata-mata' },
  { stage: 'knockout', keys: ['knockout', 'mata-mata', 'eliminatoria', 'elimination', 'playoff', 'play-off', 'replay'], importance: 68, note: 'Fase eliminatória' },
  { stage: 'group', keys: ['group', 'grupo', 'fase de grupos', 'matchday'], importance: 48, note: 'Fase de grupos' },
]

function detectStage(n: string): { stage: MatchStage; importance: number; note: string | null } {
  // "final" must not match inside "semifinal"/"quarterfinal" — those are checked first.
  for (const p of STAGE_PATTERNS) {
    if (p.stage === 'final') continue
    if (p.keys.some(k => n.includes(k))) return { stage: p.stage, importance: p.importance, note: p.note }
  }
  // Plain "final" only when not part of semi/quarter (already returned above).
  const finalP = STAGE_PATTERNS[0]
  if (/\bfinal(s|es|is)?\b/.test(n)) return { stage: finalP.stage, importance: finalP.importance, note: finalP.note }
  return { stage: 'unknown', importance: 0, note: null }
}

function detectType(n: string): { type: CompetitionType; base: number; note: string | null } {
  if (FRIENDLY_KEYS.some(k => n.includes(k))) return { type: 'friendly', base: 22, note: 'Amistoso — menor relevância competitiva' }
  if (CONTINENTAL_KEYS.some(k => n.includes(k))) return { type: 'continental', base: 72, note: 'Competição continental de alto nível' }
  if (NATIONAL_TEAM_KEYS.some(k => n.includes(k))) return { type: 'national_team', base: 66, note: 'Competição de seleções' }
  if (CUP_KEYS.some(k => n.includes(k))) return { type: 'cup', base: 58, note: 'Competição de copa (mata-mata)' }
  return { type: 'league', base: 50, note: null }
}

export function deriveMatchContext(competition: string | null | undefined): MatchContext {
  const n = norm(competition || '')
  if (!n) {
    return { competitionType: 'unknown', stage: 'unknown', isKnockout: false, importance: 45, importanceLabel: 'média', notes: [] }
  }

  const t = detectType(n)
  const st = detectStage(n)
  const notes: string[] = []
  if (t.note) notes.push(t.note)
  if (st.note) notes.push(st.note)

  // Importance blends competition prestige (base) with stage weight (the
  // closer to a decision, the more it matters). Stage dominates when present.
  let importance = t.base
  if (st.importance > 0) importance = Math.round(t.base * 0.45 + st.importance * 0.55)
  importance = Math.max(0, Math.min(100, importance))

  const isKnockout = ['final', 'semifinal', 'quarterfinal', 'round_of_16', 'knockout'].includes(st.stage)
    || t.type === 'cup'

  const importanceLabel: ImportanceLabel =
    importance >= 85 ? 'decisiva' : importance >= 65 ? 'alta' : importance >= 45 ? 'média' : 'baixa'

  // Determine final stage label for league matches with no stage cue.
  const stage: MatchStage = st.stage !== 'unknown' ? st.stage : (t.type === 'league' ? 'regular' : 'unknown')

  return { competitionType: t.type, stage, isKnockout, importance, importanceLabel, notes }
}

/**
 * Bounded confidence nudge from match context. Conservative by design:
 *  - Only ever ADDS a small amount for genuinely high-stakes matches.
 *  - Friendlies get a small penalty (more false positives there).
 *  - Never turns a non-match into a match (the caller still gates on matchRatio).
 * Returns the signed delta (roughly -4..+6).
 */
export function contextConfidenceDelta(ctx: MatchContext): number {
  if (ctx.competitionType === 'friendly') return -4
  if (ctx.importanceLabel === 'decisiva') return 6
  if (ctx.importanceLabel === 'alta') return 4
  if (ctx.importanceLabel === 'média') return 1
  return 0
}
