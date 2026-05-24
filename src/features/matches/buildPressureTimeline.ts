/**
 * Builds pressure timeline from normalized events.
 * Divides match into 5-minute blocks, assigns weighted pressure to each team.
 * Only uses real events — never invents pressure.
 */

import { normalizeEvents, type NormalizedEvent } from './normalizeMatchEvents'

export interface PressureBlock {
  startMinute: number
  endMinute: number
  homePressure: number
  awayPressure: number
}

export interface PressureTimeline {
  blocks: PressureBlock[]
  maxPressure: number
  currentMinute: number
  hasEnoughData: boolean
}

interface RawEvent { clock: string; text: string; type: string; team: string }

const EVENT_WEIGHTS: Record<NormalizedEvent['type'], number> = {
  goal: 6,
  shot: 3,
  corner: 3,
  foul: 1.5,
  yellow_card: 1,
  red_card: 1,
  substitution: 0.5,
  offside: 1,
  assist: 0,
  period_start: 0,
  period_end: 0,
  injury: 0,
  var: 0.5,
  other: 1,
}

// Shot subtypes get bonus weight from text analysis
function getShotBonus(text: string): number {
  const t = text.toLowerCase()
  if (t.includes('on target') || t.includes('saved') || t.includes('on goal')) return 1 // shot on target = 4 total
  if (t.includes('blocked')) return -1 // blocked = 2 total
  return 0
}

function identifyTeam(ev: NormalizedEvent, homeName: string, awayName: string): 'home' | 'away' | null {
  const team = (ev.teamName || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

  const homeNorm = homeName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const awayNorm = awayName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const homeFirst = homeNorm.split(/\s+/)[0]
  const awayFirst = awayNorm.split(/\s+/)[0]

  // Direct inclusion match on team field
  if (team) {
    if (homeNorm.includes(team) || team.includes(homeNorm)) return 'home'
    if (awayNorm.includes(team) || team.includes(awayNorm)) return 'away'

    const teamFirst = team.split(/\s+/)[0]
    if (teamFirst.length >= 3) {
      if (teamFirst === homeFirst || homeNorm.includes(teamFirst) || teamFirst.includes(homeFirst)) return 'home'
      if (teamFirst === awayFirst || awayNorm.includes(teamFirst) || teamFirst.includes(awayFirst)) return 'away'
    }
  }

  // Try to identify from description or raw text (for commentary items without team field)
  const searchText = ((ev.description || '') + ' ' + (ev.rawText || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (searchText.length > 5) {
    if (homeFirst.length >= 3 && searchText.includes(homeFirst)) return 'home'
    if (awayFirst.length >= 3 && searchText.includes(awayFirst)) return 'away'
    for (const part of homeNorm.split(/\s+/)) {
      if (part.length >= 4 && searchText.includes(part)) return 'home'
    }
    for (const part of awayNorm.split(/\s+/)) {
      if (part.length >= 4 && searchText.includes(part)) return 'away'
    }
  }

  return null
}

export function buildPressureTimeline(
  rawEvents: RawEvent[],
  homeName: string,
  awayName: string,
  currentElapsed: number | null
): PressureTimeline {
  const normalized = normalizeEvents(rawEvents)
  const currentMinute = currentElapsed || Math.max(...normalized.map(e => e.minute), 45)

  // Count useful events (events that generate pressure)
  const usefulEvents = normalized.filter(e =>
    EVENT_WEIGHTS[e.type] > 0 && e.minute > 0 &&
    e.type !== 'period_start' && e.type !== 'period_end' && e.type !== 'injury'
  )
  const hasEnoughData = usefulEvents.length >= 2

  // Build 5-minute blocks
  const blocks: PressureBlock[] = []
  for (let m = 0; m < currentMinute; m += 5) {
    const endMin = Math.min(m + 5, currentMinute)
    let homePressure = 0
    let awayPressure = 0

    for (const ev of normalized) {
      if (ev.minute < m || ev.minute >= endMin) continue
      const weight = EVENT_WEIGHTS[ev.type] + (ev.type === 'shot' ? getShotBonus(ev.description) : 0)
      if (weight <= 0) continue

      const side = identifyTeam(ev, homeName, awayName)
      if (side === 'home') homePressure += weight
      else if (side === 'away') awayPressure += weight
      else {
        // Can't identify team — split pressure to keep graph alive
        homePressure += weight * 0.5
        awayPressure += weight * 0.5
      }
    }

    blocks.push({ startMinute: m, endMinute: endMin, homePressure, awayPressure })
  }

  // Normalize: find max single-block pressure
  const maxPressure = Math.max(...blocks.map(b => Math.max(b.homePressure, b.awayPressure)), 1)

  return { blocks, maxPressure, currentMinute, hasEnoughData }
}
