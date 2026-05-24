import { useNavigate } from 'react-router-dom'
import { ClubLogo } from '@/components/ui/ClubLogo'
import type { LiveFixture } from '@/lib/apiClient'
import { calculateAttention } from './attentionQueue'
import { displayCompetition } from '@/lib/competitionLabels'

interface ScannerProps {
  fixtures: LiveFixture[]
  stats: Map<number, FixtureStats>
  selectedId: number | null
  onSelect: (id: number) => void
  onOpen: (id: number) => void
}

export interface FixtureStats {
  possession?: { home: number; away: number }
  shots?: { home: number; away: number }
  shotsOnTarget?: { home: number; away: number }
  corners?: { home: number; away: number }
  fouls?: { home: number; away: number }
  yellowCards?: { home: number; away: number }
}

export function LiveScannerTable({ fixtures, stats, selectedId, onSelect, onOpen }: ScannerProps) {
  const navigate = useNavigate()

  if (fixtures.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.04] bg-white/[0.01] py-16 text-center">
        <p className="text-[13px] text-white/30">Nenhuma partida para exibir no scanner</p>
      </div>
    )
  }

  // Determine which stat columns have data
  const hasPoss = fixtures.some(fx => { const s = stats.get(fx.id); return s?.possession && (s.possession.home > 0 || s.possession.away > 0) })
  const hasShots = fixtures.some(fx => { const s = stats.get(fx.id); return s?.shots && (s.shots.home > 0 || s.shots.away > 0) })
  const hasOnTarget = fixtures.some(fx => { const s = stats.get(fx.id); return s?.shotsOnTarget && (s.shotsOnTarget.home > 0 || s.shotsOnTarget.away > 0) })
  const hasCorners = fixtures.some(fx => { const s = stats.get(fx.id); return s?.corners && (s.corners.home > 0 || s.corners.away > 0) })
  const hasCards = fixtures.some(fx => { const s = stats.get(fx.id); return s?.yellowCards && (s.yellowCards.home > 0 || s.yellowCards.away > 0) })

  return (
    <div className="rounded-2xl border border-white/[0.04] bg-white/[0.01] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead>
            <tr className="border-b border-white/[0.04]">
              <Th>Min.</Th>
              <Th align="right">Mandante</Th>
              <Th align="center">Placar</Th>
              <Th align="left">Visitante</Th>
              {hasPoss && <Th align="center">Posse</Th>}
              {hasShots && <Th align="center">Finalizações</Th>}
              {hasOnTarget && <Th align="center">No alvo</Th>}
              {hasCorners && <Th align="center">Escanteios</Th>}
              {hasCards && <Th align="center">Cartões</Th>}
              <Th align="center">Atenção</Th>
              <Th>Competição</Th>
              <Th>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {fixtures.map((fx) => {
              const s = stats.get(fx.id)
              const { score: attScore, level } = calculateAttention(fx)
              const attColor = level === 'critical' ? 'text-rose-400' : level === 'high' ? 'text-amber-400' : level === 'medium' ? 'text-cyan-400' : 'text-white/25'

              return (
                <tr key={fx.id} onClick={() => onSelect(fx.id)} onDoubleClick={() => onOpen(fx.id)}
                  className={`border-b border-white/[0.02] cursor-pointer transition-colors ${selectedId === fx.id ? 'bg-cyan-500/[0.04] border-l-2 border-l-cyan-400' : 'hover:bg-white/[0.02]'}`}>
                  <Td>
                    <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-emerald-400 font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {fx.status.elapsed || '—'}
                    </span>
                  </Td>
                  <Td align="right">
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-[12px] font-medium text-white/80 truncate max-w-[120px]">{fx.homeTeam.name}</span>
                      <ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={22} />
                    </div>
                  </Td>
                  <Td align="center">
                    <span className="text-[14px] font-bold tabular-nums text-white">
                      {fx.score.home ?? 0} - {fx.score.away ?? 0}
                    </span>
                  </Td>
                  <Td align="left">
                    <div className="flex items-center gap-2">
                      <ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={22} />
                      <span className="text-[12px] font-medium text-white/60 truncate max-w-[120px]">{fx.awayTeam.name}</span>
                    </div>
                  </Td>
                  {hasPoss && <Td align="center"><StatCell home={s?.possession?.home} away={s?.possession?.away} suffix="%" /></Td>}
                  {hasShots && <Td align="center"><StatCell home={s?.shots?.home} away={s?.shots?.away} /></Td>}
                  {hasOnTarget && <Td align="center"><StatCell home={s?.shotsOnTarget?.home} away={s?.shotsOnTarget?.away} /></Td>}
                  {hasCorners && <Td align="center"><StatCell home={s?.corners?.home} away={s?.corners?.away} /></Td>}
                  {hasCards && <Td align="center"><StatCell home={s?.yellowCards?.home} away={s?.yellowCards?.away} /></Td>}
                  <Td align="center"><span className={`text-[11px] font-bold tabular-nums ${attColor}`}>{attScore} <span className="font-normal text-[9px]">{level === 'critical' ? 'Crítica' : level === 'high' ? 'Alta' : level === 'medium' ? 'Mod.' : ''}</span></span></Td>
                  <Td><span className="text-[10px] text-white/20 truncate block max-w-[140px]" title={displayCompetition(fx.league.name, fx.league.country)}>{displayCompetition(fx.league.name, fx.league.country)}</span></Td>
                  <Td><button onClick={(e) => { e.stopPropagation(); onOpen(fx.id) }} className="text-[10px] text-cyan-400/50 hover:text-cyan-400 transition-colors">Analisar</button></Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: string }) {
  return <th className={`px-3 py-3 text-[9px] font-bold uppercase tracking-[0.12em] text-white/25 text-${align} whitespace-nowrap`}>{children}</th>
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: string }) {
  return <td className={`px-3 py-3.5 text-${align} whitespace-nowrap`}>{children}</td>
}

function StatCell({ home, away, suffix = '' }: { home?: number; away?: number; suffix?: string }) {
  if (home === undefined && away === undefined) {
    return <span className="text-[10px] text-white/15">—</span>
  }
  // Treat all-zeros as unavailable (API returned empty stats)
  if ((home || 0) === 0 && (away || 0) === 0) {
    return <span className="text-[10px] text-white/15">—</span>
  }
  return (
    <span className="text-[11px] tabular-nums text-white/50">
      {home ?? '—'}{suffix} - {away ?? '—'}{suffix}
    </span>
  )
}
