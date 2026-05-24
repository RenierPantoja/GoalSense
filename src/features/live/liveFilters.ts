import type { LiveFixture } from '@/lib/apiClient'
import { isLiveStatus } from '@/lib/footballStatus'

export interface LiveFilters {
  country: string
  league: string
  source: string
  hasLogos: boolean
  status: 'all' | 'live' | 'halftime' | 'upcoming'
}

export const DEFAULT_FILTERS: LiveFilters = {
  country: 'all',
  league: 'all',
  source: 'all',
  hasLogos: false,
  status: 'all',
}

export function applyFilters(fixtures: LiveFixture[], filters: LiveFilters): LiveFixture[] {
  let result = fixtures

  if (filters.country !== 'all') {
    result = result.filter((f) => f.league.country === filters.country)
  }

  if (filters.league !== 'all') {
    result = result.filter((f) => f.league.name === filters.league)
  }

  if (filters.source !== 'all') {
    result = result.filter((f) => f.provider === filters.source)
  }

  if (filters.hasLogos) {
    result = result.filter((f) => f.homeTeam.logo && f.awayTeam.logo)
  }

  if (filters.status === 'live') {
    result = result.filter((f) => isLiveStatus(f.status.short) && f.status.short !== 'HT')
  } else if (filters.status === 'halftime') {
    result = result.filter((f) => f.status.short === 'HT')
  }

  return result
}

export function extractCountries(fixtures: LiveFixture[]): string[] {
  const set = new Set(fixtures.map((f) => f.league.country).filter(Boolean))
  return Array.from(set).sort()
}

export function extractLeagues(fixtures: LiveFixture[]): string[] {
  const set = new Set(fixtures.map((f) => f.league.name).filter(Boolean))
  return Array.from(set).sort()
}
