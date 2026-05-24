/**
 * Premium Live Pressure Graph — attack momentum visualization.
 * Mandante above centerline, visitante below.
 * Uses real normalized events only.
 */

import { buildPressureTimeline } from '@/features/matches/buildPressureTimeline'
import { buildPressureRead } from '@/features/matches/buildPressureRead'
import { normalizeEvents } from '@/features/matches/normalizeMatchEvents'

interface Props {
  events: { clock: string; text: string; type: string; team: string }[]
  commentary?: { clock: string; text: string }[]
  homeName: string
  awayName: string
  elapsed: number | null
  homeColors: string[]
  awayColors: string[]
}

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
  const normalized = normalizeEvents(events)

  // Colors
  const hc = `#${homeColors[0] || '22d3ee'}`
  const hcFill = `${hc}80` // 50% opacity
  const ac = `#${awayColors[0] || 'f472b6'}`
  const acFill = `${ac}66` // 40% opacity

  // If not enough data, show elegant empty state
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

  // SVG dimensions
  const svgW = 400
  const svgH = 120
  const mid = svgH / 2
  const padX = 0
  const { blocks, maxPressure, currentMinute } = timeline

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

    // Smooth curve using quadratic bezier
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

  // Event markers (goals, cards)
  const markers = normalized
    .filter(e => e.type === 'goal' || e.type === 'red_card' || e.type === 'yellow_card')
    .map(e => {
      const x = (e.minute / currentMinute) * (svgW - padX * 2) + padX
      return { x, type: e.type, minute: e.minute, player: e.playerName, team: e.teamName }
    })

  // Time axis labels
  const timeLabels: number[] = [0]
  if (currentMinute >= 15) timeLabels.push(15)
  if (currentMinute >= 30) timeLabels.push(30)
  if (currentMinute >= 45) timeLabels.push(45)
  if (currentMinute >= 60) timeLabels.push(60)
  if (currentMinute >= 75) timeLabels.push(75)
  if (currentMinute > 80) timeLabels.push(90)
  else timeLabels.push(currentMinute)

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

      {/* Legend */}
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

      {/* Graph */}
      <div className="relative rounded-2xl bg-[#080b12] border border-white/[0.04] overflow-hidden" style={{ height: '240px' }}>
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="none"
          className="w-full h-full"
          role="img"
          aria-label="Gráfico de pressão ao vivo"
        >
          {/* Grid lines */}
          <line x1={padX} y1={mid} x2={svgW - padX} y2={mid} stroke="rgba(255,255,255,0.06)" strokeWidth="0.3" />
          {/* Quarter lines */}
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

          {/* Home area (above) */}
          <path d={buildPath('home')} fill={hcFill} />
          <path d={buildStrokePath('home')} fill="none" stroke={hc} strokeWidth="0.8" strokeLinecap="round" />

          {/* Away area (below) */}
          <path d={buildPath('away')} fill={acFill} />
          <path d={buildStrokePath('away')} fill="none" stroke={ac} strokeWidth="0.8" strokeLinecap="round" />

          {/* Event markers */}
          {markers.map((m, i) => {
            const markerColor = m.type === 'goal' ? '#34d399' : m.type === 'red_card' ? '#f43f5e' : '#fbbf24'
            const size = m.type === 'goal' ? 2.5 : 1.8
            return (
              <g key={i}>
                <circle cx={m.x} cy={mid} r={size} fill={markerColor} opacity="0.9">
                  <title>{m.type === 'goal' ? 'Gol' : m.type === 'red_card' ? 'Vermelho' : 'Amarelo'} {m.minute}' — {m.player || m.team}</title>
                </circle>
                <line x1={m.x} y1={mid - 3} x2={m.x} y2={mid + 3} stroke={markerColor} strokeWidth="0.3" opacity="0.5" />
              </g>
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
      </div>

      {/* Time axis */}
      <div className="flex justify-between text-[9px] text-white/20 tabular-nums px-1 mt-1.5">
        {timeLabels.map(t => <span key={t}>{t}'</span>)}
      </div>
    </section>
  )
}

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
