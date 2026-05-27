/**
 * Premium Live Pressure Graph (V2) — attack momentum with rich event markers.
 * ─────────────────────────────────────────────────────────────────────────────
 * - Mandante acima da linha central, visitante abaixo.
 * - Marcadores reais por minuto: gol, gol contra, pênalti, finalizações,
 *   cartões, substituições e VAR (quando o provider entrega).
 * - Tooltip rico com tipo, minuto, time, jogador e assistência. Renderizado
 *   como overlay HTML para garantir legibilidade e responsividade.
 * - Stacking inteligente para evitar sobreposição em minutos quentes.
 * - Funciona ao vivo e em jogos encerrados. Sem mocks, sem dado inventado.
 */

import { useMemo, useState } from 'react'
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
}

// ─── Marker visual config ────────────────────────────────────────────────────

interface MarkerVisual {
  shape: 'goal-ball' | 'shot-dot' | 'shot-ring' | 'card' | 'sub-arrows' | 'var-tag'
  /** Width of the marker in SVG units. */
  size: number
  /** Marker fill / accent color (overridden by team color when applicable). */
  color: string
  /** Optional border tone for cards / dots. */
  border?: string
  /** Used by the legend. */
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

// ─── Component ───────────────────────────────────────────────────────────────

export function LivePressureGraph({ events, commentary, homeName, awayName, elapsed, homeColors, awayColors }: Props) {
  // Merge events + commentary for richer pressure data
  const allEvents: { clock: string; text: string; type: string; team: string }[] = [...events]
  if (commentary && commentary.length > 0) {
    for (const c of commentary) {
      // Only add commentary items that look like action events (not just narration filler)
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

  // Local state for the rich tooltip overlay.
  const [hovered, setHovered] = useState<{ event: PressureGraphEvent; x: number; y: number } | null>(null)

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

  // Build smooth area paths
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
      if (i === 0) {
        d += ` L${points[i].x},${points[i].y}`
      } else {
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
      if (i === 0) {
        d = `M${points[i].x},${points[i].y}`
      } else {
        const prev = points[i - 1]
        const cpX = (prev.x + points[i].x) / 2
        d += ` Q${cpX},${prev.y} ${points[i].x},${points[i].y}`
      }
    }
    return d
  }

  // ─── Marker layout: stack by side, sort by importance ────────────────────
  // Markers above the line for `home`, below for `away`. `neutral` (no team)
  // sits exactly on the line. Within the same minute we stack outward away
  // from the center using a small offset, and order by descending z-index so
  // critical events (gols, vermelhos) ficam mais visíveis.
  const layoutMarkers = useMemo(() => {
    type Layout = { event: PressureGraphEvent; cx: number; cy: number }
    if (currentMinute <= 0 || graphEvents.length === 0) return [] as Layout[]

    const grouped = new Map<string, PressureGraphEvent[]>()
    for (const ev of graphEvents) {
      const key = `${ev.side}-${ev.minute}`
      const list = grouped.get(key) || []
      list.push(ev)
      grouped.set(key, list)
    }

    const baseOffset = 9 // distance from centerline to the first marker
    const stackStep = 8
    const out: Layout[] = []
    for (const [key, list] of grouped) {
      const side = key.startsWith('home') ? 'home' : key.startsWith('away') ? 'away' : 'neutral'
      list.sort((a, b) => eventZIndex(b.type) - eventZIndex(a.type))
      const first = list[0]
      const cx = (first.minute / currentMinute) * (svgW - padX * 2) + padX
      list.forEach((ev, idx) => {
        const yDir = side === 'home' ? -1 : side === 'away' ? 1 : (idx % 2 === 0 ? -1 : 1)
        const cy = mid + yDir * (baseOffset + idx * stackStep)
        out.push({ event: ev, cx, cy })
      })
    }
    return out
  }, [graphEvents, currentMinute, mid])

  // Time axis labels
  const timeLabels: number[] = [0]
  if (currentMinute >= 15) timeLabels.push(15)
  if (currentMinute >= 30) timeLabels.push(30)
  if (currentMinute >= 45) timeLabels.push(45)
  if (currentMinute >= 60) timeLabels.push(60)
  if (currentMinute >= 75) timeLabels.push(75)
  if (currentMinute > 80) timeLabels.push(90)
  else timeLabels.push(currentMinute)

  // Active legend: only show entries for event types actually present.
  const presentTypes = useMemo(() => {
    const set = new Set<PressureGraphEventType>()
    for (const ev of graphEvents) set.add(ev.type)
    return set
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

          {/* Halftime line */}
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

          {/* Vertical hint line per marker minute */}
          {layoutMarkers.map(({ event, cx }, i) => (
            <line
              key={`hint-${event.id}-${i}`}
              x1={cx}
              y1={mid - 1.5}
              x2={cx}
              y2={mid + 1.5}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="0.3"
            />
          ))}

          {/* Markers */}
          {layoutMarkers
            .slice()
            .sort((a, b) => eventZIndex(a.event.type) - eventZIndex(b.event.type))
            .map(({ event, cx, cy }) => (
              <Marker
                key={event.id}
                event={event}
                cx={cx}
                cy={cy}
                onHover={(x, y) => setHovered({ event, x, y })}
                onLeave={() => setHovered(null)}
              />
            ))}

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

        {/* Rich HTML tooltip overlay */}
        {hovered && <Tooltip event={hovered.event} x={hovered.x} y={hovered.y} />}
      </div>

      {/* Time axis */}
      <div className="flex justify-between text-[9px] text-white/20 tabular-nums px-1 mt-1.5">
        {timeLabels.map(t => <span key={t}>{t}'</span>)}
      </div>

      {/* Legend */}
      {presentTypes.size > 0 ? (
        <Legend types={presentTypes} />
      ) : (
        <p className="text-[10px] text-white/25 mt-3 px-1">Eventos detalhados indisponíveis para este provider.</p>
      )}
    </section>
  )
}

// ─── Tooltip overlay ────────────────────────────────────────────────────────

function Tooltip({ event, x, y }: { event: PressureGraphEvent; x: number; y: number }) {
  // Clamp inside the graph box. The container is the parent `relative` div
  // with a fixed height of 240px; SVG fills 100% width via preserveAspectRatio.
  // We position the tooltip near the cursor, biased above the marker.
  const left = `calc(${x}% + 6px)`
  const top = `calc(${y}% - 8px)`
  return (
    <div
      role="tooltip"
      className="absolute z-30 max-w-[260px] pointer-events-none rounded-xl border border-white/[0.08] bg-[#0b1018]/95 backdrop-blur-sm shadow-[0_8px_24px_rgba(0,0,0,0.5)] px-3.5 py-2.5 text-left animate-fadeIn"
      style={{ left, top, transform: 'translate(0, -100%)' }}
    >
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
    </div>
  )
}

// ─── Marker variants ────────────────────────────────────────────────────────

interface MarkerProps {
  event: PressureGraphEvent
  cx: number
  cy: number
  onHover: (xPct: number, yPct: number) => void
  onLeave: () => void
}

function Marker({ event, cx, cy, onHover, onLeave }: MarkerProps) {
  const cfg = MARKER_VISUALS[event.type] || MARKER_VISUALS.unknown
  const ariaLabel = `${eventLabel(event.type)} aos ${formatMinuteLabel(event.minute, event.addedTime)}${event.teamName ? ` · ${event.teamName}` : ''}${event.playerName ? ` · ${event.playerName}` : ''}`
  const handleEnter = () => {
    // Convert SVG coords (0-400 / 0-120) into percentage of the container so
    // the HTML tooltip can be positioned with `calc(% + offset)`.
    const xPct = (cx / 400) * 100
    const yPct = (cy / 120) * 100
    onHover(xPct, yPct)
  }
  const handleClick = () => handleEnter()

  return (
    <g
      role="img"
      tabIndex={0}
      aria-label={ariaLabel}
      onMouseEnter={handleEnter}
      onMouseLeave={onLeave}
      onFocus={handleEnter}
      onBlur={onLeave}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter') handleClick() }}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      {/* Invisible hit-area so small markers stay easy to hover. */}
      <circle cx={cx} cy={cy} r={Math.max(cfg.size * 1.3, 6)} fill="transparent" />

      <MarkerShape event={event} cx={cx} cy={cy} />
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

// ─── Legend ─────────────────────────────────────────────────────────────────

function Legend({ types }: { types: Set<PressureGraphEventType> }) {
  const order: PressureGraphEventType[] = [
    'goal', 'own_goal', 'penalty_scored', 'penalty_missed',
    'shot_on_target', 'shot_off_target',
    'yellow_card', 'red_card', 'second_yellow',
    'substitution', 'var',
  ]
  const visible = order.filter(t => types.has(t))
  return (
    <ul className="flex items-center gap-3 flex-wrap mt-3 text-[10px] text-white/45">
      {visible.map(t => (
        <li key={t} className="flex items-center gap-1.5">
          <LegendSwatch type={t} />
          <span>{MARKER_VISUALS[t].legendLabel}</span>
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
