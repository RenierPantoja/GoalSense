/**
 * Match navigation helper.
 * Stores clicked fixture in sessionStorage to guarantee it survives navigation.
 * React Router state can be unreliable with certain configs.
 */

import type { LiveFixture } from './apiClient'

const STORAGE_KEY = 'goalsense_clicked_fixture'

export function storeFixtureForNavigation(fixture: LiveFixture): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fixture))
  } catch { /* storage full or unavailable */ }
}

export function retrieveStoredFixture(): LiveFixture | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LiveFixture
  } catch { return null }
}

export function clearStoredFixture(): void {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* */ }
}
