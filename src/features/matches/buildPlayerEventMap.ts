/**
 * Builds a map of player names → event badges for lineup display.
 * Uses normalized events to associate goals, cards, and subs with players.
 */

import { normalizeEvents, type NormalizedEvent } from './normalizeMatchEvents'

export interface PlayerBadge {
  type: 'goal' | 'yellow_card' | 'red_card' | 'sub_in' | 'sub_out' | 'assist'
  minute: number
  label: string
}

export type PlayerEventMap = Map<string, PlayerBadge[]>

interface RawEvent { clock: string; text: string; type: string; team: string }

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['.~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getLastName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1] || ''
}

export function buildPlayerEventMap(rawEvents: RawEvent[]): PlayerEventMap {
  const map: PlayerEventMap = new Map()
  const normalized = normalizeEvents(rawEvents)

  function addBadge(name: string, badge: PlayerBadge) {
    if (!name || name.length < 2) return
    const key = normalizeName(name)
    if (!map.has(key)) map.set(key, [])
    // Avoid duplicates
    const existing = map.get(key)!
    const dup = existing.find(b => b.type === badge.type && b.minute === badge.minute)
    if (!dup) existing.push(badge)
  }

  for (const ev of normalized) {
    switch (ev.type) {
      case 'goal':
        if (ev.playerName) {
          addBadge(ev.playerName, { type: 'goal', minute: ev.minute, label: `Gol ${ev.minute}'` })
        }
        if (ev.assistName) {
          addBadge(ev.assistName, { type: 'assist', minute: ev.minute, label: `Assist. ${ev.minute}'` })
        }
        break
      case 'yellow_card':
        if (ev.playerName) {
          addBadge(ev.playerName, { type: 'yellow_card', minute: ev.minute, label: `Amarelo ${ev.minute}'` })
        }
        break
      case 'red_card':
        if (ev.playerName) {
          addBadge(ev.playerName, { type: 'red_card', minute: ev.minute, label: `Vermelho ${ev.minute}'` })
        }
        break
      case 'substitution':
        if (ev.playerIn) {
          addBadge(ev.playerIn, { type: 'sub_in', minute: ev.minute, label: `Entrou ${ev.minute}'` })
        }
        if (ev.playerOut) {
          addBadge(ev.playerOut, { type: 'sub_out', minute: ev.minute, label: `Saiu ${ev.minute}'` })
        }
        break
    }
  }

  return map
}

/**
 * Find badges for a player by trying:
 * 1. Exact normalized name match
 * 2. Last name match (only if unambiguous)
 */
export function getBadgesForPlayer(playerName: string, eventMap: PlayerEventMap): PlayerBadge[] {
  const key = normalizeName(playerName)

  // Exact match
  if (eventMap.has(key)) return eventMap.get(key)!

  // Try partial: check if any event map key contains this player's name or vice versa
  for (const [mapKey, badges] of eventMap.entries()) {
    if (mapKey.includes(key) || key.includes(mapKey)) return badges
  }

  // Last name fallback - only if exactly one match
  const lastName = normalizeName(getLastName(playerName))
  if (lastName.length >= 4) {
    const matches: PlayerBadge[][] = []
    for (const [mapKey, badges] of eventMap.entries()) {
      const mapLastName = normalizeName(getLastName(mapKey))
      if (mapLastName === lastName) matches.push(badges)
    }
    if (matches.length === 1) return matches[0]
  }

  return []
}

export function getBadgeStyle(type: PlayerBadge['type']): string {
  switch (type) {
    case 'goal': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
    case 'assist': return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15'
    case 'yellow_card': return 'bg-amber-500/10 text-amber-400 border border-amber-500/15'
    case 'red_card': return 'bg-rose-500/10 text-rose-400 border border-rose-500/15'
    case 'sub_in': return 'bg-cyan-500/8 text-cyan-400/70 border border-cyan-500/12'
    case 'sub_out': return 'bg-white/[0.03] text-white/30 border border-white/[0.06]'
  }
}
