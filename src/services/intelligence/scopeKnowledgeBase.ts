/**
 * Scope Knowledge Base
 *
 * Progressive local memory of leagues, teams and matches the user has actually
 * seen in the app. Used by the Pattern Studio's ScopePicker to suggest
 * real entities even when they aren't in the current fixtures snapshot.
 *
 * - localStorage-backed
 * - non-blocking, try/catch around every IO
 * - bounded sizes (300 leagues / 1000 teams / 500 matches)
 * - non-destructive: existing entries get their lastSeen / countSeen updated
 */
import type { LiveFixture } from '@/lib/apiClient'
import { buildCanonicalMatchId } from '@/features/providers/canonicalMatchId'

export interface ScopeKbLeague {
  id: string
  name: string
  country?: string
  // V3.15 — rich metadata captured from fixtures (backward compatible, optional).
  logo?: string | null
  season?: string
  provider?: string
  lastSeen: number
  countSeen: number
}

export interface ScopeKbTeam {
  id: string
  name: string
  aliases?: string[]
  logo?: string | null
  country?: string
  // V3.15 — last league seen for this team (for grouping).
  league?: string
  provider?: string
  lastSeen: number
  countSeen: number
}

export interface ScopeKbMatch {
  canonicalMatchId: string
  homeTeam: string
  awayTeam: string
  league?: string
  date?: string
  status?: string
  // V3.15 — logos captured from fixtures so the match picker can render escudos.
  homeLogo?: string | null
  awayLogo?: string | null
  leagueLogo?: string | null
  provider?: string
  lastSeen: number
}

export interface ScopeKnowledge {
  leagues: ScopeKbLeague[]
  teams: ScopeKbTeam[]
  matches: ScopeKbMatch[]
  version: 1
}

const STORAGE_KEY = 'goalsense_scope_kb'
const MAX_LEAGUES = 300
const MAX_TEAMS = 1000
const MAX_MATCHES = 500

const EMPTY: ScopeKnowledge = { leagues: [], teams: [], matches: [], version: 1 }

function loadKb(): ScopeKnowledge {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<ScopeKnowledge>
    return {
      leagues: Array.isArray(parsed.leagues) ? parsed.leagues : [],
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      version: 1,
    }
  } catch {
    return { ...EMPTY }
  }
}

function saveKb(kb: ScopeKnowledge): void {
  try {
    // Trim to caps before saving (most recent / most seen wins)
    const trimmedLeagues = [...kb.leagues].sort((a, b) => (b.countSeen + b.lastSeen / 1e10) - (a.countSeen + a.lastSeen / 1e10)).slice(0, MAX_LEAGUES)
    const trimmedTeams = [...kb.teams].sort((a, b) => (b.countSeen + b.lastSeen / 1e10) - (a.countSeen + a.lastSeen / 1e10)).slice(0, MAX_TEAMS)
    const trimmedMatches = [...kb.matches].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, MAX_MATCHES)
    const next: ScopeKnowledge = { leagues: trimmedLeagues, teams: trimmedTeams, matches: trimmedMatches, version: 1 }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota / privacy mode */
  }
}

function leagueKey(league: { id?: number | string; name: string }) {
  return `${(league.name || '').trim().toLowerCase()}`
}

function teamKey(team: { id?: number | string; name: string }) {
  return `${(team.name || '').trim().toLowerCase()}`
}

/** Helper for ScopePicker: combined available leagues sorted by recency/frequency. */
export function getKnownLeagues(): string[] {
  const kb = loadKb()
  return kb.leagues.slice().sort((a, b) => b.lastSeen - a.lastSeen).map(l => l.name)
}

/** Rich version with full metadata for the V3.15 ScopePicker cards. */
export function getKnownLeaguesRich(): ScopeKbLeague[] {
  const kb = loadKb()
  return kb.leagues.slice().sort((a, b) => b.lastSeen - a.lastSeen)
}

export function getKnownTeams(): string[] {
  const kb = loadKb()
  return kb.teams.slice().sort((a, b) => b.lastSeen - a.lastSeen).map(t => t.name)
}

/** Rich version with full metadata for the V3.15 ScopePicker cards. */
export function getKnownTeamsRich(): ScopeKbTeam[] {
  const kb = loadKb()
  return kb.teams.slice().sort((a, b) => b.lastSeen - a.lastSeen)
}

export function getKnownMatches(): ScopeKbMatch[] {
  const kb = loadKb()
  return kb.matches.slice().sort((a, b) => b.lastSeen - a.lastSeen)
}

/**
 * Record entities seen in a fixtures batch. Non-blocking by design — failures
 * are swallowed so this can be called from render effects without risk.
 */
export function recordScopeEntities(fixtures: LiveFixture[]): void {
  if (!Array.isArray(fixtures) || fixtures.length === 0) return
  try {
    const kb = loadKb()
    const now = Date.now()

    const leagueIndex = new Map(kb.leagues.map(l => [leagueKey(l), l]))
    const teamIndex = new Map(kb.teams.map(t => [teamKey(t), t]))
    const matchIndex = new Map(kb.matches.map(m => [m.canonicalMatchId, m]))

    for (const fx of fixtures) {
      // League
      if (fx.league?.name) {
        const k = leagueKey(fx.league)
        const prev = leagueIndex.get(k)
        const fxLeagueLogo = fx.league.logo
        const fxLeagueSeason = fx.league.season ? String(fx.league.season) : undefined
        if (prev) {
          prev.lastSeen = now
          prev.countSeen = (prev.countSeen || 0) + 1
          if (!prev.country && fx.league.country) prev.country = fx.league.country
          if (!prev.provider && fx.provider) prev.provider = fx.provider
          if (!prev.logo && fxLeagueLogo) prev.logo = fxLeagueLogo
          if (!prev.season && fxLeagueSeason) prev.season = fxLeagueSeason
        } else {
          leagueIndex.set(k, {
            id: String(fx.league.id ?? fx.league.name),
            name: fx.league.name,
            country: fx.league.country || undefined,
            logo: fxLeagueLogo || null,
            season: fxLeagueSeason,
            provider: fx.provider,
            lastSeen: now,
            countSeen: 1,
          })
        }
      }

      // Teams
      for (const team of [fx.homeTeam, fx.awayTeam]) {
        if (!team?.name) continue
        const k = teamKey(team)
        const prev = teamIndex.get(k)
        if (prev) {
          prev.lastSeen = now
          prev.countSeen = (prev.countSeen || 0) + 1
          if (!prev.logo && team.logo) prev.logo = team.logo
          if (!prev.provider && fx.provider) prev.provider = fx.provider
          if (!prev.league && fx.league?.name) prev.league = fx.league.name
        } else {
          teamIndex.set(k, {
            id: String(team.id ?? team.name),
            name: team.name,
            logo: team.logo || null,
            league: fx.league?.name,
            provider: fx.provider,
            lastSeen: now,
            countSeen: 1,
          })
        }
      }

      // Match
      if (fx.homeTeam?.name && fx.awayTeam?.name) {
        const cmid = buildCanonicalMatchId(fx.homeTeam.name, fx.awayTeam.name, fx.date)
        const prev = matchIndex.get(cmid)
        const fxLeagueLogo = fx.league?.logo
        if (prev) {
          prev.lastSeen = now
          if (fx.status?.short) prev.status = fx.status.short
          if (!prev.homeLogo && fx.homeTeam.logo) prev.homeLogo = fx.homeTeam.logo
          if (!prev.awayLogo && fx.awayTeam.logo) prev.awayLogo = fx.awayTeam.logo
          if (!prev.leagueLogo && fxLeagueLogo) prev.leagueLogo = fxLeagueLogo
        } else {
          matchIndex.set(cmid, {
            canonicalMatchId: cmid,
            homeTeam: fx.homeTeam.name,
            awayTeam: fx.awayTeam.name,
            league: fx.league?.name,
            date: fx.date,
            status: fx.status?.short,
            homeLogo: fx.homeTeam.logo || null,
            awayLogo: fx.awayTeam.logo || null,
            leagueLogo: fxLeagueLogo || null,
            provider: fx.provider,
            lastSeen: now,
          })
        }
      }
    }

    saveKb({
      leagues: Array.from(leagueIndex.values()),
      teams: Array.from(teamIndex.values()),
      matches: Array.from(matchIndex.values()),
      version: 1,
    })
  } catch {
    /* swallow — never throws into render */
  }
}

/** Clear the scope KB (used by storage maintenance). */
export function clearScopeKnowledge(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

/** Stats for storage maintenance UI. */
export function getScopeKnowledgeStats(): { leagues: number; teams: number; matches: number; bytes: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { leagues: 0, teams: 0, matches: 0, bytes: 0 }
    const kb = JSON.parse(raw) as ScopeKnowledge
    return {
      leagues: kb.leagues?.length || 0,
      teams: kb.teams?.length || 0,
      matches: kb.matches?.length || 0,
      bytes: raw.length,
    }
  } catch {
    return { leagues: 0, teams: 0, matches: 0, bytes: 0 }
  }
}

/** Format a match for display in the chip picker. */
export function formatMatchLabel(m: ScopeKbMatch): string {
  const parts: string[] = [`${m.homeTeam} x ${m.awayTeam}`]
  if (m.league) parts.push(m.league)
  if (m.date) {
    const d = new Date(m.date)
    if (!isNaN(d.getTime())) {
      const today = new Date()
      const sameDay = d.toDateString() === today.toDateString()
      parts.push(sameDay ? 'hoje' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))
    }
  }
  if (m.status === 'LIVE' || m.status === '1H' || m.status === '2H' || m.status === 'HT') parts.push('ao vivo')
  return parts.join(' · ')
}
