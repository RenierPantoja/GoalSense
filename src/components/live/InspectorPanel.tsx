import { useState, useEffect } from 'react'

import { ClubLogo } from '@/components/ui/ClubLogo'
import type { LiveFixture } from '@/lib/apiClient'
import { calculateAttention } from '@/features/live/attentionQueue'
import { displayCompetition } from '@/lib/competitionLabels'

interface Props {
  fixture: LiveFixture | null
  liveCount: number
  allFixtures: LiveFixture[]
  onSelectBest: () => void
  onOpenDetail?: () => void
}

interface QuickStats { possession?: [number, number]; shots?: [number, number]; onTarget?: [number, number]; corners?: [number, number]; fouls?: [number, number] }
interface PlayerInfo { jersey: string; name: string; starter: boolean }

export function InspectorPanel({ fixture, liveCount, allFixtures, onSelectBest, onOpenDetail }: Props) {

  const [tab, setTab] = useState<'resumo' | 'dados' | 'jogadores'>('resumo')
  const [stats, setStats] = useState<QuickStats | null>(null)
  const [players, setPlayers] = useState<{ home: PlayerInfo[]; away: PlayerInfo[] } | null>(null)

  // Fetch real stats + players from ESPN when fixture selected
  useEffect(() => {
    if (!fixture) { setStats(null); setPlayers(null); return }
    const fetchDetail = async () => {
      try {
        // Try ESPN first
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${fixture.id}`)
        if (!res.ok) return
        const json = await res.json()
        const hS = json.boxscore?.teams?.[0]?.statistics || []
        const aS = json.boxscore?.teams?.[1]?.statistics || []
        const get = (arr: any[], n: string) => { const s = arr.find((x: any) => x.name === n || x.label === n); return s ? parseFloat(s.displayValue) || 0 : undefined }

        const poss = [get(hS, 'possessionPct') || get(hS, 'POSSESSION'), get(aS, 'possessionPct') || get(aS, 'POSSESSION')]
        const shots = [get(hS, 'totalShots') || get(hS, 'SHOTS'), get(aS, 'totalShots') || get(aS, 'SHOTS')]
        const onT = [get(hS, 'shotsOnTarget') || get(hS, 'ON GOAL'), get(aS, 'shotsOnTarget') || get(aS, 'ON GOAL')]
        const cor = [get(hS, 'wonCorners') || get(hS, 'Corner Kicks'), get(aS, 'wonCorners') || get(aS, 'Corner Kicks')]
        const fouls = [get(hS, 'foulsCommitted') || get(hS, 'Fouls'), get(aS, 'foulsCommitted') || get(aS, 'Fouls')]

        // Check if ESPN actually has real data (not all zeros)
        const hasRealStats = (poss[0] && poss[0] > 0) || (shots[0] && shots[0] > 0) || (onT[0] && onT[0] > 0)

        if (hasRealStats) {
          setStats({
            possession: poss[0] !== undefined ? poss as [number, number] : undefined,
            shots: shots[0] !== undefined ? shots as [number, number] : undefined,
            onTarget: onT[0] !== undefined ? onT as [number, number] : undefined,
            corners: cor[0] !== undefined ? cor as [number, number] : undefined,
            fouls: fouls[0] !== undefined ? fouls as [number, number] : undefined,
          })
        } else {
          // ESPN has no stats — try football-data.org via proxy
          try {
            const fdRes = await fetch('/.netlify/functions/football-data-matches')
            if (fdRes.ok) {
              const fdJson = await fdRes.json()
              const matches = fdJson.matches || []
              // Try to find this match by team name similarity
              const fdMatch = matches.find((m: any) =>
                m.homeTeam?.name?.toLowerCase().includes(fixture.homeTeam.name.toLowerCase().split(' ')[0]) ||
                m.awayTeam?.name?.toLowerCase().includes(fixture.awayTeam.name.toLowerCase().split(' ')[0])
              )
              if (fdMatch && fdMatch.score?.fullTime) {
                // football-data doesn't provide live stats, only scores — mark as unavailable
                setStats(null)
              } else {
                setStats(null)
              }
            }
          } catch { setStats(null) }
        }

        // Players
        const hR = (json.rosters?.[0]?.roster || []).map((p: any) => ({ jersey: p.jersey || '', name: p.athlete?.displayName || '', starter: p.starter ?? true }))
        const aR = (json.rosters?.[1]?.roster || []).map((p: any) => ({ jersey: p.jersey || '', name: p.athlete?.displayName || '', starter: p.starter ?? true }))
        setPlayers(hR.length > 0 || aR.length > 0 ? { home: hR, away: aR } : null)
      } catch { /* silent */ }
    }
    fetchDetail()
    const id = setInterval(fetchDetail, 15_000)
    return () => clearInterval(id)
  }, [fixture?.id])

  // No selection
  if (!fixture) {
    const top3 = allFixtures.slice(0, 3)
    return (
      <div className="rounded-[20px] border border-white/[0.05] bg-gradient-to-b from-white/[0.025] to-white/[0.01] p-7 space-y-6">
        <p className="text-[13px] font-semibold text-white/50">Visão geral</p>
        <div className="grid grid-cols-2 gap-3">
          <MM value={liveCount} label="Ao vivo" /><MM value={new Set(allFixtures.map(f => f.league.name)).size} label="Ligas" />
        </div>
        {top3.length > 0 && (
          <div className="space-y-3 pt-3 border-t border-white/[0.04]">
            <p className="text-[12px] font-medium text-white/35">Maior atenção</p>
            {top3.map(fx => (
              <div key={fx.id} className="flex items-center gap-2">
                <ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={18} />
                <span className="text-[12px] text-white/45 truncate flex-1">{fx.homeTeam.name} vs {fx.awayTeam.name}</span>
                <span className="text-[12px] tabular-nums font-bold text-cyan-400/70">{calculateAttention(fx).score}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={onSelectBest} className="w-full h-11 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[13px] font-medium text-white/50 hover:text-white/70 hover:bg-white/[0.05] transition-all">Selecionar mais relevante</button>
      </div>
    )
  }

  const { score: att, level, reasons } = calculateAttention(fixture)
  const el = fixture.status.elapsed
  const levelAccent = { critical: 'text-rose-400', high: 'text-amber-400', medium: 'text-cyan-400', low: 'text-white/40' }
  const levelBar = { critical: 'bg-rose-400', high: 'bg-amber-400', medium: 'bg-cyan-400', low: 'bg-white/15' }
  const levelLabel = { critical: 'Crítica', high: 'Alta', medium: 'Moderada', low: 'Baixa' }

  return (
    <div className="rounded-[20px] border border-white/[0.05] bg-gradient-to-b from-white/[0.025] to-white/[0.01] overflow-hidden flex flex-col">
      {/* Identity */}
      <div className="p-6">
        <p className="text-center text-[12px] text-white/25 mb-5">{displayCompetition(fixture.league.name, fixture.league.country)}</p>
        <div className="flex items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={52} />
            <span className="text-[12px] font-medium text-white/50 text-center max-w-[90px] line-clamp-1">{fixture.homeTeam.name}</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-3">
              <span className="text-[42px] font-bold tabular-nums text-white leading-none">{fixture.score.home ?? 0}</span>
              <span className="text-[16px] text-white/10">:</span>
              <span className="text-[42px] font-bold tabular-nums text-white leading-none">{fixture.score.away ?? 0}</span>
            </div>
            {el && <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/8 border border-emerald-500/12 px-3 py-1 text-[11px] font-semibold text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />{el}'</span>}
          </div>
          <div className="flex flex-col items-center gap-2">
            <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={52} />
            <span className="text-[12px] font-medium text-white/50 text-center max-w-[90px] line-clamp-1">{fixture.awayTeam.name}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pb-4">
        <div className="flex rounded-xl border border-white/[0.05] bg-white/[0.02] p-0.5">
          {(['resumo', 'dados', 'jogadores'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-[11px] font-medium transition-all ${tab === t ? 'bg-white/[0.07] text-white/80' : 'text-white/30 hover:text-white/50'}`}>
              {t === 'resumo' ? 'Resumo' : t === 'dados' ? 'Estatísticas' : 'Elenco'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-5">
        {tab === 'resumo' && (<>
          {/* Insight */}
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-5">
            <p className="text-[14px] text-white/60 leading-relaxed">{genInsight(fixture, att, level, stats)}</p>
          </div>
          {/* Key Points */}
          <div>
            <p className="text-[11px] font-semibold text-white/25 mb-2">Pontos-chave</p>
            <div className="space-y-1.5">
              {genKeyPoints(fixture, stats).map((p, i) => (
                <p key={i} className="text-[12px] text-white/45 flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-cyan-400/40" />{p}</p>
              ))}
            </div>
          </div>
          {/* Attention */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-semibold text-white/30">Atenção</span>
              <span className={`text-[14px] font-bold ${levelAccent[level]}`}>{att} · {levelLabel[level]}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden mb-3"><div className={`h-full rounded-full ${levelBar[level]} transition-all duration-700`} style={{ width: `${att}%` }} /></div>
            <div className="space-y-2">{reasons.slice(0, 4).map((r, i) => <p key={i} className="text-[12px] text-white/40 flex items-center gap-2.5"><span className="w-0.5 h-3 rounded-full bg-white/10" />{r}</p>)}</div>
          </div>
          {/* Confidence */}
          <p className="text-[10px] text-white/20">
            Confiança da leitura: {stats && (stats.possession?.[0] || stats.shots?.[0]) ? 'alta — dados estatísticos completos.' : players ? 'média — placar e escalações disponíveis.' : 'baixa — apenas dados básicos.'}
          </p>
        </>)}

        {tab === 'dados' && (<>
          {stats && (stats.possession?.[0] || stats.shots?.[0] || stats.onTarget?.[0] || stats.corners?.[0]) ? (
            <div className="space-y-5">
              {/* Interpretation */}
              <p className="text-[12px] text-white/45 italic">{buildStatsSummary(fixture.homeTeam.name, fixture.awayTeam.name, stats)}</p>
              {/* Bars */}
              <div className="space-y-4">
                {stats.possession && (stats.possession[0] > 0 || stats.possession[1] > 0) && <StatBar label="Posse" home={stats.possession[0]} away={stats.possession[1]} suffix="%" />}
                {stats.shots && (stats.shots[0] > 0 || stats.shots[1] > 0) && <StatBar label="Finalizações" home={stats.shots[0]} away={stats.shots[1]} />}
                {stats.onTarget && (stats.onTarget[0] > 0 || stats.onTarget[1] > 0) && <StatBar label="No alvo" home={stats.onTarget[0]} away={stats.onTarget[1]} />}
                {stats.corners && (stats.corners[0] > 0 || stats.corners[1] > 0) && <StatBar label="Escanteios" home={stats.corners[0]} away={stats.corners[1]} />}
                {stats.fouls && (stats.fouls[0] > 0 || stats.fouls[1] > 0) && <StatBar label="Faltas" home={stats.fouls[0]} away={stats.fouls[1]} />}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-[14px] text-white/40">Estatísticas indisponíveis</p>
              <p className="text-[12px] text-white/25 mt-2 leading-relaxed">Algumas informações avançadas ainda não estão disponíveis para esta partida.</p>
            </div>
          )}
        </>)}

        {tab === 'jogadores' && (<>
          {players && (players.home.length > 0 || players.away.length > 0) ? (
            <div className="space-y-6">
              <TeamRoster teamName={fixture.homeTeam.name} logo={fixture.homeTeam.logo} players={players.home} />
              <TeamRoster teamName={fixture.awayTeam.name} logo={fixture.awayTeam.logo} players={players.away} />
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-[14px] text-white/40">Elenco indisponível</p>
              <p className="text-[12px] text-white/25 mt-2">Escalações ainda não disponíveis para esta partida.</p>
            </div>
          )}
        </>)}
      </div>

      {/* Actions */}
      <div className="p-5 border-t border-white/[0.04] space-y-2">
        <button onClick={() => onOpenDetail?.()} className="w-full h-12 rounded-xl bg-cyan-500/8 border border-cyan-500/12 text-[13px] font-semibold text-cyan-400 transition-all hover:bg-cyan-500/12">Analisar partida</button>
        <button
          onClick={(e) => {
            const comp = displayCompetition(fixture.league.name, fixture.league.country)
            const t = `${fixture.homeTeam.name} ${fixture.score.home ?? 0}x${fixture.score.away ?? 0} ${fixture.awayTeam.name} · ${comp} · ${el ? el + "'" : fixture.status.short}`
            navigator.clipboard?.writeText(t)
            const btn = e.currentTarget
            btn.textContent = 'Copiado'
            setTimeout(() => { btn.textContent = 'Copiar resumo' }, 1500)
          }}
          className="w-full h-9 rounded-lg border border-white/[0.04] text-[11px] text-white/35 hover:text-white/55 hover:bg-white/[0.02] transition-all"
        >Copiar resumo</button>
      </div>
    </div>
  )
}

function StatBar({ label, home, away, suffix = '' }: { label: string; home: number; away: number; suffix?: string }) {
  const total = home + away || 1
  const pct = (home / total) * 100
  const hLeads = home > away
  const aLeads = away > home
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[14px] font-bold tabular-nums ${hLeads ? 'text-white' : 'text-white/40'}`}>{home}{suffix}</span>
        <span className="text-[11px] text-white/30">{label}</span>
        <span className={`text-[14px] font-bold tabular-nums ${aLeads ? 'text-white' : 'text-white/40'}`}>{away}{suffix}</span>
      </div>
      <div className="flex h-[4px] rounded-full overflow-hidden bg-white/[0.04] gap-[2px]">
        <div className={`${hLeads ? 'bg-white/50' : 'bg-white/25'} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
        <div className={`${aLeads ? 'bg-white/50' : 'bg-white/15'} rounded-full flex-1`} />
      </div>
    </div>
  )
}

function PlayerList({ team, players }: { team: string; players: PlayerInfo[] }) {
  const starters = players.filter(p => p.starter)
  const bench = players.filter(p => !p.starter)
  return (
    <div>
      <p className="text-[12px] font-semibold text-white/40 mb-2">{team}</p>
      <div className="space-y-1">
        {starters.slice(0, 11).map((p, i) => (
          <div key={i} className="flex items-center gap-2.5 py-1">
            <span className="w-6 text-right text-[12px] tabular-nums font-medium text-white/25">{p.jersey}</span>
            <span className="text-[13px] text-white/60">{p.name}</span>
          </div>
        ))}
      </div>
      {bench.length > 0 && (
        <div className="mt-3 pt-2 border-t border-white/[0.03]">
          <p className="text-[10px] text-white/15 mb-1">Banco</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {bench.slice(0, 8).map((p, i) => (
              <span key={i} className="text-[11px] text-white/30">{p.jersey} {p.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function genInsight(fx: LiveFixture, att: number, level: string, stats: QuickStats | null): string {
  const h = fx.homeTeam.name, a = fx.awayTeam.name, sH = fx.score.home ?? 0, sA = fx.score.away ?? 0, el = fx.status.elapsed
  const comp = displayCompetition(fx.league.name, fx.league.country)

  let t = sH === sA ? `${h} e ${a} empatam em ${sH}x${sA}` : `${sH > sA ? h : a} vence por ${Math.max(sH, sA)}x${Math.min(sH, sA)}`
  if (comp) t += ` pela ${comp}`
  t += el ? ` aos ${el} minutos.` : '.'

  // Add stats context if available
  if (stats && stats.possession && (stats.possession[0] > 0 || stats.possession[1] > 0)) {
    const dominant = stats.possession[0] > stats.possession[1] ? h : a
    const diff = Math.abs(stats.possession[0] - stats.possession[1])
    if (diff > 15) t += ` ${dominant} domina com ${Math.max(stats.possession[0], stats.possession[1]).toFixed(0)}% de posse.`
    if (stats.shots && (stats.shots[0] + stats.shots[1]) >= 12) {
      t += ` Jogo aberto com ${stats.shots[0] + stats.shots[1]} finalizações.`
    }
  } else {
    t += ' Estatísticas detalhadas indisponíveis no radar.'
  }

  return t
}

function genKeyPoints(fx: LiveFixture, stats: QuickStats | null): string[] {
  const points: string[] = []
  const el = fx.status.elapsed || 0
  const sH = fx.score.home ?? 0, sA = fx.score.away ?? 0, total = sH + sA

  if (el > 45) points.push('Segundo tempo em andamento')
  if (el >= 75) points.push('Partida em fase final')
  if (sH === sA && total > 0) points.push('Empate com gols')
  if (total >= 3) points.push('Placar movimentado')
  if (Math.abs(sH - sA) === 1) points.push('Diferença mínima no placar')

  if (stats) {
    const totalShots = (stats.shots?.[0] || 0) + (stats.shots?.[1] || 0)
    const totalOT = (stats.onTarget?.[0] || 0) + (stats.onTarget?.[1] || 0)
    const totalCorners = (stats.corners?.[0] || 0) + (stats.corners?.[1] || 0)
    if (totalShots >= 15) points.push(`${totalShots} finalizações combinadas`)
    if (totalOT >= 6) points.push(`${totalOT} finalizações no alvo`)
    if (totalCorners >= 7) points.push(`${totalCorners} escanteios no jogo`)
    if (stats.possession && (stats.possession[0] > 0 || stats.possession[1] > 0)) points.push('Dados estatísticos disponíveis')
  } else {
    points.push('Estatísticas indisponíveis no radar')
  }

  return points.slice(0, 4)
}

function TeamRoster({ teamName, logo, players }: { teamName: string; logo: string | null; players: PlayerInfo[] }) {
  const starters = players.filter(p => p.starter)
  const bench = players.filter(p => !p.starter)
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-4">
      <div className="flex items-center gap-2 mb-3">
        <ClubLogo src={logo} name={teamName} size={18} />
        <span className="text-[12px] font-semibold text-white/45">{teamName}</span>
        <span className="ml-auto text-[10px] text-white/20">{starters.length} titulares</span>
      </div>
      <div className="space-y-0.5">
        {starters.slice(0, 11).map((p, i) => (
          <div key={i} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-white/[0.02]">
            <span className="w-5 text-right text-[11px] tabular-nums font-mono text-white/20">{p.jersey}</span>
            <span className="text-[12px] text-white/60">{p.name}</span>
          </div>
        ))}
      </div>
      {bench.length > 0 && (
        <div className="mt-3 pt-2 border-t border-white/[0.03]">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-white/15 mb-1.5">Banco</p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            {bench.slice(0, 10).map((p, i) => (
              <span key={i} className="text-[10px] text-white/25 truncate">{p.jersey} {p.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MM({ value, label }: { value: number; label: string }) {
  return <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-4 text-center"><span className="text-[20px] font-bold tabular-nums text-white/65">{value}</span><p className="text-[11px] text-white/25 mt-1">{label}</p></div>
}

function buildStatsSummary(home: string, away: string, stats: QuickStats): string {
  const insights: string[] = []
  if (stats.possession) {
    const diff = Math.abs(stats.possession[0] - stats.possession[1])
    if (diff > 12) {
      const dom = stats.possession[0] > stats.possession[1] ? home : away
      insights.push(`${dom} domina a posse`)
    }
  }
  if (stats.shots) {
    const total = stats.shots[0] + stats.shots[1]
    if (total >= 15) insights.push('jogo com alto volume ofensivo')
    const diff = stats.shots[0] - stats.shots[1]
    if (Math.abs(diff) >= 5) {
      const dom = diff > 0 ? home : away
      insights.push(`${dom} mais perigoso nas finalizações`)
    }
  }
  if (stats.corners) {
    const total = stats.corners[0] + stats.corners[1]
    if (total >= 8) insights.push('muitos escanteios')
  }
  if (insights.length === 0) return 'Estatísticas equilibradas até o momento.'
  return insights.slice(0, 2).join(', ').replace(/^./, s => s.toUpperCase()) + '.'
}

function SourceItem({ name, status, desc, active, limited }: { name: string; status: string; desc: string; active?: boolean; limited?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.03] bg-white/[0.01] p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-medium text-white/55">{name}</span>
        <span className={`text-[10px] font-medium ${active ? 'text-emerald-400/70' : limited ? 'text-amber-400/60' : 'text-white/20'}`}>{status}</span>
      </div>
      <p className="text-[10px] text-white/25">{desc}</p>
    </div>
  )
}
