/**
 * Premium Live Pressure Graph (V2.4) - pressure curve + premium event markers.
 * -----------------------------------------------------------------------------
 * V2   added: typed marker model, rich HTML tooltip, side-aware stacking,
 *             legend with present types, fallback when provider has no events.
 * V2.1 added: smart tooltip placement, "+N" grouping with group tooltip,
 *             optional `onEventSelect` callback, density mode.
 * V2.2 added: full premium custom-SVG icon system for every event type.
 * V2.3 added: lucide-react primitives wrapped in GoalSense badges for
 *             non-football glyphs (target / goalpost / substitution).
 * V2.4 added: markers move OUT of the distorted curve SVG into a pixel-perfect
 *             HTML overlay positioned in percentage coordinates. The curve
 *             still renders inside the same `preserveAspectRatio="none"` SVG
 *             so the engine and curve geometry remain unchanged. Each marker
 *             is now a real square HTML button with proper aspect ratio.
 * V2.5 adds : final visual calibration (sizes / vertical offsets / hover),
 *             running score derived from real goal events shown in the goal
 *             tooltip when available, refined microcopy for the empty state,
 *             and a richer marker accessibility label (includes scorer/assist).
 *             The component still does NOT invent data: the running score is
 *             computed deterministically from real per-minute goal events;
 *             if there are no goal events the score is never shown.
 *
 * The pressure engine, normalization, readings, confidence and time-axis
 * logic are intentionally untouched.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildPressureTimeline } from '@/features/matches/buildPressureTimeline'
import { buildPressureRead } from '@/features/matches/buildPressureRead'
import { normalizeEvents } from '@/features/matches/normalizeMatchEvents'
import {
  eventLabel,
  eventZIndex,
  formatMinuteLabel,
  normalizePressureGraphEvents,
  type PressureGraphEvent,
  type PressureGraphEventType,
} from '@/features/matches/pressureGraphEvents'
import {
  GroupBubbleBox,
  PressureEventIconBox,
  PressureEventIconInline,
} from './pressureEventIcons'
import { getTeamGraphPalette } from '@/lib/teamGraphPalette'

interface Props {
  events: { clock: string; text: string; type: string; team: string }[]
  commentary?: { clock: string; text: string }[]
  homeName: string
  awayName: string
  elapsed: number | null
  homeColors: string[]
  awayColors: string[]
  onEventSelect?: (event: PressureGraphEvent) => void
}

// --- Marker sizing per type (CSS pixels) ---
// V2.8: readability fix. Secondary events (shots, subs) are larger and brighter.

const MARKER_SIZES_PX: Record<PressureGraphEventType, number> = {
  goal: 34,
  own_goal: 34,
  penalty_scored: 32,
  penalty_missed: 30,
  shot_on_target: 25,
  shot_off_target: 26,
  yellow_card: 24,
  red_card: 26,
  second_yellow: 26,
  substitution: 26,
  var: 22,
  unknown: 16,
}

const GROUP_MARKER_SIZE_PX = 24

// Density: types that fade when the match is busy. Critical events
// (goals, red cards, penalties, second yellows) never fade.
const LOW_PRIORITY_TYPES: PressureGraphEventType[] = ['shot_off_target', 'substitution', 'var', 'unknown']

// Accent color used by the group bubble - picks the most important event in
// the group.
function groupAccent(events: PressureGraphEvent[]): string {
  let best = events[0]
  for (const ev of events) if (eventZIndex(ev.type) > eventZIndex(best.type)) best = ev
  switch (best.type) {
    case 'goal': case 'penalty_scored': return '#22d3ee'
    case 'own_goal': case 'red_card': case 'second_yellow': case 'penalty_missed': return '#f43f5e'
    case 'yellow_card': return '#fbbf24'
    case 'shot_on_target': return '#22d3ee'
    case 'var': return '#a78bfa'
    default: return '#94a3b8'
  }
}

// --- Hover state ---------------------------------------------------------

type HoverState =
  | { kind: 'event'; event: PressureGraphEvent; xPercent: number; yPercent: number; markerId: string }
  | { kind: 'group'; events: PressureGraphEvent[]; minute: number; side: PressureGraphEvent['side']; xPercent: number; yPercent: number; markerId: string }

// --- Marker layout item (percent-based, V2.4) ----------------------------

type MarkerLayoutItem =
  | {
      kind: 'event'
      id: string
      xPercent: number
      yPercent: number
      sizePx: number
      zIndex: number
      side: PressureGraphEvent['side']
      muted: boolean
      event: PressureGraphEvent
    }
  | {
      kind: 'group'
      id: string
      xPercent: number
      yPercent: number
      sizePx: number
      zIndex: number
      side: PressureGraphEvent['side']
      events: PressureGraphEvent[]
      minute: number
      accent: string
    }

// SVG canvas dimensions (kept for the curve only). The HTML overlay uses
// percentages so it is independent of these numbers.
const SVG_W = 400
const SVG_H = 120
const MID = SVG_H / 2

export function LivePressureGraph({ events, commentary, homeName, awayName, elapsed, homeColors, awayColors, onEventSelect }: Props) {
  // Merge events + commentary for richer pressure data (unchanged)
  const allEvents: { clock: string; text: string; type: string; team: string }[] = [...events]
  if (commentary && commentary.length > 0) {
    for (const c of commentary) {
      const t = c.text.toLowerCase()
      if (t.includes('goal') || t.includes('attempt') || t.includes('shot') || t.includes('corner') ||
          t.includes('foul') || t.includes('yellow') || t.includes('red card') || t.includes('substitution') ||
          t.includes('saved') || t.includes('blocked') || t.includes('offside') || t.includes('header')) {
        allEvents.push({ clock: c.clock, text: c.text, type: '', team: '' })
      }
    }
  }

  const timeline = buildPressureTimeline(allEvents, homeName, awayName, elapsed)
  const reading = buildPressureRead(timeline, homeName, awayName)
  const graphEvents = useMemo(() => {
    const normalized = normalizeEvents(events)
    return normalizePressureGraphEvents(normalized, homeName, awayName)
  }, [events, homeName, awayName])

  // V2.5: compute a running score from real goal events. Only events with
  // type goal / own_goal / penalty_scored count; we never invent or smooth.
  // The score map is keyed by event.id so the tooltip lookup is O(1).
  const goalScoreMap = useMemo(() => {
    const map = new Map<string, { home: number; away: number }>()
    let h = 0
    let a = 0
    const goalsInOrder = graphEvents
      .filter(ev => ev.type === 'goal' || ev.type === 'own_goal' || ev.type === 'penalty_scored')
      .slice()
      .sort((x, y) => x.minute - y.minute || (x.addedTime || 0) - (y.addedTime || 0))
    for (const ev of goalsInOrder) {
      // own_goal counts for the OPPOSITE side; everything else for the side
      // that scored.
      const benefitsHome = ev.type === 'own_goal' ? ev.side === 'away' : ev.side === 'home'
      const benefitsAway = ev.type === 'own_goal' ? ev.side === 'home' : ev.side === 'away'
      if (benefitsHome) h += 1
      if (benefitsAway) a += 1
      map.set(ev.id, { home: h, away: a })
    }
    return map
  }, [graphEvents])

  const [hovered, setHovered] = useState<HoverState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const graphContainerRef = useRef<HTMLDivElement>(null)

  const density = useMemo<'normal' | 'dense' | 'very_dense'>(() => {
    if (graphEvents.length > 25) return 'very_dense'
    if (graphEvents.length > 12) return 'dense'
    return 'normal'
  }, [graphEvents.length])

  const stackCap = density === 'very_dense' ? 2 : 3

  const handleSelect = useCallback((event: PressureGraphEvent) => {
    setSelectedId(event.id)
    if (onEventSelect) {
      try { onEventSelect(event) } catch { /* never let a host callback crash the graph */ }
    }
  }, [onEventSelect])

  // Curve colors — V2.6: contrast-aware palette for dark teams
  const homePalette = useMemo(() => getTeamGraphPalette(homeColors, homeName), [homeColors, homeName])
  const awayPalette = useMemo(() => getTeamGraphPalette(awayColors, awayName), [awayColors, awayName])
  const hc = homePalette.stroke
  const hcFill = homePalette.fill
  const ac = awayPalette.stroke
  const acFill = awayPalette.fill

  const { blocks, maxPressure, currentMinute } = timeline

  // Empty state when timeline lacks confidence
  if (!timeline.hasEnoughData) {
    return (
      <section className="rounded-[28px] border border-white/[0.05] bg-gradient-to-b from-white/[0.025] to-white/[0.005] p-7 animate-slideUp">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-[13px] font-bold text-white/60">Pressão ao vivo</h3>
            <p className="text-[10px] text-white/25 mt-0.5">Estimativa baseada em eventos reais da partida</p>
          </div>
          <ConfidenceBadge confidence={reading.confidence} />
        </div>
        <div className="rounded-2xl bg-[#080b12] border border-white/[0.04] flex items-center justify-center" style={{ height: '180px' }}>
          <div className="text-center px-8">
            <p className="text-[12px] text-white/35">Eventos insuficientes para gerar uma curva confiável.</p>
            <p className="text-[10px] text-white/15 mt-1">Aguardando novas ações relevantes da partida.</p>
          </div>
        </div>
      </section>
    )
  }

  // --- Curve path builders (kept identical to V2.3) ----------------------

  function buildPath(side: 'home' | 'away'): string {
    if (blocks.length < 2) return ''
    const points = blocks.map(b => {
      const xCenter = ((b.startMinute + b.endMinute) / 2 / currentMinute) * SVG_W
      const val = side === 'home' ? b.homePressure : b.awayPressure
      const normalized = val / maxPressure
      const y = side === 'home'
        ? MID - normalized * (MID - 4)
        : MID + normalized * (MID - 4)
      return { x: xCenter, y }
    })
    let d = `M0,${MID}`
    for (let i = 0; i < points.length; i++) {
      if (i === 0) d += ` L${points[i].x},${points[i].y}`
      else {
        const prev = points[i - 1]
        const cpX = (prev.x + points[i].x) / 2
        d += ` Q${cpX},${prev.y} ${points[i].x},${points[i].y}`
      }
    }
    d += ` L${points[points.length - 1].x},${MID} Z`
    return d
  }
  function buildStrokePath(side: 'home' | 'away'): string {
    if (blocks.length < 2) return ''
    const points = blocks.map(b => {
      const xCenter = ((b.startMinute + b.endMinute) / 2 / currentMinute) * SVG_W
      const val = side === 'home' ? b.homePressure : b.awayPressure
      const normalized = val / maxPressure
      const y = side === 'home'
        ? MID - normalized * (MID - 4)
        : MID + normalized * (MID - 4)
      return { x: xCenter, y }
    })
    let d = ''
    for (let i = 0; i < points.length; i++) {
      if (i === 0) d = `M${points[i].x},${points[i].y}`
      else {
        const prev = points[i - 1]
        const cpX = (prev.x + points[i].x) / 2
        d += ` Q${cpX},${prev.y} ${points[i].x},${points[i].y}`
      }
    }
    return d
  }

  // --- Marker layout in PERCENT coordinates (V2.4) -----------------------

  const layoutMarkers = useMemo<MarkerLayoutItem[]>(() => {
    if (currentMinute <= 0 || graphEvents.length === 0) return []

    const grouped = new Map<string, PressureGraphEvent[]>()
    for (const ev of graphEvents) {
      const key = `${ev.side}-${ev.minute}`
      const list = grouped.get(key) || []
      list.push(ev)
      grouped.set(key, list)
    }

    // Stack offsets, expressed as a percentage of the graph height. The
    // graph container is 260px tall; the curve baseline (mid) sits at 50%.
    // V2.5 calibration: a slightly larger base offset (10%) makes goals
    // visually breathe above/below the curve without overlapping the
    // strongest pressure peaks. Stack step is unchanged so a 3-event stack
    // never extends past the visible area.
    const baseOffsetPct = 10
    const stackStepPct = 9

    const out: MarkerLayoutItem[] = []
    for (const [key, list] of grouped) {
      const side: PressureGraphEvent['side'] = key.startsWith('home') ? 'home' : key.startsWith('away') ? 'away' : 'neutral'
      list.sort((a, b) => eventZIndex(b.type) - eventZIndex(a.type))
      const first = list[0]
      const xPercent = (first.minute / currentMinute) * 100
      const yDir = side === 'home' ? -1 : side === 'away' ? 1 : -1

      if (list.length <= stackCap) {
        list.forEach((ev, idx) => {
          const yPercent = 50 + yDir * (baseOffsetPct + idx * stackStepPct)
          const lowPri = LOW_PRIORITY_TYPES.includes(ev.type)
          const muted = density !== 'normal' && lowPri
          out.push({
            kind: 'event',
            id: `s-${ev.id}`,
            xPercent,
            yPercent,
            sizePx: MARKER_SIZES_PX[ev.type] || 14,
            zIndex: eventZIndex(ev.type),
            side,
            muted,
            event: ev,
          })
        })
      } else {
        const visibleCount = stackCap - 1
        const visible = list.slice(0, visibleCount)
        const overflow = list.slice(visibleCount)
        visible.forEach((ev, idx) => {
          const yPercent = 50 + yDir * (baseOffsetPct + idx * stackStepPct)
          out.push({
            kind: 'event',
            id: `s-${ev.id}`,
            xPercent,
            yPercent,
            sizePx: MARKER_SIZES_PX[ev.type] || 14,
            zIndex: eventZIndex(ev.type),
            side,
            muted: false,
            event: ev,
          })
        })
        const groupYPercent = 50 + yDir * (baseOffsetPct + visibleCount * stackStepPct)
        out.push({
          kind: 'group',
          id: `g-${first.minute}-${side}`,
          xPercent,
          yPercent: groupYPercent,
          sizePx: GROUP_MARKER_SIZE_PX,
          zIndex: 70,
          side,
          events: overflow,
          minute: first.minute,
          accent: groupAccent(overflow),
        })
      }
    }
    return out
  }, [graphEvents, currentMinute, density, stackCap])

  // Time axis labels
  const timeLabels: number[] = [0]
  if (currentMinute >= 15) timeLabels.push(15)
  if (currentMinute >= 30) timeLabels.push(30)
  if (currentMinute >= 45) timeLabels.push(45)
  if (currentMinute >= 60) timeLabels.push(60)
  if (currentMinute >= 75) timeLabels.push(75)
  if (currentMinute > 80) timeLabels.push(90)
  else timeLabels.push(currentMinute)

  // Counts per type for the legend
  const typeCounts = useMemo(() => {
    const map = new Map<PressureGraphEventType, number>()
    for (const ev of graphEvents) map.set(ev.type, (map.get(ev.type) || 0) + 1)
    return map
  }, [graphEvents])

  // Resolve team accent (without #) per side, used by goal halos.
  const homeAccentHex = homePalette.marker
  const awayAccentHex = awayPalette.marker

  // Halftime line as percent
  const halftimePercent = currentMinute > 45 ? (45 / currentMinute) * 100 : null

  return (
    <section className="rounded-[28px] border border-white/[0.05] bg-gradient-to-b from-white/[0.025] to-white/[0.005] p-7 animate-slideUp">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-[13px] font-bold text-white/60">Pressão ao vivo</h3>
          <p className="text-[10px] text-white/25 mt-0.5">Estimativa baseada em eventos reais da partida</p>
        </div>
        <ConfidenceBadge confidence={reading.confidence} />
      </div>

      {/* Reading strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        <ReadingCell label="Momento atual" value={reading.currentMoment} />
        <ReadingCell label="Período mais forte" value={reading.strongestPeriod} />
        <ReadingCell label="Último pico" value={reading.lastPeak} />
      </div>
      {reading.tacticalReading && (
        <p className="text-[10px] text-white/35 italic mt-2 px-1">{reading.tacticalReading}</p>
      )}

      {/* Team strip */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {homeColors.slice(0, 2).map((c, i) => <span key={i} className="h-4 w-1.5 rounded-full" style={{ backgroundColor: `#${c}` }} />)}
          </div>
          <span className="text-[11px] font-semibold text-white/70">{homeName}</span>
          <span className="text-[9px] text-white/15 ml-1">acima</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/15 mr-1">abaixo</span>
          <span className="text-[11px] font-semibold text-white/70">{awayName}</span>
          <div className="flex gap-0.5">
            {awayColors.slice(0, 2).map((c, i) => <span key={i} className="h-4 w-1.5 rounded-full" style={{ backgroundColor: `#${c}` }} />)}
          </div>
        </div>
      </div>

      {/* Graph + overlay container */}
      <div ref={graphContainerRef} className="relative rounded-2xl bg-[#080b12] border border-white/[0.04] overflow-hidden" style={{ height: '260px' }}>
        {/* Curve SVG (unchanged from V2.3) */}
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="none"
          className="w-full h-full"
          role="img"
          aria-label="Gráfico de pressão ao vivo"
        >
          {/* Grid lines */}
          <line x1={0} y1={MID} x2={SVG_W} y2={MID} stroke="rgba(255,255,255,0.06)" strokeWidth="0.3" />
          <line x1={0} y1={MID / 2} x2={SVG_W} y2={MID / 2} stroke="rgba(255,255,255,0.02)" strokeWidth="0.2" strokeDasharray="2,4" />
          <line x1={0} y1={MID + MID / 2} x2={SVG_W} y2={MID + MID / 2} stroke="rgba(255,255,255,0.02)" strokeWidth="0.2" strokeDasharray="2,4" />

          {/* Halftime */}
          {halftimePercent !== null && (
            <line
              x1={(halftimePercent / 100) * SVG_W}
              y1="0"
              x2={(halftimePercent / 100) * SVG_W}
              y2={SVG_H}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.4"
              strokeDasharray="2,3"
            />
          )}

          {/* Pressure areas */}
          <path d={buildPath('home')} fill={hcFill} />
          <path d={buildStrokePath('home')} fill="none" stroke={hc} strokeWidth="0.8" strokeLinecap="round" />
          <path d={buildPath('away')} fill={acFill} />
          <path d={buildStrokePath('away')} fill="none" stroke={ac} strokeWidth="0.8" strokeLinecap="round" />

          {/* Current minute indicator */}
          <line
            x1={SVG_W - 1}
            y1="0"
            x2={SVG_W - 1}
            y2={SVG_H}
            stroke="rgba(52,211,153,0.3)"
            strokeWidth="0.5"
          />
        </svg>

        {/* Marker overlay - HTML, pixel-perfect, no aspect distortion */}
        <div className="absolute inset-0 pointer-events-none" aria-label="Marcadores de eventos da partida">
          {/* Vertical hint lines for each marker minute (subtle) */}
          {layoutMarkers.map(m => (
            <span
              key={`hint-${m.id}`}
              aria-hidden
              style={{
                position: 'absolute',
                left: `${m.xPercent}%`,
                top: 'calc(50% - 4px)',
                width: '1px',
                height: '8px',
                background: 'rgba(255,255,255,0.18)',
                transform: 'translateX(-0.5px)',
                pointerEvents: 'none',
              }}
            />
          ))}

          {/* Markers, rendered in z-index order so important events sit on top */}
          {layoutMarkers
            .slice()
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((m) => {
              if (m.kind === 'event') {
                const isSelected = selectedId === m.event.id
                const isHovered = hovered?.markerId === m.id
                const accent = m.side === 'home' ? homeAccentHex : m.side === 'away' ? awayAccentHex : undefined
                return (
                  <SingleMarkerButton
                    key={m.id}
                    event={m.event}
                    xPercent={m.xPercent}
                    yPercent={m.yPercent}
                    sizePx={m.sizePx}
                    zIndex={m.zIndex}
                    muted={m.muted}
                    selected={isSelected}
                    hovered={isHovered}
                    teamAccent={accent}
                    onHover={() => setHovered({ kind: 'event', event: m.event, xPercent: m.xPercent, yPercent: m.yPercent, markerId: m.id })}
                    onLeave={() => setHovered(null)}
                    onSelect={() => handleSelect(m.event)}
                  />
                )
              }
              const isHovered = hovered?.markerId === m.id
              return (
                <GroupMarkerButton
                  key={m.id}
                  events={m.events}
                  minute={m.minute}
                  xPercent={m.xPercent}
                  yPercent={m.yPercent}
                  sizePx={m.sizePx}
                  zIndex={m.zIndex}
                  accent={m.accent}
                  hovered={isHovered}
                  onHover={() => setHovered({ kind: 'group', events: m.events, minute: m.minute, side: m.side, xPercent: m.xPercent, yPercent: m.yPercent, markerId: m.id })}
                  onLeave={() => setHovered(null)}
                />
              )
            })}

          {/* Tooltip rendered via portal to avoid overflow:hidden clipping */}
          {hovered && graphContainerRef.current && (
            <PortalTooltip containerRef={graphContainerRef} xPct={hovered.xPercent} yPct={hovered.yPercent}>
              {hovered.kind === 'event'
                ? <EventTooltipBody event={hovered.event} score={goalScoreMap.get(hovered.event.id)} homeName={homeName} awayName={awayName} />
                : <GroupTooltipBody events={hovered.events} minute={hovered.minute} />
              }
            </PortalTooltip>
          )}
        </div>
      </div>

      {/* Time axis */}
      <div className="flex justify-between text-[9px] text-white/20 tabular-nums px-1 mt-1.5">
        {timeLabels.map(t => <span key={t}>{t}'</span>)}
      </div>

      {/* Legend with counts and real icons */}
      {typeCounts.size > 0 ? (
        <Legend counts={typeCounts} />
      ) : (
        <p className="text-[10px] text-white/25 mt-3 px-1">Eventos com minuto não disponíveis para este provider.</p>
      )}
    </section>
  )
}

// --- Portal tooltip (V2.6 — never clipped by overflow:hidden) -----------

function PortalTooltip({ containerRef, xPct, yPct, children }: { containerRef: React.RefObject<HTMLDivElement | null>; xPct: number; yPct: number; children: React.ReactNode }) {
  const container = containerRef.current
  if (!container) return null

  const rect = container.getBoundingClientRect()
  // Anchor point in viewport coordinates
  const anchorX = rect.left + (xPct / 100) * rect.width
  const anchorY = rect.top + (yPct / 100) * rect.height

  // Tooltip dimensions estimate (max-width 300px, height ~120px)
  const tooltipW = 280
  const tooltipH = 130
  const margin = 12

  // Horizontal: center, clamp to viewport
  let left = anchorX - tooltipW / 2
  if (left < margin) left = margin
  if (left + tooltipW > window.innerWidth - margin) left = window.innerWidth - margin - tooltipW

  // Vertical: prefer above, flip below if no space
  let top: number
  if (anchorY - tooltipH - margin > 0) {
    top = anchorY - tooltipH - margin
  } else {
    top = anchorY + margin
  }

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none rounded-xl border border-white/[0.08] bg-[#0b1018]/95 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.5)] px-3.5 py-2.5 text-left animate-fadeIn"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 9999,
        maxWidth: 300,
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

function EventTooltipBody({ event, score, homeName, awayName }: { event: PressureGraphEvent; score?: { home: number; away: number }; homeName?: string; awayName?: string }) {
  const showScore = !!score && (event.type === 'goal' || event.type === 'own_goal' || event.type === 'penalty_scored')

  // V2.7: rich descriptive sentence per event type
  const description = buildEventDescription(event, score, homeName, awayName)

  return (
    <>
      {/* Header: icon + type + minute */}
      <div className="flex items-center gap-2.5 mb-2">
        <span className="shrink-0 inline-flex items-center justify-center"><PressureEventIconInline type={event.type} sizePx={20} /></span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/90">{eventLabel(event.type)}</span>
        <span className="text-[11px] text-white/50 tabular-nums font-semibold ml-auto">{formatMinuteLabel(event.minute, event.addedTime)}</span>
      </div>
      {/* Team */}
      {event.teamName && (
        <p className="text-[12px] text-white/90 font-semibold truncate mb-0.5">{event.teamName}</p>
      )}
      {/* Description block */}
      <div className="text-[11px] text-white/65 leading-relaxed space-y-0.5 mt-1">
        {description.map((line, i) => <p key={i}>{line}</p>)}
      </div>
      {/* Score */}
      {showScore && score && (
        <p className="text-[11px] text-emerald-400/80 font-medium leading-snug mt-2 tabular-nums border-t border-white/[0.06] pt-1.5">
          Placar: {homeName || ''} {score.home}–{score.away} {awayName || ''}
        </p>
      )}
    </>
  )
}

function buildEventDescription(event: PressureGraphEvent, score?: { home: number; away: number }, homeName?: string, awayName?: string): string[] {
  const player = event.playerName
  const team = event.teamName
  const assist = event.assistName
  const lines: string[] = []

  switch (event.type) {
    case 'goal':
      lines.push(player ? `Gol de ${player}${team ? ` para ${team}` : ''}.` : `Gol${team ? ` para ${team}` : ''}.`)
      if (assist) lines.push(`Assistência de ${assist}.`)
      break
    case 'own_goal':
      lines.push(player ? `Gol contra de ${player}.` : 'Gol contra.')
      if (team) {
        const opponent = team === homeName ? awayName : team === awayName ? homeName : null
        if (opponent) lines.push(`Beneficiou ${opponent}.`)
      }
      break
    case 'penalty_scored':
      lines.push(player ? `Pênalti convertido por ${player}.` : 'Pênalti convertido.')
      break
    case 'penalty_missed':
      lines.push(player ? `Pênalti perdido por ${player}.` : 'Pênalti perdido.')
      break
    case 'shot_on_target':
      lines.push(player ? `Finalização no gol de ${player}.` : 'Finalização no gol.')
      break
    case 'shot_off_target':
      lines.push(player ? `Finalização para fora de ${player}.` : 'Finalização para fora.')
      break
    case 'yellow_card':
      lines.push(player ? `Cartão amarelo para ${player}.` : 'Cartão amarelo.')
      break
    case 'red_card':
      lines.push(player ? `Cartão vermelho para ${player}.` : 'Cartão vermelho.')
      break
    case 'second_yellow':
      lines.push(player ? `Segundo amarelo e expulsão para ${player}.` : 'Segundo amarelo e expulsão.')
      break
    case 'substitution':
      lines.push(team ? `Substituição no ${team}.` : 'Substituição.')
      if (player) lines.push(`Detalhes: ${player}.`)
      else lines.push('Detalhes da troca não informados pelo provider.')
      break
    case 'var':
      lines.push('Revisão do VAR.')
      if (player) lines.push(player)
      break
    default:
      if (player) lines.push(player)
      else lines.push('Detalhes não informados.')
  }

  return lines
}

function GroupTooltipBody({ events, minute }: { events: PressureGraphEvent[]; minute: number }) {
  const visible = events.slice(0, 6)
  const remaining = events.length - visible.length
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/85">Eventos no minuto {minute}'</span>
        <span className="text-[10px] text-white/45 tabular-nums ml-auto">{events.length}</span>
      </div>
      <ul className="space-y-1.5">
        {visible.map(ev => (
          <li key={ev.id} className="flex items-start gap-2 text-[11px] text-white/70 leading-snug">
            <span className="shrink-0 inline-flex items-center justify-center mt-px"><PressureEventIconInline type={ev.type} sizePx={14} /></span>
            <span className="flex-1 min-w-0">
              <span className="text-white/85 font-medium">{eventLabel(ev.type)}</span>
              {ev.playerName ? <span className="text-white/65"> · {ev.playerName}</span> : <span className="text-white/35 italic"> · jogador não informado</span>}
              {ev.teamName && <span className="text-white/45"> · {ev.teamName}</span>}
            </span>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <p className="text-[10.5px] text-white/40 mt-2 border-t border-white/[0.05] pt-1.5">+{remaining} {remaining === 1 ? 'evento' : 'eventos'}</p>
      )}
    </>
  )
}

// --- HTML overlay markers (V2.4) ----------------------------------------

interface SingleMarkerButtonProps {
  event: PressureGraphEvent
  xPercent: number
  yPercent: number
  sizePx: number
  zIndex: number
  muted: boolean
  selected: boolean
  hovered: boolean
  teamAccent?: string
  onHover: () => void
  onLeave: () => void
  onSelect: () => void
}

function SingleMarkerButton({ event, xPercent, yPercent, sizePx, zIndex, muted, selected, hovered, teamAccent, onHover, onLeave, onSelect }: SingleMarkerButtonProps) {
  // V2.5: enrich aria-label so screen readers and tooltips on focus convey
  // the full context (assist + running score) for important events.
  const parts: string[] = [
    `${eventLabel(event.type)} aos ${formatMinuteLabel(event.minute, event.addedTime)}`,
  ]
  if (event.teamName) parts.push(event.teamName)
  if (event.playerName) parts.push(event.playerName)
  if (event.assistName) parts.push(`assistência de ${event.assistName}`)
  const ariaLabel = parts.join(' · ')
  // Hit area is slightly bigger than the visual marker for easier click/tap.
  const hitSize = Math.max(sizePx + 6, 24)
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      onClick={onSelect}
      style={{
        position: 'absolute',
        left: `${xPercent}%`,
        top: `${yPercent}%`,
        width: hitSize,
        height: hitSize,
        transform: 'translate(-50%, -50%)',
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        pointerEvents: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex,
        outline: 'none',
        borderRadius: '50%',
      }}
      className="gs-pressure-marker focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400/70 focus-visible:outline-offset-2"
    >
      <PressureEventIconBox
        type={event.type}
        sizePx={sizePx}
        selected={selected}
        hovered={hovered}
        muted={muted}
        teamAccent={teamAccent}
      />
    </button>
  )
}

interface GroupMarkerButtonProps {
  events: PressureGraphEvent[]
  minute: number
  xPercent: number
  yPercent: number
  sizePx: number
  zIndex: number
  accent: string
  hovered: boolean
  onHover: () => void
  onLeave: () => void
}

function GroupMarkerButton({ events, minute, xPercent, yPercent, sizePx, zIndex, accent, hovered, onHover, onLeave }: GroupMarkerButtonProps) {
  const labels = events.slice(0, 3).map(e => eventLabel(e.type).toLowerCase())
  const ariaLabel = `${events.length} eventos no minuto ${minute}: ${labels.join(', ')}${events.length > labels.length ? ` e mais ${events.length - labels.length}` : ''}`
  const hitSize = Math.max(sizePx + 6, 26)
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      style={{
        position: 'absolute',
        left: `${xPercent}%`,
        top: `${yPercent}%`,
        width: hitSize,
        height: hitSize,
        transform: 'translate(-50%, -50%)',
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        pointerEvents: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex,
        outline: 'none',
        borderRadius: '50%',
      }}
      className="gs-pressure-marker focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400/70 focus-visible:outline-offset-2"
    >
      <GroupBubbleBox sizePx={sizePx} count={events.length} accent={accent} hovered={hovered} />
    </button>
  )
}

// --- Legend with counts and real icons ----------------------------------

function Legend({ counts }: { counts: Map<PressureGraphEventType, number> }) {
  const onTarget = counts.get('shot_on_target') || 0
  const offTarget = counts.get('shot_off_target') || 0
  const totalShots = onTarget + offTarget

  const goal = counts.get('goal') || 0
  const ownGoal = counts.get('own_goal') || 0
  const penScored = counts.get('penalty_scored') || 0
  const penMissed = counts.get('penalty_missed') || 0
  const totalGoals = goal + ownGoal + penScored

  const yellow = counts.get('yellow_card') || 0
  const red = counts.get('red_card') || 0
  const sec = counts.get('second_yellow') || 0
  const totalCards = yellow + red + sec

  const subs = counts.get('substitution') || 0
  const vars = counts.get('var') || 0

  const items: { key: string; iconType: PressureGraphEventType; label: string; count: number; sublabel?: string }[] = []
  if (totalGoals > 0) {
    const sub: string[] = []
    if (goal > 0) sub.push(`${goal} normal${goal === 1 ? '' : 'is'}`)
    if (ownGoal > 0) sub.push(`${ownGoal} contra`)
    if (penScored > 0) sub.push(`${penScored} pênalti`)
    items.push({ key: 'goals', iconType: 'goal', label: 'Gols', count: totalGoals, sublabel: sub.length > 0 ? sub.join(' · ') : undefined })
  }
  if (penMissed > 0) {
    items.push({ key: 'penalty_missed', iconType: 'penalty_missed', label: 'Pênaltis perdidos', count: penMissed })
  }
  if (totalShots > 0) {
    const sub: string[] = []
    if (onTarget > 0) sub.push(`${onTarget} no alvo`)
    if (offTarget > 0) sub.push(`${offTarget} fora`)
    items.push({ key: 'shots', iconType: 'shot_on_target', label: 'Finalizações', count: totalShots, sublabel: sub.join(' · ') })
  }
  if (totalCards > 0) {
    const sub: string[] = []
    if (yellow > 0) sub.push(`${yellow} amarelo${yellow === 1 ? '' : 's'}`)
    if (red > 0) sub.push(`${red} vermelho${red === 1 ? '' : 's'}`)
    if (sec > 0) sub.push(`${sec} 2º amarelo`)
    const iconType: PressureGraphEventType = red > 0 ? 'red_card' : sec > 0 ? 'second_yellow' : 'yellow_card'
    items.push({ key: 'cards', iconType, label: 'Cartões', count: totalCards, sublabel: sub.join(' · ') })
  }
  if (subs > 0) items.push({ key: 'subs', iconType: 'substitution', label: 'Substituições', count: subs })
  if (vars > 0) items.push({ key: 'vars', iconType: 'var', label: 'VAR', count: vars })

  if (items.length === 0) return null

  return (
    <ul className="flex items-center gap-x-4 gap-y-2 flex-wrap mt-3 text-[10px] text-white/50">
      {items.map(item => (
        <li key={item.key} className="flex items-center gap-1.5">
          <PressureEventIconInline type={item.iconType} sizePx={20} />
          <span className="text-white/70 font-medium">{item.label}</span>
          <span className="text-white/85 font-bold tabular-nums">{item.count}</span>
          {item.sublabel && <span className="text-white/35">· {item.sublabel}</span>}
        </li>
      ))}
    </ul>
  )
}

// --- Misc ----------------------------------------------------------------

function ReadingCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.03] px-3 py-2">
      <span className="text-[9px] font-medium uppercase tracking-wider text-white/20 block mb-0.5">{label}</span>
      <span className="text-[10px] text-white/50 leading-relaxed">{value}</span>
    </div>
  )
}

function ConfidenceBadge({ confidence }: { confidence: 'baixa' | 'média' | 'alta' }) {
  const styles = {
    baixa: 'text-white/25 border-white/[0.05]',
    média: 'text-amber-400/60 border-amber-500/15',
    alta: 'text-emerald-400/60 border-emerald-500/15',
  }
  return (
    <span className={`text-[9px] font-medium rounded-lg border px-2 py-1 ${styles[confidence]}`}>
      Confiança: {confidence}
    </span>
  )
}
