/**
 * Live Validation Index — PURE helpers (Phase B39).
 * ─────────────────────────────────────────────────────────────────────────────
 * Env-free, dependency-free building blocks for the session record index, scoped
 * metrics, and dynamic fixture attach. Safe to import from smoke tests. No I/O,
 * no env, no provider. `inferred` never pretends to be `exact`.
 */
import { createHash } from 'node:crypto'
import type { AttributionStrength } from '../liveValidationIndex.types.js'

/** Deterministic, idempotent record-link id: same (session, type, record) → same id. */
export function buildRecordLinkId(i: { validationSessionId: string; recordType: string; recordId: string }): string {
  const h = createHash('sha1').update([i.validationSessionId, i.recordType, i.recordId].join('|')).digest('hex').slice(0, 16)
  return `lvl_${h}`
}

/** Classify a record's attribution: exact when its validationSessionId matches the session. */
export function classifyAttribution(recordSessionId: string | null | undefined, sessionId: string): AttributionStrength {
  if (!recordSessionId) return 'inferred_fixture_window'
  return recordSessionId === sessionId ? 'exact_session_id' : 'inferred_fixture_window'
}

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/** Fuzzy name match used by scope filters: empty list matches all; else token containment. */
export function matchesScopeName(list: string[] | undefined, value: string): boolean {
  if (!list || list.length === 0) return true
  const v = norm(value)
  return list.some(x => { const n = norm(x); return n === v || (n.length >= 4 && v.includes(n)) || (v.length >= 4 && n.includes(v)) })
}

export interface ScopeMatchInput {
  leagueNames?: string[]
  teamNames?: string[]
  fixtureIds?: string[]
  competition?: string
  homeTeam?: string
  awayTeam?: string
  fixtureId?: string
}

/** Pure scope match: does a fixture belong to a session scope? Never invents data. */
export function matchesSessionScope(scope: ScopeMatchInput): { matched: boolean; scopeType: 'broad' | 'fixtureIds' | 'leagueNames' | 'teamNames' | 'none'; reasons: string[] } {
  const reasons: string[] = []
  if (scope.fixtureIds && scope.fixtureIds.length > 0) {
    const matched = !!scope.fixtureId && scope.fixtureIds.includes(scope.fixtureId)
    reasons.push(matched ? 'fixtureId explicitamente no escopo' : 'fixtureId fora da lista explícita')
    return { matched, scopeType: 'fixtureIds', reasons }
  }
  const hasLeague = !!(scope.leagueNames && scope.leagueNames.length > 0)
  const hasTeam = !!(scope.teamNames && scope.teamNames.length > 0)
  if (!hasLeague && !hasTeam) { reasons.push('escopo amplo (sem filtros) → qualquer fixture'); return { matched: true, scopeType: 'broad', reasons } }
  if (hasLeague && !matchesScopeName(scope.leagueNames, scope.competition || '')) {
    reasons.push('liga fora do escopo'); return { matched: false, scopeType: 'leagueNames', reasons }
  }
  if (hasTeam) {
    const home = matchesScopeName(scope.teamNames, scope.homeTeam || '')
    const away = matchesScopeName(scope.teamNames, scope.awayTeam || '')
    if (!home && !away) { reasons.push('nenhum time no escopo'); return { matched: false, scopeType: 'teamNames', reasons } }
    reasons.push('time no escopo')
  }
  reasons.push(hasLeague ? 'liga no escopo' : 'liga não filtrada')
  return { matched: true, scopeType: hasTeam ? 'teamNames' : 'leagueNames', reasons }
}
