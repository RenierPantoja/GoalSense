/**
 * Taboo Intelligence (B45 / Bloco 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects historical CONSTRAINT candidates ("this club never X in context Y") WITHOUT
 * superstition. Governance is strict and PURE-backed (classifyTabooFromSample):
 *   - insufficient/weak/old samples are NEVER usable constraints;
 *   - a "100% so far" finding on a tiny sample is flagged `superstition_risk`;
 *   - later contradicting evidence flips it to `contradicted`;
 *   - only `supported` (strong + recent + net-positive) is a usable constraint.
 * Nothing here blocks an alert; it is advisory memory.
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import { evaluateSampleQuality, classifyTabooFromSample } from './memorySampleQuality.service.js'
import type { TabooCandidate, MemoryOrigin } from './fundamentalMemory.types.js'

function norm(s: string): string { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() }
function recencyDays(): number { return Number(env.HISTORICAL_MEMORY_RECENCY_DAYS ?? 730) }
function strongThreshold(): number { return Number(env.HISTORICAL_MEMORY_MIN_SAMPLE_FOR_STRONG ?? 8) }

const TABOO_CONTEXTS: Array<{ key: string; label: string; test: (e: any) => boolean }> = [
  { key: 'away_knockout', label: 'fora em mata-mata', test: e => e?.matchContext?.isKnockout === true },
  { key: 'high_importance', label: 'em jogo de alta importância', test: e => ['high', 'critical'].includes(e?.matchContext?.importanceLevel) },
]

/**
 * Detect taboo candidates for a team scope. A candidate is "X failed every recent time
 * in context Y" — but it is only emitted with an honest status (mostly NOT usable).
 */
export async function detectTabooCandidates(teamId: string): Promise<TabooCandidate[]> {
  const repos = createRepositories()
  const target = norm(teamId)
  const now = Date.now()
  const windowMs = recencyDays() * 86400000

  let ledger: any[] = []
  let outcomes: any[] = []
  try { ledger = await repos.intelligence.listAllSignalLedgerEntries(3000) } catch { /* noop */ }
  try { outcomes = await repos.intelligence.listAllAlertOutcomes(3000) } catch { /* noop */ }
  const ledgerByAlert = new Map<string, any>()
  for (const e of ledger) if (e.alertId) ledgerByAlert.set(e.alertId, e)

  const out: TabooCandidate[] = []
  for (const ctx of TABOO_CONTEXTS) {
    let supporting = 0, contradicting = 0, total = 0, recent = 0, outdated = 0
    for (const o of outcomes) {
      const e = o.alertId ? ledgerByAlert.get(o.alertId) : null
      if (!e) continue
      if (norm(e.homeTeam) !== target && norm(e.awayTeam) !== target) continue
      if (!ctx.test(e)) continue
      total++
      const t = new Date(o.resolvedAt || o.createdAt || e.createdAt).getTime()
      if (Number.isFinite(t) && (now - t) <= windowMs) recent++; else outdated++
      // "Constraint" = the negative outcome recurred (e.g., pattern failed in this context).
      if (o.result === 'failed') supporting++
      else if (o.result === 'confirmed' || o.result === 'confirmed_partial') contradicting++
    }
    if (total === 0) continue
    const sample = evaluateSampleQuality({ sampleSize: total, recentSampleSize: recent, outdatedSampleSize: outdated, strongThreshold: strongThreshold() })
    const verdict = classifyTabooFromSample({ sample, supportingCases: supporting, contradictingCases: contradicting })
    out.push({
      id: `tab_${target.replace(/\s+/g, '_')}__${ctx.key}`,
      scopeType: 'team', scopeKey: teamId, scopeLabel: teamId, contextKey: ctx.key,
      description: `${teamId} ${ctx.label}: padrão falhou ${supporting}/${total} (confirmou ${contradicting}).`,
      builtAt: new Date().toISOString(),
      sample, supportingCases: supporting, contradictingCases: contradicting,
      status: verdict.status, isUsableConstraint: verdict.isUsableConstraint, note: verdict.note,
      limitations: ['Restrição histórica observacional; amostra pequena/antiga nunca vira tabu; não bloqueia alerta.'],
      source: 'goalsense_internal_memory' as MemoryOrigin,
    })
  }
  return out
}

export function evaluateTabooCandidate(candidate: TabooCandidate): TabooCandidate {
  const verdict = classifyTabooFromSample({ sample: candidate.sample, supportingCases: candidate.supportingCases, contradictingCases: candidate.contradictingCases })
  return { ...candidate, status: verdict.status, isUsableConstraint: verdict.isUsableConstraint, note: verdict.note }
}

export function explainTabooCandidate(candidate: TabooCandidate): string {
  return `${candidate.description} → ${candidate.status}${candidate.isUsableConstraint ? ' (usável)' : ' (NÃO usável)'}. ${candidate.note}`
}

/** Drop weak/insufficient/superstition candidates, keeping only honest survivors. */
export function rejectWeakTaboos(candidates: TabooCandidate[]): TabooCandidate[] {
  return candidates.filter(c => c.status !== 'weak_sample' && c.status !== 'not_enough_data' && c.status !== 'superstition_risk')
}

export async function listSupportedHistoricalConstraints(teamId: string): Promise<TabooCandidate[]> {
  const candidates = await detectTabooCandidates(teamId)
  return candidates.filter(c => c.status === 'supported' && c.isUsableConstraint)
}

export async function detectTabooCandidatesForFixture(fixtureId: string): Promise<TabooCandidate[]> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return []
  const [home, away] = await Promise.all([
    detectTabooCandidates(fixture.homeName || '').catch(() => []),
    detectTabooCandidates(fixture.awayName || '').catch(() => []),
  ])
  return [...home, ...away]
}
