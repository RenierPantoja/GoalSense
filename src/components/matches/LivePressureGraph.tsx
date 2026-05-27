/**
 * Premium Live Pressure Graph (V2.2) — pressure curve + premium event icons.
 * ─────────────────────────────────────────────────────────────────────────────
 * V2   added: typed marker model, rich HTML tooltip, side-aware stacking,
 *             legend with present types, fallback when provider has no events.
 * V2.1 added: smart tooltip placement, "+N" grouping with group tooltip,
 *             optional `onEventSelect` callback, density mode.
 * V2.2 adds : a full premium SVG icon system for every event type. Markers
 *             now share a single design language with the tooltip header and
 *             the legend. The pressure curve / engine / readings are
 *             intentionally untouched — only the visual layer of markers,
 *             group bubbles, tooltip and legend was redesigned.
 */

import { useCallback, useMemo, useState } from 'react'
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
  GroupBubble,
  PressureEventIcon,
  PressureEventIconDefs,
  PressureEventIconInline,
} from './pressureEventIcons'

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

// ─── Marker sizing per type (drives icon size + hit area) ──────────────────

const MARKER_SIZES: Record<PressureGraphEventType, number> = {
  goal: 6.5,
  own_goal: 6.5,
  penalty_scored: 6.5,
  penalty_missed: 5.8,
  shot_on_target: 4,
  shot_off_target: 4,
  yellow_card: 5,
  red_card: 5,
  second_yellow: 5.4,
  substitution: 4.8,
  var: 4.6,
  unknown: 3,
}

// Density: types that fade when the match is busy. Critical events
// (goals, red cards, penalties, second yellows) never fade.
const LOW_PRIORITY_TYPES: PressureGraphEventType[] = ['shot_off_target', 'substitution', 'var', 'unknown']

// Accent color used by GroupBubble — picks the most important event in the group.
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

// ─── Hover state ────────────────────────────────────────────────────────────

type HoverState =
  | { kind: 'event'; event: PressureGraphEvent; cx: number; cy: number; markerId: string }
  | { kind: 'group'; events: PressureGraphEvent[]; minute: number; side: PressureGraphEvent['side']; cx: number; cy: number; markerId: string }

// ─── Component ───────────────────────────────────────────────────────────────

export function LivePressureGraph({ events, commentary, homeName, awayName, elapsed, homeColors, awayColors, onEventSelect }: Props) {
  // Merge events + commentary for richer pressure data (unchanged from V2)
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

  const [hovered, setHovered] = useState<HoverState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  // Colors
  const hc = `#${homeColors[0] || '22d3ee'}`
  const hcFill = `${hc}80`
  const ac = `#${awayColors[0] || 'f472b6'}`
  const acFill = `${ac}66`

  // SVG dimensions
  const svgW = 400
  const svgH = 120
  const mid = svgH / 2
  const padX = 0
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

  function buildPath(side: 'home' | 'away'): string {
    if (blocks.length < 2) return ''
    const points = blocks.map(b => {
      const xCenter = ((b.startMinute + b.endMinute) / 2 / currentMinute) * (svgW - padX * 2) + padX
      const val = side === 'home' ? b.homePressure : b.awayPressure
      const normalized = val / maxPressure
      const y = side === 'home'
        ? mid - normalized * (mid - 4)
        : mid + normalized * (mid - 4)
      return { x: xCenter, y }
    })
    let d = `M${padX},${mid}`
    for (let i = 0; i < points.length; i++) {
      if (i === 0) d += ` L${points[i].x},${points[i].y}`
      else {
        const prev = points[i - 1]
        const cpX = (prev.x + points[i].x) / 2
        d += ` Q${cpX},${prev.y} ${points[i].x},${points[i].y}`
      }
    }
    d += ` L${points[points.length - 1].x},${mid} Z`
    return d
  }
  function buildStrokePath(side: 'home' | 'away'): string {
    if (blocks.length < 2) return ''
    const points = blocks.map(b => {
      const xCenter = ((b.startMinute + b.endMinute) / 2 / currentMinute) * (svgW - padX * 2) + padX
      const val = side === 'home' ? b.homePressure : b.awayPressure
      const normalized = val / maxPressure
      const y = side === 'home'
        ? mid - normalized * (mid - 4)
        : mid + normalized * (mid - 4)
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

  // ─── Marker layout with grouping and density ────────────────────────────
  type MarkerLayout =
    | { kind: 'single'; id: string; event: PressureGraphEvent; cx: number; cy: number; side: PressureGraphEvent['side']; muted: boolean }
    | { kind: 'group'; id: string; events: PressureGraphEvent[]; minute: number; side: PressureGraphEvent['side']; cx: number; cy: number; accent: string }

  const layoutMarkers = useMemo<MarkerLayout[]>(() => {
    if (currentMinute <= 0 || graphEvents.length === 0) return []

    const grouped = new Map<string, PressureGraphEvent[]>()
    for (const ev of graphEvents) {
      const key = `${ev.side}-${ev.minute}`
      const list = grouped.get(key) || []
      list.push(ev)
      grouped.set(key, list)
    }

    const baseOffset = 11
    const stackStep = 11
    const out: MarkerLayout[] = []

    for (const [key, list] of grouped) {
      const side = key.startsWith('home') ? 'home' : key.startsWith('away') ? 'away' : 'neutral'
      list.sort((a, b) => eventZIndex(b.type) - eventZIndex(a.type))
      const first = list[0]
      const cx = (first.minute / currentMinute) * (svgW - padX * 2) + padX
      const yDir = side === 'home' ? -1 : side === 'away' ? 1 : -1

      if (list.length <= stackCap) {
        list.forEach((ev, idx) => {
          const cy = mid + yDir * (baseOffset + idx * stackStep)
          const lowPri = LOW_PRIORITY_TYPES.includes(ev.type)
          const muted = density !== 'normal' && lowPri
          out.push({ kind: 'single', id: `s-${ev.id}`, event: ev, cx, cy, side, muted })
        })
      } else {
        const visibleCount = stackCap - 1
        const visible = list.slice(0, visibleCount)
        const overflow = list.slice(visibleCount)
        visible.forEach((ev, idx) => {
          const cy = mid + yDir * (baseOffset + idx * stackStep)
          out.push({ kind: 'single', id: `s-${ev.id}`, event: ev, cx, cy, side, muted: false })
        })
        const groupCy = mid + yDir * (baseOffset + visibleCount * stackStep)
        out.push({ kind: 'group', id: `g-${first.minute}-${side}`, events: overflow, minute: first.minute, side, cx, cy: groupCy, accent: groupAccent(overflow) })
      }
    }
    return out
  }, [graphEvents, currentMinute, mid, density, stackCap])

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
  const homeAccentHex = (homeColors[0] || '22d3ee').replace('#', '')
  const awayAccentHex = (awayColors[0] || 'f472b6').replace('#', '')

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

      {/* Graph + tooltip overlay */}
      <div className="relative rounded-2xl bg-[#080b12] border border-white/[0.04] overflow-hidden" style={{ height: '260px' }}>
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="none"
          className="w-full h-full"
          role="img"
          aria-label="Gráfico de pressão ao vivo com marcadores de eventos"
        >
          <PressureEventIconDefs />

          {/* Grid lines */}
          <line x1={padX} y1={mid} x2={svgW - padX} y2={mid} stroke="rgba(255,255,255,0.06)" strokeWidth="0.3" />
          <line x1={padX} y1={mid / 2} x2={svgW - padX} y2={mid / 2} stroke="rgba(255,255,255,0.02)" strokeWidth="0.2" strokeDasharray="2,4" />
          <line x1={padX} y1={mid + mid / 2} x2={svgW - padX} y2={mid + mid / 2} stroke="rgba(255,255,255,0.02)" strokeWidth="0.2" strokeDasharray="2,4" />

          {/* Halftime */}
          {currentMinute > 45 && (
            <line
              x1={(45 / currentMinute) * (svgW - padX * 2) + padX}
              y1="0"
              x2={(45 / currentMinute) * (svgW - padX * 2) + padX}
              y2={svgH}
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

          {/* Vertical hint lines per minute */}
          {layoutMarkers.map((m, i) => (
            <line
              key={`hint-${i}`}
              x1={m.cx}
              y1={mid - 1.5}
              x2={m.cx}
              y2={mid + 1.5}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="0.3"
            />
          ))}

          {/* Markers — render in zIndex ascending order */}
          {layoutMarkers
            .slice()
            .sort((a, b) => {
              const za = a.kind === 'group' ? 70 : eventZIndex(a.event.type)
              const zb = b.kind === 'group' ? 70 : eventZIndex(b.event.type)
              return za - zb
            })
            .map((m) => {
              if (m.kind === 'single') {
                const isSelected = selectedId === m.event.id
                const isHovered = hovered?.markerId === m.id
                const accent = m.side === 'home' ? homeAccentHex : m.side === 'away' ? awayAccentHex : undefined
                return (
                  <SingleMarker
                    key={m.id}
                    event={m.event}
                    cx={m.cx}
                    cy={m.cy}
                    muted={m.muted}
                    selected={isSelected}
                    hovered={isHovered}
                    teamAccent={accent}
                    onHover={() => setHovered({ kind: 'event', event: m.event, cx: m.cx, cy: m.cy, markerId: m.id })}
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
                  cx={m.cx}
                  cy={m.cy}
                  accent={m.accent}
                  hovered={isHovered}
                  onHover={() => setHovered({ kind: 'group', events: m.events, minute: m.minute, side: m.side, cx: m.cx, cy: m.cy, markerId: m.id })}
                  onLeave={() => setHovered(null)}
                />
              )
            })}

          {/* Current minute indicator */}
          <line
            x1={svgW - padX - 1}
            y1="0"
            x2={svgW - padX - 1}
            y2={svgH}
            stroke="rgba(52,211,153,0.3)"
            strokeWidth="0.5"
          />
        </svg>

        {/* Smart-positioned HTML tooltip overlay */}
        {hovered && (
          <SmartTooltip xPct={(hovered.cx / svgW) * 100} yPct={(hovered.cy / svgH) * 100}>
            {hovered.kind === 'event'
              ? <EventTooltipBody event={hovered.event} />
              : <GroupTooltipBody events={hovered.events} minute={hovered.minute} />
            }
          </SmartTooltip>
        )}
      </div>

      {/* Time axis */}
      <div className="flex justify-between text-[9px] text-white/20 tabular-nums px-1 mt-1.5">
        {timeLabels.map(t => <span key={t}>{t}'</span>)}
      </div>

      {/* Legend with counts and real icons */}
      {typeCounts.size > 0 ? (
        <Legend counts={typeCounts} />
      ) : (
        <p className="text-[10px] text-white/25 mt-3 px-1">Eventos detalhados indisponíveis para este provider.</p>
      )}
    </section>
  )
}

// ─── Smart tooltip wrapper ─────────────────────────────────────────────────

function SmartTooltip({ xPct, yPct, children }: { xPct: number; yPct: number; children: React.ReactNode }) {
  const horiz: 'left' | 'right' | 'center' = xPct < 18 ? 'left' : xPct > 82 ? 'right' : 'center'
  const placeBelow = yPct < 35

  let translateX = '-50%'
  let leftCss = `${xPct}%`
  if (horiz === 'left') { translateX = '0'; leftCss = `calc(${xPct}% + 12px)` }
  if (horiz === 'right') { translateX = '-100%'; leftCss = `calc(${xPct}% - 12px)` }

  const translateY = placeBelow ? '12px' : 'calc(-100% - 12px)'
  const topCss = `${yPct}%`

  return (
    <div
      role="tooltip"
      className="absolute z-30 max-w-[300px] pointer-events-none rounded-xl border border-white/[0.08] bg-[#0b1018]/95 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.5)] px-3.5 py-2.5 text-left animate-fadeIn"
      style={{ left: leftCss, top: topCss, transform: `translate(${translateX}, ${translateY})` }}
    >
      {children}
    </div>
  )
}

function EventTooltipBody({ event }: { event: PressureGraphEvent }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="shrink-0 inline-flex items-center justify-center"><PressureEventIconInline type={event.type} sizePx={16} /></span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/85">{eventLabel(event.type)}</span>
        <span className="text-[10px] text-white/45 tabular-nums ml-auto">{formatMinuteLabel(event.minute, event.addedTime)}</span>
      </div>
      {event.teamName && (
        <p className="text-[11.5px] text-white/85 font-semibold truncate">{event.teamName}</p>
      )}
      {event.playerName ? (
        <p className="text-[11px] text-white/70 leading-snug">{event.playerName}</p>
      ) : (
        <p className="text-[11px] text-white/35 italic leading-snug">Jogador não informado</p>
      )}
      {event.assistName && (
        <p className="text-[10.5px] text-white/55 leading-snug mt-0.5">Assistência: {event.assistName}</p>
      )}
      {event.description && event.description !== event.rawText && (
        <p className="text-[10.5px] text-white/45 leading-snug mt-1.5 border-t border-white/[0.05] pt-1.5">{event.description}</p>
      )}
    </>
  )
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

// ─── Marker buttons ────────────────────────────────────────────────────────

interface SingleMarkerProps {
  event: PressureGraphEvent
  cx: number
  cy: number
  muted: boolean
  selected: boolean
  hovered: boolean
  teamAccent?: string
  onHover: () => void
  onLeave: () => void
  onSelect: () => void
}

function SingleMarker({ event, cx, cy, muted, selected, hovered, teamAccent, onHover, onLeave, onSelect }: SingleMarkerProps) {
  const size = MARKER_SIZES[event.type] || 4
  const ariaLabel = `${eventLabel(event.type)} aos ${formatMinuteLabel(event.minute, event.addedTime)}${event.teamName ? ` · ${event.teamName}` : ''}${event.playerName ? ` · ${event.playerName}` : ''}`
  const activate = () => { onHover(); onSelect() }
  const hitR = Math.max(size * 1.5, 8)

  return (
    <g
      role="img"
      tabIndex={0}
      aria-label={ariaLabel}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      onClick={activate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() } }}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      {/* Hit area */}
      <circle cx={cx} cy={cy} r={hitR} fill="transparent" />
      <PressureEventIcon
        type={event.type}
        cx={cx}
        cy={cy}
        size={size}
        selected={selected}
        hovered={hovered}
        muted={muted}
        teamAccent={teamAccent}
      />
      <title>{ariaLabel}</title>
    </g>
  )
}

interface GroupMarkerProps {
  events: PressureGraphEvent[]
  minute: number
  cx: number
  cy: number
  accent: string
  hovered: boolean
  onHover: () => void
  onLeave: () => void
}

function GroupMarkerButton({ events, minute, cx, cy, accent, hovered, onHover, onLeave }: GroupMarkerProps) {
  const labels = events.slice(0, 3).map(e => eventLabel(e.type).toLowerCase())
  const ariaLabel = `${events.length} eventos no minuto ${minute}: ${labels.join(', ')}${events.length > labels.length ? ` e mais ${events.length - labels.length}` : ''}`
  return (
    <g
      role="img"
      tabIndex={0}
      aria-label={ariaLabel}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHover() } }}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      <circle cx={cx} cy={cy} r={9} fill="transparent" />
      <GroupBubble cx={cx} cy={cy} size={5.4} count={events.length} accent={accent} hovered={hovered} />
      <title>{ariaLabel}</title>
    </g>
  )
}

// ─── Legend with counts and real icons ─────────────────────────────────────

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
          <PressureEventIconInline type={item.iconType} sizePx={14} />
          <span className="text-white/70 font-medium">{item.label}</span>
          <span className="text-white/85 font-bold tabular-nums">{item.count}</span>
          {item.sublabel && <span className="text-white/35">· {item.sublabel}</span>}
        </li>
      ))}
    </ul>
  )
}

// ─── Misc ───────────────────────────────────────────────────────────────────

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
