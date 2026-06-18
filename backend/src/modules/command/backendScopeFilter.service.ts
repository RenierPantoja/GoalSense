/**
 * Backend Scope Filter — enforces a pattern's scope/exclusions at runtime.
 * ─────────────────────────────────────────────────────────────────────────────
 * Until now the worker evaluated EVERY live fixture against EVERY active pattern,
 * ignoring the scope the user explicitly configured. This service closes that
 * gap so the engine always respects the radar's contract:
 *   - scope: all | favorites_only | specific_leagues | specific_teams | specific_matches
 *   - exclusions: excludeLeagues / excludeTeams / excludeMatches
 *   - timing: onlyPreMatch (the live worker only sees live fixtures, so a
 *     pre-match-only radar must not fire on a live game)
 *
 * Name matching is accent-insensitive and tolerant (normalized equality OR
 * containment) so "Brasileirão Série B" still matches "Serie B" etc. The favorite
 * resolution uses the favorite team / league names the frontend syncs into
 * extendedJson — the backend has no other notion of "favorites".
 */

export interface ScopePatternView {
  scope: string
  onlyLive?: boolean
  onlyPreMatch?: boolean
  scopeFilter?: string[] | null      // specific_leagues / specific_teams names
  matches?: string[] | null          // specific_matches (canonical keys or labels)
  excludeLeagues?: string[] | null
  excludeTeams?: string[] | null
  excludeMatches?: string[] | null
  favoriteTeams?: string[] | null
  favoriteLeagues?: string[] | null
}

export interface ScopeFixtureView {
  competition: string
  homeName: string
  awayName: string
  canonicalKey: string
}

export interface ScopeDecision {
  inScope: boolean
  reason: string
}

function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tolerant name match: normalized equality OR either side contains the other. */
function nameMatches(a: string, b: string): boolean {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))
}

function anyMatches(list: string[] | null | undefined, value: string): boolean {
  if (!list || list.length === 0) return false
  return list.some(item => nameMatches(item, value))
}

/** Match identifier match: canonical key OR "home vs away" label, accent-tolerant. */
function matchIdMatches(list: string[] | null | undefined, fx: ScopeFixtureView): boolean {
  if (!list || list.length === 0) return false
  const label = `${fx.homeName} vs ${fx.awayName}`
  const key = fx.canonicalKey || ''
  return list.some(item => {
    const ni = norm(item)
    return ni === norm(key) || nameMatches(item, label) ||
      (nameMatches(item, fx.homeName) && nameMatches(item, fx.awayName))
  })
}

export function evaluatePatternScope(pattern: ScopePatternView, fx: ScopeFixtureView): ScopeDecision {
  // ── Timing: the live worker only processes live fixtures ──────────────────
  // A radar restricted to pre-match must not fire on a live game.
  if (pattern.onlyPreMatch) {
    return { inScope: false, reason: 'Radar é apenas pré-jogo (worker ao vivo)' }
  }

  // ── Exclusions take precedence over any inclusion ─────────────────────────
  if (anyMatches(pattern.excludeLeagues, fx.competition)) {
    return { inScope: false, reason: `Liga excluída: ${fx.competition}` }
  }
  if (anyMatches(pattern.excludeTeams, fx.homeName) || anyMatches(pattern.excludeTeams, fx.awayName)) {
    return { inScope: false, reason: 'Time excluído presente na partida' }
  }
  if (matchIdMatches(pattern.excludeMatches, fx)) {
    return { inScope: false, reason: 'Partida excluída explicitamente' }
  }

  // ── Inclusion by scope ────────────────────────────────────────────────────
  switch (pattern.scope) {
    case 'all':
      return { inScope: true, reason: 'Escopo: todas as partidas' }

    case 'favorites_only': {
      const teamFav = anyMatches(pattern.favoriteTeams, fx.homeName) || anyMatches(pattern.favoriteTeams, fx.awayName)
      const leagueFav = anyMatches(pattern.favoriteLeagues, fx.competition)
      if (teamFav || leagueFav) return { inScope: true, reason: 'Escopo: favoritos' }
      // If the frontend never synced favorites we cannot resolve this radar
      // server-side; staying out avoids false positives across unrelated games.
      const hasFavData = (pattern.favoriteTeams?.length || 0) + (pattern.favoriteLeagues?.length || 0) > 0
      return { inScope: false, reason: hasFavData ? 'Sem favorito nesta partida' : 'Favoritos não sincronizados com o servidor' }
    }

    case 'specific_leagues': {
      if (anyMatches(pattern.scopeFilter, fx.competition)) return { inScope: true, reason: `Liga no escopo: ${fx.competition}` }
      return { inScope: false, reason: 'Liga fora do escopo configurado' }
    }

    case 'specific_teams': {
      if (anyMatches(pattern.scopeFilter, fx.homeName) || anyMatches(pattern.scopeFilter, fx.awayName)) {
        return { inScope: true, reason: 'Time no escopo configurado' }
      }
      return { inScope: false, reason: 'Nenhum time da partida está no escopo' }
    }

    case 'specific_matches': {
      if (matchIdMatches(pattern.matches, fx)) return { inScope: true, reason: 'Partida no escopo configurado' }
      return { inScope: false, reason: 'Partida fora do escopo configurado' }
    }

    default:
      // Unknown scope value — be permissive but honest.
      return { inScope: true, reason: `Escopo não reconhecido (${pattern.scope}); avaliando` }
  }
}

/** Parse a pattern's extendedJson into the scope-relevant fields. Safe on bad JSON. */
export function parseScopeExtended(extendedJson: string | null | undefined): {
  matches?: string[]; excludeLeagues?: string[]; excludeTeams?: string[]; excludeMatches?: string[]
  favoriteTeams?: string[]; favoriteLeagues?: string[]; maxTriggersPerMatch?: number
} {
  if (!extendedJson) return {}
  try {
    const e = JSON.parse(extendedJson)
    return {
      matches: Array.isArray(e.matches) ? e.matches : undefined,
      excludeLeagues: Array.isArray(e.excludeLeagues) ? e.excludeLeagues : undefined,
      excludeTeams: Array.isArray(e.excludeTeams) ? e.excludeTeams : undefined,
      excludeMatches: Array.isArray(e.excludeMatches) ? e.excludeMatches : undefined,
      favoriteTeams: Array.isArray(e.favoriteTeams) ? e.favoriteTeams : undefined,
      favoriteLeagues: Array.isArray(e.favoriteLeagues) ? e.favoriteLeagues : undefined,
      maxTriggersPerMatch: typeof e.maxTriggersPerMatch === 'number' ? e.maxTriggersPerMatch : undefined,
    }
  } catch {
    return {}
  }
}

/** Parse scopeFilterJson (array of names) safely. */
export function parseScopeFilter(scopeFilterJson: string | null | undefined): string[] | undefined {
  if (!scopeFilterJson) return undefined
  try {
    const v = JSON.parse(scopeFilterJson)
    return Array.isArray(v) ? v : undefined
  } catch {
    return undefined
  }
}
