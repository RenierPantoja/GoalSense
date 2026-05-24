/**
 * Registry of all free providers used by GoalSense.
 * Each provider declares its capabilities and priority.
 * Priority: 1 = highest, used first for that capability.
 */

import type { ProviderConfig } from './providerTypes'

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'espn',
    name: 'ESPN',
    priority: 1,
    enabled: true,
    capabilities: {
      liveScore: true,
      fixtures: true,
      standings: false,
      stats: true,
      events: true,
      lineups: true,
      logos: true,
      videos: false,
      rateLimited: false,
      experimental: false,
    },
  },
  {
    id: 'api_football',
    name: 'API-Football',
    priority: 2,
    enabled: true,
    capabilities: {
      liveScore: true,
      fixtures: true,
      standings: true,
      stats: true,
      events: true,
      lineups: true,
      logos: true,
      videos: false,
      rateLimited: true,
      experimental: false,
    },
  },
  {
    id: 'football_data',
    name: 'football-data.org',
    priority: 3,
    enabled: true,
    capabilities: {
      liveScore: true,
      fixtures: true,
      standings: true,
      stats: false,
      events: true, // goals, cards, subs only
      lineups: false,
      logos: true,
      videos: false,
      rateLimited: true,
      experimental: false,
    },
  },
  {
    id: 'thesportsdb',
    name: 'TheSportsDB',
    priority: 4,
    enabled: true,
    capabilities: {
      liveScore: false,
      fixtures: true,
      standings: false,
      stats: false,
      events: false,
      lineups: false,
      logos: true,
      videos: false,
      rateLimited: false,
      experimental: false,
    },
  },
  {
    id: 'scorebat',
    name: 'ScoreBat',
    priority: 5,
    enabled: true,
    capabilities: {
      liveScore: false,
      fixtures: false,
      standings: false,
      stats: false,
      events: false,
      lineups: false,
      logos: false,
      videos: true,
      rateLimited: false,
      experimental: false,
    },
  },
]

export function getProvider(id: string): ProviderConfig | undefined {
  return PROVIDERS.find(p => p.id === id)
}

export function getProvidersWithCapability(cap: keyof ProviderConfig['capabilities']): ProviderConfig[] {
  return PROVIDERS.filter(p => p.enabled && p.capabilities[cap]).sort((a, b) => a.priority - b.priority)
}
