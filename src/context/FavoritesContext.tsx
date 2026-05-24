/**
 * Global Favorites system with localStorage persistence.
 * Supports teams, leagues, and matches.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { normalizeTeamName } from '@/features/providers/teamNameNormalizer'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FavoriteTeam {
  id: string // normalized name as canonical ID
  name: string
  logo: string | null
  provider?: string
  createdAt: string
}

export interface FavoriteLeague {
  id: string
  name: string
  country?: string
  logo: string | null
  provider?: string
  createdAt: string
}

export interface FavoriteMatch {
  canonicalMatchId: string
  homeTeam: string
  awayTeam: string
  competition: string
  utcDate: string
  provider?: string
  createdAt: string
}

interface FavoritesState {
  teams: FavoriteTeam[]
  leagues: FavoriteLeague[]
  matches: FavoriteMatch[]
}

interface FavoritesContextValue {
  teams: FavoriteTeam[]
  leagues: FavoriteLeague[]
  matches: FavoriteMatch[]
  isFavoriteTeam: (nameOrId: string) => boolean
  toggleFavoriteTeam: (team: { name: string; logo?: string | null; provider?: string }) => void
  isFavoriteLeague: (idOrName: string) => boolean
  toggleFavoriteLeague: (league: { id: string; name: string; country?: string; logo?: string | null; provider?: string }) => void
  isFavoriteMatch: (canonicalMatchId: string) => boolean
  toggleFavoriteMatch: (match: { canonicalMatchId: string; homeTeam: string; awayTeam: string; competition: string; utcDate: string; provider?: string }) => void
  clearAll: () => void
  hasAnyFavorite: boolean
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'goalsense_favorites'

function loadFromStorage(): FavoritesState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { teams: [], leagues: [], matches: [] }
    const parsed = JSON.parse(raw)
    return {
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      leagues: Array.isArray(parsed.leagues) ? parsed.leagues : [],
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
    }
  } catch {
    return { teams: [], leagues: [], matches: [] }
  }
}

function saveToStorage(state: FavoritesState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* storage full or unavailable */ }
}

// ─── Context ─────────────────────────────────────────────────────────────────

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FavoritesState>(loadFromStorage)

  useEffect(() => { saveToStorage(state) }, [state])

  const getTeamId = useCallback((name: string) => normalizeTeamName(name), [])

  const isFavoriteTeam = useCallback((nameOrId: string) => {
    const id = getTeamId(nameOrId)
    return state.teams.some(t => t.id === id || getTeamId(t.name) === id)
  }, [state.teams, getTeamId])

  const toggleFavoriteTeam = useCallback((team: { name: string; logo?: string | null; provider?: string }) => {
    const id = getTeamId(team.name)
    setState(prev => {
      const exists = prev.teams.some(t => t.id === id)
      if (exists) {
        return { ...prev, teams: prev.teams.filter(t => t.id !== id) }
      }
      return { ...prev, teams: [...prev.teams, { id, name: team.name, logo: team.logo || null, provider: team.provider, createdAt: new Date().toISOString() }] }
    })
  }, [getTeamId])

  const isFavoriteLeague = useCallback((idOrName: string) => {
    const lower = idOrName.toLowerCase()
    return state.leagues.some(l => l.id === idOrName || l.name.toLowerCase() === lower)
  }, [state.leagues])

  const toggleFavoriteLeague = useCallback((league: { id: string; name: string; country?: string; logo?: string | null; provider?: string }) => {
    setState(prev => {
      const exists = prev.leagues.some(l => l.id === league.id)
      if (exists) {
        return { ...prev, leagues: prev.leagues.filter(l => l.id !== league.id) }
      }
      return { ...prev, leagues: [...prev.leagues, { ...league, logo: league.logo || null, createdAt: new Date().toISOString() }] }
    })
  }, [])

  const isFavoriteMatch = useCallback((canonicalMatchId: string) => {
    return state.matches.some(m => m.canonicalMatchId === canonicalMatchId)
  }, [state.matches])

  const toggleFavoriteMatch = useCallback((match: { canonicalMatchId: string; homeTeam: string; awayTeam: string; competition: string; utcDate: string; provider?: string }) => {
    setState(prev => {
      const exists = prev.matches.some(m => m.canonicalMatchId === match.canonicalMatchId)
      if (exists) {
        return { ...prev, matches: prev.matches.filter(m => m.canonicalMatchId !== match.canonicalMatchId) }
      }
      return { ...prev, matches: [...prev.matches, { ...match, createdAt: new Date().toISOString() }] }
    })
  }, [])

  const clearAll = useCallback(() => {
    setState({ teams: [], leagues: [], matches: [] })
  }, [])

  const hasAnyFavorite = state.teams.length > 0 || state.leagues.length > 0 || state.matches.length > 0

  return (
    <FavoritesContext.Provider value={{ teams: state.teams, leagues: state.leagues, matches: state.matches, isFavoriteTeam, toggleFavoriteTeam, isFavoriteLeague, toggleFavoriteLeague, isFavoriteMatch, toggleFavoriteMatch, clearAll, hasAnyFavorite }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider')
  return ctx
}
