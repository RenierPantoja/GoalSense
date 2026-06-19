/**
 * Auto Opportunity Actions (Phase B21) — auditable human interaction.
 * ─────────────────────────────────────────────────────────────────────────────
 * Save / dismiss / feedback / notes over auto opportunities. Append-only action
 * log + a derived user-state for fast list badges. Observational learning events
 * (source=user_feedback) are emitted for a few action types but NEVER counted as
 * statistical truth and NEVER auto-tune the engine. Nothing here creates an alert,
 * sends Telegram, alters a pattern, or changes a score.
 */
import { createRepositories } from '../../../repositories/index.js'
import type {
  AutoOpportunityAction, AutoOpportunityActionType, AutoOpportunityFeedbackType,
  AutoOpportunityActionSummary, AutoOpportunityUserState, AutoOpportunityFixtureContext, AutoOpportunity,
} from './autoEngine.types.js'
import type { LearningEvent, LearningEventType } from '../contracts/intelligence.types.js'
import { summarizeActions, userStateFromSummary, FEEDBACK_TO_ACTION } from './utils/autoOpportunityActions.util.js'

export { summarizeActions }

const STALE_MS = 5 * 60 * 1000

function actionId(): string { return `aoa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` }
function toDate(v: any): number { return (v instanceof Date ? v : new Date(v)).getTime() }

const LEARNING_FOR: Partial<Record<AutoOpportunityActionType, LearningEventType>> = {
  saved: 'auto_opportunity_saved',
  dismissed: 'auto_opportunity_dismissed',
  marked_useful: 'auto_opportunity_marked_useful',
  marked_not_useful: 'auto_opportunity_marked_not_useful',
  radar_proposal_created: 'auto_opportunity_radar_proposal_created',
}

export interface CreateActionInput {
  actionType: AutoOpportunityActionType
  feedbackType?: AutoOpportunityFeedbackType | null
  note?: string | null
  reason?: string | null
  metadata?: Record<string, unknown> | null
}

export interface ActionResult {
  ok: boolean
  error?: string
  action?: AutoOpportunityAction
  summary?: AutoOpportunityActionSummary
  userState?: AutoOpportunityUserState
}

export async function createOpportunityAction(opportunityId: string, input: CreateActionInput): Promise<ActionResult> {
  const repos = createRepositories()
  const opp = await repos.intelligence.getAutoOpportunity(opportunityId)
  if (!opp) return { ok: false, error: 'Oportunidade não encontrada.' }

  const action: AutoOpportunityAction = {
    id: actionId(), opportunityId, fixtureId: opp.fixtureId, userId: null,
    actionType: input.actionType, feedbackType: input.feedbackType ?? null,
    note: input.note ?? null, reason: input.reason ?? null, metadata: input.metadata ?? null,
    createdAt: new Date().toISOString(),
  }
  try { await repos.intelligence.createAutoOpportunityAction(action) } catch { /* never block */ }

  // Recompute derived state from the full log.
  const all = await repos.intelligence.listAutoOpportunityActionsByOpportunity(opportunityId).catch(() => [action])
  const summary = summarizeActions(opportunityId, all.length ? all : [action])
  const userState = userStateFromSummary(opportunityId, opp.fixtureId, summary)
  try { await repos.intelligence.upsertAutoOpportunityUserState(userState) } catch { /* never block */ }

  // Observational learning event (source=user_feedback) — never statistical truth.
  const evType = LEARNING_FOR[input.actionType]
  if (evType) {
    const ev: LearningEvent = {
      id: `lev_auto_${action.id}`, type: evType, fixtureId: opp.fixtureId, alertId: null,
      patternId: opp.relatedPatternIds?.[0] ?? null, contextKey: opp.leagueName || opp.opportunityType,
      message: `Feedback humano: ${input.actionType}${input.feedbackType ? ` (${input.feedbackType})` : ''} em ${opp.fixtureLabel}.`,
      evidenceRef: opportunityId, confidence: 'low', source: 'user_feedback', createdAt: action.createdAt,
    }
    try { await repos.intelligence.createLearningEvent(ev) } catch { /* never block */ }
  }

  return { ok: true, action, summary, userState }
}

export async function recordFeedback(opportunityId: string, feedbackType: AutoOpportunityFeedbackType, note?: string): Promise<ActionResult> {
  return createOpportunityAction(opportunityId, { actionType: FEEDBACK_TO_ACTION[feedbackType] || 'feedback_recorded', feedbackType, note: note ?? null })
}

export async function addNote(opportunityId: string, note: string): Promise<ActionResult> {
  const clean = (note || '').trim()
  if (!clean) return { ok: false, error: 'Nota vazia.' }
  return createOpportunityAction(opportunityId, { actionType: 'note_added', note: clean.slice(0, 500) })
}

export async function getActionSummary(opportunityId: string): Promise<AutoOpportunityActionSummary> {
  const repos = createRepositories()
  const all = await repos.intelligence.listAutoOpportunityActionsByOpportunity(opportunityId).catch(() => [])
  return summarizeActions(opportunityId, all)
}

export async function listActions(opportunityId: string, limit = 100): Promise<AutoOpportunityAction[]> {
  const repos = createRepositories()
  return repos.intelligence.listAutoOpportunityActionsByOpportunity(opportunityId, limit).catch(() => [])
}

// ── Server-side search with honest applied/unsupported filters ───────────────

export interface OpportunitySearchFilters {
  status?: string; type?: string; league?: string; team?: string
  minScore?: number; confidenceBand?: string; dataQuality?: string; blockReason?: string
  q?: string; saved?: boolean; dismissed?: boolean; feedbackType?: string
  limit?: number; cursor?: string
}

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export async function searchAutoOpportunities(filters: OpportunitySearchFilters): Promise<{
  items: AutoOpportunity[]; total: number; appliedFilters: string[]; unsupportedFilters: string[]
  userStates: Record<string, { saved: boolean; dismissed: boolean; lastFeedback: string | null; noteCount: number; hasPromotionPlan: boolean; promotedAlertId: string | null }>
}> {
  const repos = createRepositories()
  const limit = Math.min(Math.max(1, filters.limit || 200), 500)
  let rows = await repos.intelligence.listAutoOpportunities({ status: filters.status, type: filters.type, limit: 500 }).catch(() => [] as AutoOpportunity[])

  const applied: string[] = []
  if (filters.status) applied.push('status')
  if (filters.type) applied.push('type')
  if (filters.league) { rows = rows.filter(o => o.leagueName === filters.league); applied.push('league') }
  if (filters.team) { const q = norm(filters.team); rows = rows.filter(o => norm(o.homeTeam).includes(q) || norm(o.awayTeam).includes(q)); applied.push('team') }
  if (filters.minScore != null) { rows = rows.filter(o => o.score >= filters.minScore!); applied.push('minScore') }
  if (filters.confidenceBand) { rows = rows.filter(o => o.confidenceBand === filters.confidenceBand); applied.push('confidenceBand') }
  if (filters.dataQuality) { rows = rows.filter(o => o.evidence?.dataQuality === filters.dataQuality); applied.push('dataQuality') }
  if (filters.blockReason) { rows = rows.filter(o => (o.riskGate?.blockReasons as string[] | undefined)?.includes(filters.blockReason!)); applied.push('blockReason') }
  if (filters.q) { const q = norm(filters.q); rows = rows.filter(o => norm(o.fixtureLabel).includes(q) || norm(o.leagueName).includes(q)); applied.push('q') }

  // User-state-dependent filters (saved/dismissed/feedbackType) need the states map.
  const states = await repos.intelligence.listAutoOpportunityUserStates(500).catch(() => [])
  const stateById = new Map(states.map(s => [s.opportunityId, s]))
  if (filters.saved) { rows = rows.filter(o => stateById.get(o.id)?.saved); applied.push('saved') }
  if (filters.dismissed) { rows = rows.filter(o => stateById.get(o.id)?.dismissed); applied.push('dismissed') }
  if (filters.feedbackType) { rows = rows.filter(o => stateById.get(o.id)?.lastFeedback === filters.feedbackType); applied.push('feedbackType') }

  const unsupported: string[] = []
  if (filters.cursor) unsupported.push('cursor') // offset-cap only at current volume

  const total = rows.length
  const items = rows.slice(0, limit)
  const userStates: Record<string, { saved: boolean; dismissed: boolean; lastFeedback: string | null; noteCount: number; hasPromotionPlan: boolean; promotedAlertId: string | null }> = {}
  for (const o of items) {
    const s = stateById.get(o.id)
    if (s) userStates[o.id] = { saved: s.saved, dismissed: s.dismissed, lastFeedback: s.lastFeedback, noteCount: s.noteCount, hasPromotionPlan: s.hasPromotionPlan, promotedAlertId: s.promotedAlertId ?? null }
  }
  return { items, total, appliedFilters: applied, unsupportedFilters: unsupported, userStates }
}

// ── Read-only fixture context (resolves the B20 "open match" limitation) ─────

export async function getFixtureContext(fixtureId: string): Promise<AutoOpportunityFixtureContext> {
  const repos = createRepositories()
  const empty: AutoOpportunityFixtureContext = {
    fixtureId, found: false, fixtureLabel: null, homeTeam: null, awayTeam: null, league: null,
    status: null, minute: null, score: null, hasSnapshot: false, snapshotAgeMs: null,
    canOpenInCommandCenter: false, limitations: [],
  }
  const fx = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fx) { empty.limitations.push('Jogo não encontrado no backend (pode não estar mais ao vivo).'); return empty }

  const snap = await repos.liveSnapshots.findLatestByFixture(fixtureId).catch(() => null)
  const hasSnapshot = !!snap
  const snapshotAgeMs = snap ? Date.now() - toDate((snap as any).capturedAt) : null
  const live = ['1H', '2H', 'HT', 'ET', 'BT'].includes(String((fx as any).status))
  const limitations: string[] = []
  if (!hasSnapshot) limitations.push('Sem snapshot ao vivo recente.')
  if (snapshotAgeMs != null && snapshotAgeMs > STALE_MS) limitations.push('Último snapshot está desatualizado.')
  if (!live) limitations.push('Jogo não está mais ao vivo.')

  return {
    fixtureId, found: true,
    fixtureLabel: `${(fx as any).homeName} vs ${(fx as any).awayName}`,
    homeTeam: (fx as any).homeName ?? null, awayTeam: (fx as any).awayName ?? null,
    league: (fx as any).competition ?? null, status: (fx as any).status ?? null,
    minute: snap ? ((snap as any).minute ?? null) : null,
    score: snap ? { home: (snap as any).scoreHome ?? 0, away: (snap as any).scoreAway ?? 0 } : null,
    hasSnapshot, snapshotAgeMs, canOpenInCommandCenter: live, limitations,
  }
}
