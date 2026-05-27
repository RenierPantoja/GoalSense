/**
 * Premium Live Pressure Graph (V2.1) — attack momentum with rich event markers.
 * ─────────────────────────────────────────────────────────────────────────────
 * V2 added: typed marker model, rich HTML tooltip, side-aware stacking,
 *           legend with present types, fallback for providers without events.
 * V2.1 adds:
 *   - smart tooltip placement (flips horizontally near edges, vertically
 *     when the marker is on the wrong side of the line);
 *   - "+N" grouping when more than 3 events share the same minute/side;
 *   - group tooltip listing the events;
 *   - optional `onEventSelect` callback so the parent can scroll/highlight
 *     the corresponding entry in its timeline section;
 *   - density mode that softens low-priority markers when the match is busy;
 *   - legend with real per-type counts.
 *
 * The pressure curve, reading strip and confidence badge are intentionally
 * untouched — only the marker / tooltip / legend layer is reworked.
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

interface Props {
  events: { clock: string; text: string; type: string; team: string }[]
  commentary?: { clock: string; text: string }[]
  homeName: string
  awayName: string
  elapsed: number | null
  homeColors: string[]
  awayColors: string[]
  /**
   * Optional V2.1 hook — fires when the user clicks/activates a marker. The
   * parent typically scrolls to its timeline section and highlights the
   * matching event by id. Pure side-effect, no return value expected.
   */
  onEventSelect?: (event: PressureGraphEvent) => void
}

// ─── Marker visual config ────────────────────────────────────────────────────

interface MarkerVisual {
  shape: 'goal-ball' | 'shot-dot' | 'shot-ring' | 'card' | 'sub-arrows' | 'var-tag'
  size: number
  color: string
  border?: string
  legendLabel: string
}

const MARKER_VISUALS: Record<PressureGraphEventType, MarkerVisual> = {
  goal: { shape: 'goal-ball', size: 7, color: '#ffffff', border: '#0b0d12', legendLabel: 'Gol' },
  own_goal: { shape: 'goal-ball', size: 7, color: '#f43f5e', border: '#1a1118', legendLabel: 'Gol contra' },
  penalty_scored: { shape: 'goal-ball', size: 7, color: '#22d3ee', border: '#0b1218', legendLabel: 'Pênalti convertido' },
  penalty_missed: { shape: 'shot-ring', size: 6, color: '#f43f5e', legendLabel: 'Pênalti perdido' },
  shot_on_target: { shape: 'shot-dot', size: 4, color: '#22d3ee', legendLabel: 'Finalização no alvo' },
  shot_off_target: { shape: 'shot-ring', size: 4, color: '#94a3b8', legendLabel: 'Finalização fora' },
  yellow_card: { shape: 'card', size: 5, color: '#fbbf24', legendLabel: 'Cartão amarelo' },
  red_card: { shape: 'card', size: 5, color: '#f43f5e', legendLabel: 'Cartão vermelho' },
  second_yellow: { shape: 'card', size: 5, color: '#f59e0b', border: '#f43f5e', legendLabel: 'Segundo amarelo' },
  substitution: { shape: 'sub-arrows', size: 5, color: '#94a3b8', legendLabel: 'Substituição' },
  var: { shape: 'var-tag', size: 6, color: '#a78bfa', legendLabel: 'VAR' },
  unknown: { shape: 'shot-dot', size: 3, color: '#94a3b8', legendLabel: 'Evento' },
}

// Density: types that fade when the match is busy. Critical events
// (goals, red cards, penalties) never fade.
const LOW_PRIORITY_TYPES: PressureGraphEventType[] = ['shot_off_target', 'substitution', 'var', 'unknown']

// ─── Hover state ────────────────────────────────────────────────────────────

type HoverState =
  | { kind: 'event'; event: PressureGraphEvent; cx: number; cy: number }
  | { kind: 'group'; events: PressureGraphEvent[]; minute: number; side: PressureGraphEvent['side']; cx: number; cy: number }

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

  // Density tier: drives marker softening + grouping aggressiveness.
  // - normal:    <= 12 events     → render everything full opacity
  // - dense:     13..25 events    → soften low-priority markers
  // - very_dense: > 25 events     → soften + smaller stack cap
  const density = useMemo<'normal' | 'dense' | 'very_dense'>(() => {
    if (graphEvents.length > 25) return 'very_dense'
    if (graphEvents.length > 12) return 'dense'
    return 'normal'
  }, [graphEvents.length])

  // Stack cap drives when "+N" appears.
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

  // Build smooth area paths (unchanged from V2)
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
    | { kind: 'single'; event: PressureGraphEvent; cx: number; cy: number; side: PressureGraphEvent['side']; opacity: number }
    | { kind: 'group'; events: PressureGraphEvent[]; minute: number; side: PressureGraphEvent['side']; cx: number; cy: number }

  const layoutMarkers = useMemo<MarkerLayout[]>(() => {
    if (currentMinute <= 0 || graphEvents.length === 0) return []

    const grouped = new Map<string, PressureGraphEvent[]>()
    for (const ev of graphEvents) {
      const key = `${ev.side}-${ev.minute}`
      const list = grouped.get(key) || []
      list.push(ev)
      grouped.set(key, list)
    }

    const baseOffset = 9
    const stackStep = 8
    const out: MarkerLayout[] = []

    for (const [key, list] of grouped) {
      const side = key.startsWith('home') ? 'home' : key.startsWith('away') ? 'away' : 'neutral'
      // Sort by importance descending so critical events sit closest to the line.
      list.sort((a, b) => eventZIndex(b.type) - eventZIndex(a.type))
      const first = list[0]
      const cx = (first.minute / currentMinute) * (svgW - padX * 2) + padX
      const yDir = side === 'home' ? -1 : side === 'away' ? 1 : -1

      if (list.length <= stackCap) {
        list.forEach((ev, idx) => {
          const cy = mid + yDir * (baseOffset + idx * stackStep)
          const lowPri = LOW_PRIORITY_TYPES.includes(ev.type)
          const opacity = density === 'normal' || !lowPri ? 1 : density === 'dense' ? 0.55 : 0.4
          out.push({ kind: 'single', event: ev, cx, cy, side, opacity })
        })
      } else {
        // Render the top (stackCap - 1) events, then a +N group bubble.
        const visibleCount = stackCap - 1
        const visible = list.slice(0, visibleCount)
        const overflow = list.slice(visibleCount)
        visible.forEach((ev, idx) => {
          const cy = mid + yDir * (baseOffset + idx * stackStep)
          out.push({ kind: 'single', event: ev, cx, cy, side, opacity: 1 })
        })
        const groupCy = mid + yDir * (baseOffset + visibleCount * stackStep)
        out.push({ kind: 'group', events: overflow, minute: first.minute, side, cx, cy: groupCy })
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
      <div className="relative rounded-2xl bg-[#080b12] border border-white/[0.04] overflow-hidden" style={{ height: '240px' }}>
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="none"
          className="w-full h-full"
          role="img"
          aria-label="Gráfico de pressão ao vivo com marcadores de eventos"
        >
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

          {/* Vertical hint lines per minute (one per group key, even though we drew several markers) */}
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

          {/* Markers — group bubbles render on top of singles by sorting by zIndex ascending */}
          {layoutMarkers
            .slice()
            .sort((a, b) => {
              const za = a.kind === 'group' ? 70 : eventZIndex(a.event.type)
              const zb = b.kind === 'group' ? 70 : eventZIndex(b.event.type)
              return za - zb
            })
            .map((m, i) => {
              if (m.kind === 'single') {
                const isSelected = selectedId === m.event.id
                return (
                  <Marker
                    key={`s-${m.event.id}-${i}`}
                    event={m.event}
                    cx={m.cx}
                    cy={m.cy}
                    opacity={m.opacity}
                    selected={isSelected}
                    onHover={(x, y) => setHovered({ kind: 'event', event: m.event, cx: x, cy: y })}
                    onLeave={() => setHovered(null)}
                    onSelect={() => handleSelect(m.event)}
                  />
                )
              }
              return (
                <GroupMarker
                  key={`g-${m.minute}-${m.side}-${i}`}
                  events={m.events}
                  minute={m.minute}
                  cx={m.cx}
                  cy={m.cy}
                  onHover={(x, y) => setHovered({ kind: 'group', events: m.events, minute: m.minute, side: m.side, cx: x, cy: y })}
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
        {hovered && (hovered.kind === 'event'
          ? <SmartTooltip xPct={hovered.cx} yPct={hovered.cy}>
              <EventTooltipBody event={hovered.event} />
            </SmartTooltip>
          : <SmartTooltip xPct={hovered.cx} yPct={hovered.cy}>
              <GroupTooltipBody events={hovered.events} minute={hovered.minute} />
            </SmartTooltip>
        )}
      </div>

      {/* Time axis */}
      <div className="flex justify-between text-[9px] text-white/20 tabular-nums px-1 mt-1.5">
        {timeLabels.map(t => <span key={t}>{t}'</span>)}
      </div>

      {/* Legend with counts */}
      {typeCounts.size > 0 ? (
        <Legend counts={typeCounts} />
      ) : (
        <p className="text-[10px] text-white/25 mt-3 px-1">Eventos detalhados indisponíveis para este provider.</p>
      )}
    </section>
  )
}

// ─── Smart tooltip wrapper ─────────────────────────────────────────────────

/**
 * Anchors a tooltip inside the graph viewport using percent-based rules so we
 * never have to measure the DOM. Logic:
 *  - x < 18%  → align left edge of tooltip with marker (tooltip extends to the right)
 *  - x > 82%  → align right edge of tooltip with marker (extends to the left)
 *  - else     → center horizontally on the marker
 *  - y < 35%  → place tooltip BELOW the marker
 *  - else     → place tooltip ABOVE
 */
function SmartTooltip({ xPct, yPct, children }: { xPct: number; yPct: number; children: React.ReactNode }) {
  const horiz: 'left' | 'right' | 'center' = xPct < 18 ? 'left' : xPct > 82 ? 'right' : 'center'
  const placeBelow = yPct < 35

  let translateX = '-50%'
  let leftCss = `${xPct}%`
  if (horiz === 'left') { translateX = '0'; leftCss = `calc(${xPct}% + 8px)` }
  if (horiz === 'right') { translateX = '-100%'; leftCss = `calc(${xPct}% - 8px)` }

  const translateY = placeBelow ? '8px' : 'calc(-100% - 8px)'
  const topCss = `${yPct}%`

  return (
    <div
      role="tooltip"
      className="absolute z-30 max-w-[280px] pointer-events-none rounded-xl border border-white/[0.08] bg-[#0b1018]/95 backdrop-blur-sm shadow-[0_8px_24px_rgba(0,0,0,0.5)] px-3.5 py-2.5 text-left animate-fadeIn"
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
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/85">{eventLabel(event.type)}</span>
        <span className="text-[10px] text-white/45 tabular-nums">{formatMinuteLabel(event.minute, event.addedTime)}</span>
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
        <span className="text-[10px] text-white/45 tabular-nums">{events.length}</span>
      </div>
      <ul className="space-y-1">
        {visible.map(ev => (
          <li key={ev.id} className="flex items-start gap-2 text-[11px] text-white/70 leading-snug">
            <GroupListSwatch type={ev.type} />
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

function GroupListSwatch({ type }: { type: PressureGraphEventType }) {
  const cfg = MARKER_VISUALS[type] || MARKER_VISUALS.unknown
  return <span className="inline-block h-2 w-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: cfg.color }} aria-hidden />
}

// ─── Marker variants ────────────────────────────────────────────────────────

interface MarkerProps {
  event: PressureGraphEvent
  cx: number
  cy: number
  opacity?: number
  selected?: boolean
  onHover: (xPct: number, yPct: number) => void
  onLeave: () => void
  onSelect?: () => void
}

function Marker({ event, cx, cy, opacity = 1, selected = false, onHover, onLeave, onSelect }: MarkerProps) {
  const cfg = MARKER_VISUALS[event.type] || MARKER_VISUALS.unknown
  const ariaLabel = `${eventLabel(event.type)} aos ${formatMinuteLabel(event.minute, event.addedTime)}${event.teamName ? ` · ${event.teamName}` : ''}${event.playerName ? ` · ${event.playerName}` : ''}`
  const handleEnter = () => {
    const xPct = (cx / 400) * 100
    const yPct = (cy / 120) * 100
    onHover(xPct, yPct)
  }
  const activate = () => { handleEnter(); if (onSelect) onSelect() }

  return (
    <g
      role="img"
      tabIndex={0}
      aria-label={ariaLabel}
      onMouseEnter={handleEnter}
      onMouseLeave={onLeave}
      onFocus={handleEnter}
      onBlur={onLeave}
      onClick={activate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() } }}
      style={{ cursor: 'pointer', outline: 'none', opacity }}
    >
      <circle cx={cx} cy={cy} r={Math.max(cfg.size * 1.3, 6)} fill="transparent" />
      {selected && (
        <circle cx={cx} cy={cy} r={cfg.size + 2.4} fill="none" stroke="#22d3ee" strokeWidth="0.6" opacity="0.9" />
      )}
      <MarkerShape event={event} cx={cx} cy={cy} />
      <title>{ariaLabel}</title>
    </g>
  )
}

function GroupMarker({ events, minute, cx, cy, onHover, onLeave }: { events: PressureGraphEvent[]; minute: number; cx: number; cy: number; onHover: (xPct: number, yPct: number) => void; onLeave: () => void }) {
  const r = 5.5
  const labels = events.slice(0, 3).map(e => eventLabel(e.type).toLowerCase())
  const ariaLabel = `${events.length} eventos no minuto ${minute}: ${labels.join(', ')}${events.length > labels.length ? ` e mais ${events.length - labels.length}` : ''}`
  const handleEnter = () => onHover((cx / 400) * 100, (cy / 120) * 100)
  return (
    <g
      role="img"
      tabIndex={0}
      aria-label={ariaLabel}
      onMouseEnter={handleEnter}
      onMouseLeave={onLeave}
      onFocus={handleEnter}
      onBlur={onLeave}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEnter() } }}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      <circle cx={cx} cy={cy} r={r * 1.3} fill="transparent" />
      <circle cx={cx} cy={cy} r={r} fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
      <text x={cx} y={cy + 1.6} textAnchor="middle" fontSize="4.5" fontWeight="700" fill="#ffffff">+{events.length}</text>
      <title>{ariaLabel}</title>
    </g>
  )
}

function MarkerShape({ event, cx, cy }: { event: PressureGraphEvent; cx: number; cy: number }) {
  const cfg = MARKER_VISUALS[event.type] || MARKER_VISUALS.unknown
  switch (cfg.shape) {
    case 'goal-ball':
      return (
        <g>
          <circle cx={cx} cy={cy} r={cfg.size} fill={cfg.color} stroke={cfg.border || '#0b0d12'} strokeWidth="0.6" />
          <circle cx={cx} cy={cy} r={cfg.size * 0.45} fill="rgba(0,0,0,0.18)" />
        </g>
      )
    case 'shot-dot':
      return <circle cx={cx} cy={cy} r={cfg.size} fill={cfg.color} stroke="rgba(0,0,0,0.3)" strokeWidth="0.4" opacity="0.95" />
    case 'shot-ring':
      return <circle cx={cx} cy={cy} r={cfg.size} fill="none" stroke={cfg.color} strokeWidth="0.9" opacity="0.85" />
    case 'card': {
      const w = cfg.size * 0.95
      const h = cfg.size * 1.4
      return (
        <g>
          <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx="0.6" fill={cfg.color} stroke={cfg.border || 'rgba(0,0,0,0.45)'} strokeWidth="0.4" />
          {event.type === 'second_yellow' && (
            <rect x={cx - w / 2 + w * 0.45} y={cy - h / 2 + 0.4} width={w * 0.6} height={h - 0.8} rx="0.5" fill="#f43f5e" opacity="0.9" />
          )}
        </g>
      )
    }
    case 'sub-arrows': {
      const s = cfg.size
      return (
        <g stroke={cfg.color} strokeWidth="0.8" fill="none" strokeLinecap="round">
          <path d={`M${cx - s} ${cy - 0.5} h${s * 1.6}`} />
          <path d={`M${cx + s * 0.4} ${cy - 1.5} l${s * 0.2} 1 l${-s * 0.2} 1`} />
          <path d={`M${cx + s} ${cy + 0.5} h${-s * 1.6}`} />
          <path d={`M${cx - s * 0.4} ${cy + 1.5} l${-s * 0.2} -1 l${s * 0.2} -1`} />
        </g>
      )
    }
    case 'var-tag':
      return (
        <g>
          <rect x={cx - cfg.size} y={cy - cfg.size * 0.7} width={cfg.size * 2} height={cfg.size * 1.4} rx="1" fill={cfg.color} opacity="0.9" />
          <text x={cx} y={cy + cfg.size * 0.4} textAnchor="middle" fontSize={cfg.size * 1} fontWeight="bold" fill="#0b0d12">VAR</text>
        </g>
      )
    default:
      return <circle cx={cx} cy={cy} r={cfg.size} fill={cfg.color} />
  }
}

// ─── Legend with counts and shot grouping ───────────────────────────────────

function Legend({ counts }: { counts: Map<PressureGraphEventType, number> }) {
  // Combined "Finalizações" entry showing on / off split when any shot exists.
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

  const items: { key: string; swatchType: PressureGraphEventType; label: string; count: number; sublabel?: string }[] = []
  if (totalGoals > 0) {
    const sub: string[] = []
    if (goal > 0) sub.push(`${goal} normal${goal === 1 ? '' : 'is'}`)
    if (ownGoal > 0) sub.push(`${ownGoal} contra`)
    if (penScored > 0) sub.push(`${penScored} pênalti`)
    items.push({ key: 'goals', swatchType: 'goal', label: 'Gols', count: totalGoals, sublabel: sub.length > 0 ? sub.join(' · ') : undefined })
  }
  if (penMissed > 0) {
    items.push({ key: 'penalty_missed', swatchType: 'penalty_missed', label: 'Pênaltis perdidos', count: penMissed })
  }
  if (totalShots > 0) {
    const sub: string[] = []
    if (onTarget > 0) sub.push(`${onTarget} no alvo`)
    if (offTarget > 0) sub.push(`${offTarget} fora`)
    items.push({ key: 'shots', swatchType: 'shot_on_target', label: 'Finalizações', count: totalShots, sublabel: sub.join(' · ') })
  }
  if (totalCards > 0) {
    const sub: string[] = []
    if (yellow > 0) sub.push(`${yellow} amarelo${yellow === 1 ? '' : 's'}`)
    if (red > 0) sub.push(`${red} vermelho${red === 1 ? '' : 's'}`)
    if (sec > 0) sub.push(`${sec} 2º amarelo`)
    items.push({ key: 'cards', swatchType: red > 0 || sec > 0 ? 'red_card' : 'yellow_card', label: 'Cartões', count: totalCards, sublabel: sub.join(' · ') })
  }
  if (subs > 0) items.push({ key: 'subs', swatchType: 'substitution', label: 'Substituições', count: subs })
  if (vars > 0) items.push({ key: 'vars', swatchType: 'var', label: 'VAR', count: vars })

  if (items.length === 0) return null

  return (
    <ul className="flex items-center gap-3 flex-wrap mt-3 text-[10px] text-white/50">
      {items.map(item => (
        <li key={item.key} className="flex items-center gap-1.5">
          <LegendSwatch type={item.swatchType} />
          <span className="text-white/70 font-medium">{item.label}</span>
          <span className="text-white/85 font-bold tabular-nums">{item.count}</span>
          {item.sublabel && <span className="text-white/35">· {item.sublabel}</span>}
        </li>
      ))}
    </ul>
  )
}

function LegendSwatch({ type }: { type: PressureGraphEventType }) {
  const cfg = MARKER_VISUALS[type]
  if (cfg.shape === 'card') {
    return <span className="inline-block h-2.5 w-1.5 rounded-[1px]" style={{ backgroundColor: cfg.color, border: type === 'second_yellow' ? '1px solid #f43f5e' : 'none' }} />
  }
  if (cfg.shape === 'goal-ball') {
    return <span className="inline-block h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: cfg.color, borderColor: cfg.border || '#0b0d12' }} />
  }
  if (cfg.shape === 'shot-ring' || cfg.shape === 'shot-dot') {
    return <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: cfg.shape === 'shot-dot' ? cfg.color : 'transparent', border: cfg.shape === 'shot-ring' ? `1px solid ${cfg.color}` : 'none' }} />
  }
  if (cfg.shape === 'var-tag') {
    return <span className="inline-block h-2.5 px-1 rounded text-[8px] font-bold leading-[10px]" style={{ backgroundColor: cfg.color, color: '#0b0d12' }}>V</span>
  }
  return <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color }} />
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
