/**
 * pressureGraphEvents — typed model + normalizer that adapts the existing
 * `NormalizedEvent` stream into a richer shape consumed by the Live Pressure
 * Graph (V2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Goals:
 *  - Distinguish goal vs own goal vs missed/scored penalty.
 *  - Distinguish shot on target vs shot off target.
 *  - Surface second-yellow as its own type (provider often labels it as
 *    yellow + "second yellow" in the same line).
 *  - Resolve `side` ('home' | 'away' | 'neutral') from the home/away names
 *    so the graph can stack markers correctly above/below the pressure line.
 *  - Always pass through the original raw text and provider hint when
 *    available; never fabricate fields the provider did not supply.
 *
 * No mocks, no invented events. If the provider only supplies aggregate
 * stats (e.g. "10 finalizações") without per-minute event lines, we return
 * an empty marker list — the graph degrades gracefully.
 */
import type { NormalizedEvent } from './normalizeMatchEvents'

export type PressureGraphEventType =
  | 'goal'
  | 'own_goal'
  | 'penalty_scored'
  | 'penalty_missed'
  | 'shot_on_target'
  | 'shot_off_target'
  | 'yellow_card'
  | 'red_card'
  | 'second_yellow'
  | 'substitution'
  | 'var'
  | 'unknown'

export type PressureGraphSide = 'home' | 'away' | 'neutral'

export interface PressureGraphEvent {
  id: string
  minute: number
  addedTime?: number
  side: PressureGraphSide
  teamName: string
  type: PressureGraphEventType
  playerName?: string
  assistName?: string
  description?: string
  /** Original raw text line (kept for tooltips and debugging). */
  rawText?: string
  /** Importance of the event for stacking and z-order. */
  importance: 'critical' | 'high' | 'medium' | 'low'
}

/**
 * Decide the side of an event by comparing the team string with the home/away
 * names. Comparison is case-insensitive and tolerant of partial matches
 * (provider sometimes returns short codes or accented variants).
 */
export function resolveSide(teamName: string, homeName: string, awayName: string): PressureGraphSide {
  const t = (teamName || '').trim().toLowerCase()
  if (!t) return 'neutral'
  const h = (homeName || '').trim().toLowerCase()
  const a = (awayName || '').trim().toLowerCase()
  if (!h && !a) return 'neutral'
  if (h && (t === h || t.includes(h) || h.includes(t))) return 'home'
  if (a && (t === a || t.includes(a) || a.includes(t))) return 'away'
  return 'neutral'
}

/**
 * Refines the typed shot/goal/card classification using the raw text. The
 * existing `normalizeMatchEvents` already maps to a coarse type; this layer
 * adds the variants needed by the graph's marker system.
 */
function refineType(ev: NormalizedEvent): PressureGraphEventType {
  const lower = (ev.rawText || '').toLowerCase()

  // Goal subtypes. Penalty handling first because "penalty kick missed" still
  // contains "goal" in some provider lines.
  if (lower.includes('penalty')) {
    if (lower.includes('missed') || lower.includes('saved') || lower.includes('hits the')) return 'penalty_missed'
    if (ev.type === 'goal' || lower.includes('scored') || lower.includes('converted')) return 'penalty_scored'
  }
  if (ev.type === 'goal') {
    if (lower.includes('own goal') || lower.includes(' og ') || lower.endsWith(' og')) return 'own_goal'
    return 'goal'
  }

  // Card subtypes.
  if (ev.type === 'red_card') {
    if (lower.includes('second yellow')) return 'second_yellow'
    return 'red_card'
  }
  if (ev.type === 'yellow_card') {
    if (lower.includes('second yellow')) return 'second_yellow'
    return 'yellow_card'
  }

  // Shot on/off target. We deliberately only return these when the provider
  // line is concrete — aggregated counts never reach this path because the
  // upstream normalizer requires a `clock`/event line.
  if (ev.type === 'shot') {
    if (lower.includes('off target') || lower.includes('off the target') || lower.includes('misses') || lower.includes('wide of') || lower.includes('over the bar') || lower.includes('para fora') || lower.includes('por cima') || lower.includes('wide') || lower.includes('missed')) {
      return 'shot_off_target'
    }
    if (lower.includes('on target') || lower.includes('saved') || lower.includes('blocked') || lower.includes('parries') || lower.includes('strikes the post') || lower.includes('hits the post') || lower.includes('hits the bar') || lower.includes('no alvo') || lower.includes('defendid') || lower.includes('goleiro') || lower.includes('goalkeeper') || lower.includes('attempt saved')) {
      return 'shot_on_target'
    }
    // Generic shot without verb: keep visible as off-target so it does not
    // claim to be on-target without evidence.
    return 'shot_off_target'
  }

  if (ev.type === 'substitution') return 'substitution'
  if (ev.type === 'var') return 'var'
  return 'unknown'
}

function refinedImportance(type: PressureGraphEventType, original: NormalizedEvent['importance']): PressureGraphEvent['importance'] {
  switch (type) {
    case 'goal':
    case 'penalty_scored':
    case 'own_goal':
      return 'critical'
    case 'red_card':
    case 'second_yellow':
      return 'critical'
    case 'penalty_missed':
      return 'high'
    case 'yellow_card':
      return 'high'
    case 'shot_on_target':
      return 'medium'
    case 'shot_off_target':
      return 'low'
    case 'substitution':
      return 'low'
    case 'var':
      return 'medium'
    default:
      return original
  }
}

/**
 * Map the existing `NormalizedEvent` stream into the richer `PressureGraphEvent`
 * shape. Drops events that:
 *  - have minute === 0 (period_start / period_end / pre-match noise);
 *  - resolve to `'other'` and have no usable type after refinement;
 *  - are foul / corner / offside / period markers — those do not earn a
 *    visual marker on the pressure line.
 */
export function normalizePressureGraphEvents(
  events: NormalizedEvent[],
  homeName: string,
  awayName: string,
): PressureGraphEvent[] {
  const out: PressureGraphEvent[] = []
  for (const ev of events) {
    if (!ev || ev.minute <= 0) continue
    if (ev.type === 'corner' || ev.type === 'offside' || ev.type === 'foul' || ev.type === 'period_start' || ev.type === 'period_end' || ev.type === 'injury') continue

    const refined = refineType(ev)
    if (refined === 'unknown') continue

    out.push({
      id: ev.id,
      minute: ev.minute,
      addedTime: ev.addedTime ?? undefined,
      side: resolveSide(ev.teamName, homeName, awayName),
      teamName: ev.teamName,
      type: refined,
      playerName: ev.playerName || undefined,
      assistName: ev.assistName || undefined,
      description: ev.description,
      rawText: ev.rawText,
      importance: refinedImportance(refined, ev.importance),
    })
  }
  return out
}

// ─── Display helpers ────────────────────────────────────────────────────────

/** Z-order: higher number renders on top of lower ones when stacked. */
export function eventZIndex(type: PressureGraphEventType): number {
  switch (type) {
    case 'goal': return 60
    case 'own_goal': return 60
    case 'penalty_scored': return 60
    case 'penalty_missed': return 55
    case 'red_card': return 50
    case 'second_yellow': return 50
    case 'yellow_card': return 40
    case 'shot_on_target': return 30
    case 'shot_off_target': return 20
    case 'var': return 25
    case 'substitution': return 10
    default: return 0
  }
}

/** pt-BR human label per type, used in tooltips and legend. */
export function eventLabel(type: PressureGraphEventType): string {
  switch (type) {
    case 'goal': return 'Gol'
    case 'own_goal': return 'Gol contra'
    case 'penalty_scored': return 'Pênalti convertido'
    case 'penalty_missed': return 'Pênalti perdido'
    case 'shot_on_target': return 'Finalização no alvo'
    case 'shot_off_target': return 'Finalização para fora'
    case 'yellow_card': return 'Cartão amarelo'
    case 'red_card': return 'Cartão vermelho'
    case 'second_yellow': return 'Segundo amarelo'
    case 'substitution': return 'Substituição'
    case 'var': return 'VAR'
    default: return 'Evento'
  }
}

/** Compact pt-BR minute label: 72', 45+2'. */
export function formatMinuteLabel(minute: number, addedTime?: number): string {
  if (addedTime && addedTime > 0) return `${minute}+${addedTime}'`
  return `${minute}'`
}
