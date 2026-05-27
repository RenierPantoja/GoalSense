/**
 * patternScopeAudit — pure helpers that describe a pattern's scope filters in
 * human language. Used by the Scanner row (audit chip) and the Patterns view
 * (configured radar row + advanced detail).
 *
 * No React, no IO — these helpers stay pure so non-UI consumers (tests,
 * evaluators, alert resolvers) can reuse them safely.
 */
import type { Pattern } from '../types/commandTypes'

/** Compact one-line label used in cards / list rows. */
export function scopeShortLabel(p: Pattern): string {
  if (p.scope === 'favorites_only') return 'Favoritos'
  if (p.scope === 'specific_leagues' && p.scopeFilter && p.scopeFilter.length > 0) return `${p.scopeFilter.length} liga${p.scopeFilter.length === 1 ? '' : 's'}`
  if (p.scope === 'specific_teams' && p.scopeFilter && p.scopeFilter.length > 0) return `${p.scopeFilter.length} time${p.scopeFilter.length === 1 ? '' : 's'}`
  if (p.scope === 'specific_matches' && p.matches && p.matches.length > 0) return `${p.matches.length} partida${p.matches.length === 1 ? '' : 's'}`
  if (p.matches && p.matches.length > 0) return `${p.matches.length} partida${p.matches.length === 1 ? '' : 's'}`
  return 'Todos'
}

/**
 * Multi-chip audit description. Returns a list of pt-BR phrases describing
 * the pattern's scope plus its include/exclude filters and live/pre-match
 * gates. Order matters — primary scope first, then filters, then exclusions.
 */
export function describePatternScope(p: Pattern): string[] {
  const parts: string[] = []
  if (p.scope === 'favorites_only') parts.push('Apenas favoritos')
  else if (p.scope === 'specific_leagues' && p.scopeFilter && p.scopeFilter.length > 0) parts.push(`${p.scopeFilter.length} liga${p.scopeFilter.length === 1 ? '' : 's'} selecionada${p.scopeFilter.length === 1 ? '' : 's'}`)
  else if (p.scope === 'specific_teams' && p.scopeFilter && p.scopeFilter.length > 0) parts.push(`${p.scopeFilter.length} time${p.scopeFilter.length === 1 ? '' : 's'} selecionado${p.scopeFilter.length === 1 ? '' : 's'}`)
  else if (p.scope === 'specific_matches' && p.matches && p.matches.length > 0) parts.push(`${p.matches.length} partida${p.matches.length === 1 ? '' : 's'} específica${p.matches.length === 1 ? '' : 's'}`)
  else parts.push('Todos os jogos')
  if (p.matches && p.matches.length > 0 && p.scope !== 'specific_matches') parts.push(`+${p.matches.length} partida${p.matches.length === 1 ? '' : 's'}`)
  if (p.requireRichData) parts.push('dados ricos')
  if (p.onlyLive) parts.push('apenas ao vivo')
  if (p.onlyPreMatch) parts.push('apenas pré-jogo')
  if (p.excludeLeagues && p.excludeLeagues.length > 0) parts.push(`exceto ${p.excludeLeagues.length} liga${p.excludeLeagues.length === 1 ? '' : 's'}`)
  if (p.excludeTeams && p.excludeTeams.length > 0) parts.push(`exceto ${p.excludeTeams.length} time${p.excludeTeams.length === 1 ? '' : 's'}`)
  if (p.excludeMatches && p.excludeMatches.length > 0) parts.push(`exceto ${p.excludeMatches.length} partida${p.excludeMatches.length === 1 ? '' : 's'}`)
  return parts
}
