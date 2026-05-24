/**
 * Inline match detail view for Live Radar.
 * Shows full match data (stats, events, pressure, lineups, narration)
 * without navigating to /app/matches/:id.
 * Receives the fixture directly — no routing dependencies.
 */
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { ClubLogo } from '@/components/ui/ClubLogo'
import { LoadingState } from '@/components/ui/LoadingState'
import { FavoriteButton } from '@/components/ui/FavoriteButton'
import { DataCoverageBadge, getMatchCoverage } from '@/components/ui/DataCoverageBadge'
import { useFavorites } from '@/context/FavoritesContext'
import { useViewMode } from '@/context/ViewModeContext'
import { buildCanonicalMatchId } from '@/features/providers/canonicalMatchId'
import { isSameMatchStrict } from '@/features/providers/isSameMatchStrict'
import type { LiveFixture } from '@/lib/apiClient'
import { calculateMatchIntelligence } from '@/services/intelligence/matchIntelligence'
import { buildExecutiveRead } from '@/services/intelligence/buildExecutiveRead'
import { normalizeEvents } from '@/features/matches/normalizeMatchEvents'
import { buildPlayerEventMap, getBadgesForPlayer, getBadgeStyle } from '@/features/matches/buildPlayerEventMap'
import { LivePressureGraph } from '@/components/matches/LivePressureGraph'

interface MatchData {
  home: { name: string; logo: string | null; score: number; color: string; colors: string[] }
  away: { name: string; logo: string | null; score: number; color: string; colors: string[] }
  league: string; leagueLogo: string | null; status: string; elapsed: number | null; isLive: boolean; venue: string | null
  stats: { label: string; home: string; away: string }[]
  events: { clock: string; text: string; type: string; team: string }[]
  commentary: { clock: string; text: string }[]
}

interface Props {
  fixture: LiveFixture
  onBack: () => void
}

export function LiveMatchDetailView({ fixture, onBack }: Props) {
  const [data, setData] = useState<MatchData | null>(null)
  const [loading, setLoading] = useState(true)
  const { isFavoriteTeam, toggleFavoriteTeam, isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const { isAdvanced } = useViewMode()
  const matchId = buildCanonicalMatchId(fixture.homeTeam.name, fixture.awayTeam.name, fixture.date)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const expectedHome = fixture.homeTeam.name
    const expectedAway = fixture.awayTeam.name

    try {
      // Try ESPN scoreboard search by name
      const espnData = await searchEspnForMatch(expectedHome, expectedAway)
      if (espnData) { setData(espnData); return }

      // Try API-Football live
      const apiData = await searchApiFootballForMatch(expectedHome, expectedAway)
      if (apiData) { setData(apiData); return }

      // Fallback: show basic data from the fixture itself
      setData({
        home: { name: expectedHome, logo: fixture.homeTeam.logo, score: fixture.score.home ?? 0, color: '22d3ee', colors: ['22d3ee', '1a1a2e'] },
        away: { name: expectedAway, logo: fixture.awayTeam.logo, score: fixture.score.away ?? 0, color: '34d399', colors: ['34d399', '1a1a2e'] },
        league: fixture.league.name, leagueLogo: fixture.league.logo,
        status: fixture.status.long || '', elapsed: fixture.status.elapsed,
        isLive: fixture.status.short === 'LIVE' || fixture.status.short === 'HT',
        venue: fixture.venue, stats: [], events: [], commentary: [],
      })
    } catch {
      // Fallback
      setData({
        home: { name: expectedHome, logo: fixture.homeTeam.logo, score: fixture.score.home ?? 0, color: '22d3ee', colors: ['22d3ee', '1a1a2e'] },
        away: { name: expectedAway, logo: fixture.awayTeam.logo, score: fixture.score.away ?? 0, color: '34d399', colors: ['34d399', '1a1a2e'] },
        league: fixture.league.name, leagueLogo: fixture.league.logo,
        status: fixture.status.long || '', elapsed: fixture.status.elapsed,
        isLive: fixture.status.short === 'LIVE' || fixture.status.short === 'HT',
        venue: fixture.venue, stats: [], events: [], commentary: [],
      })
    } finally { setLoading(false) }
  }, [fixture])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    if (!data?.isLive) return
    const id = setInterval(() => fetchData(true), 20_000)
    return () => clearInterval(id)
  }, [data?.isLive, fetchData])

  if (loading) return (
    <div className="space-y-4 animate-fadeIn">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60"><ArrowLeft size={14} /> Voltar ao Ao vivo</button>
      <div className="flex items-center justify-center min-h-[40vh]"><LoadingState message="" /></div>
    </div>
  )

  if (!data) return (
    <div className="space-y-4 animate-fadeIn">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60"><ArrowLeft size={14} /> Voltar ao Ao vivo</button>
      <p className="text-[13px] text-white/40 text-center py-12">Dados indisponíveis</p>
    </div>
  )

  const { home, away, league, leagueLogo, status, elapsed, isLive, venue, stats, events, commentary } = data
  const getStat = (name: string) => { const s = stats.find(x => x.label.toLowerCase().includes(name.toLowerCase())); return s ? { home: parseFloat(s.home) || 0, away: parseFloat(s.away) || 0 } : undefined }

  const execRead = buildExecutiveRead({
    homeName: home.name, awayName: away.name, homeScore: home.score, awayScore: away.score,
    elapsed, isLive, isScheduled: !isLive && !elapsed && home.score === 0 && away.score === 0 && stats.length === 0,
    possession: getStat('possession'), shots: getStat('shots') || getStat('totalShots'),
    shotsOnTarget: getStat('on goal') || getStat('shotsOnTarget'), corners: getStat('corner'),
    hasStats: stats.length > 0, hasEvents: events.length > 0, hasLineups: false, hasNarration: commentary.length > 0,
  })

  const coverage = getMatchCoverage({ hasStats: stats.length > 0, hasEvents: events.length > 0, hasLineups: false, hasNarration: commentary.length > 0, hasLogos: Boolean(home.logo && away.logo) })

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fadeIn">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60 transition-colors"><ArrowLeft size={14} /> Voltar ao Ao vivo</button>
        <div className="flex items-center gap-2">
          <FavoriteButton active={isFavoriteMatch(matchId)} onClick={() => toggleFavoriteMatch({ canonicalMatchId: matchId, homeTeam: home.name, awayTeam: away.name, competition: league, utcDate: fixture.date })} size={14} />
          <DataCoverageBadge coverage={coverage} />
          <button onClick={() => fetchData(true)} className="p-2 rounded-full text-white/20 hover:text-white/50 hover:bg-white/[0.03]"><RefreshCw size={13} /></button>
        </div>
      </div>

      {/* Hero */}
      <section className="relative rounded-[28px] border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-7 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[350px] h-[180px] bg-cyan-500/[0.02] rounded-full blur-[80px]" />
        <div className="relative">
          <div className="flex items-center justify-center gap-2 mb-4">
            {leagueLogo && <img src={leagueLogo} alt="" className="h-4 w-4 opacity-40" />}
            <span className="text-[11px] text-white/30">{league}</span>
          </div>
          <div className="flex items-center justify-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <ClubLogo src={home.logo} name={home.name} size={64} />
              <span className="text-[12px] font-semibold text-white text-center max-w-[120px]">{home.name}</span>
              <FavoriteButton active={isFavoriteTeam(home.name)} onClick={() => toggleFavoriteTeam({ name: home.name, logo: home.logo })} size={12} />
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-baseline gap-3">
                <span className="text-[48px] font-bold tabular-nums text-white leading-none">{home.score}</span>
                <span className="text-[18px] text-white/10">:</span>
                <span className="text-[48px] font-bold tabular-nums text-white leading-none">{away.score}</span>
              </div>
              {isLive && <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /><span className="text-[12px] font-semibold text-emerald-400">{elapsed ? `${elapsed}'` : 'Ao vivo'}</span></div>}
              {!isLive && status && <span className="text-[10px] text-white/25">{status}</span>}
            </div>
            <div className="flex flex-col items-center gap-2">
              <ClubLogo src={away.logo} name={away.name} size={64} />
              <span className="text-[12px] font-semibold text-white text-center max-w-[120px]">{away.name}</span>
              <FavoriteButton active={isFavoriteTeam(away.name)} onClick={() => toggleFavoriteTeam({ name: away.name, logo: away.logo })} size={12} />
            </div>
          </div>
          {stats.length > 0 && (
            <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-white/40 font-medium">
              {getStat('possession') && <span>Posse {getStat('possession')!.home.toFixed(0)}%-{getStat('possession')!.away.toFixed(0)}%</span>}
              {getStat('shots') && <span>Fin. {getStat('shots')!.home}-{getStat('shots')!.away}</span>}
            </div>
          )}
          {venue && <p className="text-center text-[9px] text-white/10 mt-2">{venue}</p>}
        </div>
      </section>

      {/* Executive Read */}
      <section className="rounded-[24px] border border-white/[0.04] bg-white/[0.02] p-5">
        <h2 className="text-[13px] font-bold text-white/70 mb-2">{execRead.title}</h2>
        <p className="text-[12px] text-white/50 leading-relaxed">{execRead.summary}</p>
        {execRead.bullets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {execRead.bullets.map((b, i) => <span key={i} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1 text-[10px] text-white/40">{b}</span>)}
          </div>
        )}
      </section>

      {/* Pressure Graph */}
      {events.length > 0 && (
        <LivePressureGraph events={events} commentary={commentary} homeName={home.name} awayName={away.name} elapsed={elapsed} homeColors={home.colors} awayColors={away.colors} />
      )}

      {/* Stats */}
      {stats.length > 0 && (
        <section className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/25 mb-4">Estatísticas</h3>
          <div className="space-y-3">
            {stats.filter(s => (parseFloat(s.home) || 0) > 0 || (parseFloat(s.away) || 0) > 0).map(s => {
              const h = parseFloat(s.home) || 0, a = parseFloat(s.away) || 0, t = h + a || 1
              return (
                <div key={s.label} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-[12px] font-bold tabular-nums ${h > a ? 'text-white' : 'text-white/50'}`}>{s.home}</span>
                    <span className="text-[10px] text-white/30">{s.label}</span>
                    <span className={`text-[12px] font-bold tabular-nums ${a > h ? 'text-white' : 'text-white/50'}`}>{s.away}</span>
                  </div>
                  <div className="flex h-[3px] rounded-full overflow-hidden bg-white/[0.04] gap-[1px]">
                    <div className="bg-white/50 rounded-full transition-all duration-700" style={{ width: `${(h / t) * 100}%` }} />
                    <div className="bg-white/15 rounded-full flex-1" />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Events Timeline */}
      {events.length > 0 && (
        <section className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/25 mb-3">Eventos</h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {normalizeEvents(events).filter(e => e.type !== 'other' && e.type !== 'period_start' && e.type !== 'period_end').map((ev, i) => (
              <div key={i} className="flex items-start gap-3 py-1.5">
                <span className="text-[11px] font-bold tabular-nums text-white/35 w-7 text-right shrink-0">{ev.minute}'</span>
                <div>
                  <span className={`text-[11px] font-semibold ${ev.type === 'goal' ? 'text-emerald-400' : ev.type === 'red_card' ? 'text-rose-400' : ev.type === 'yellow_card' ? 'text-amber-400' : 'text-white/55'}`}>{ev.title}</span>
                  {ev.playerName && <span className="text-[10px] text-white/35 ml-2">{ev.playerName}</span>}
                  {ev.teamName && <span className="text-[9px] text-white/20 ml-2">({ev.teamName})</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Commentary */}
      {commentary.length > 0 && (
        <section className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/25 mb-3">Narração</h3>
          <div className="max-h-[300px] overflow-y-auto space-y-1.5">
            {commentary.slice(-30).map((c, i) => (
              <div key={i} className="flex gap-2.5 py-1">
                <span className="w-6 shrink-0 text-right text-[9px] tabular-nums text-emerald-400/50">{c.clock}</span>
                <span className="text-[10px] text-white/45 leading-relaxed">{c.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Coverage detail (advanced) */}
      {isAdvanced && (
        <div className="flex items-center gap-3 text-[9px] text-white/20">
          <span>{stats.length > 0 ? '✓ Estatísticas' : '✗ Estatísticas'}</span>
          <span>{events.length > 0 ? '✓ Eventos' : '✗ Eventos'}</span>
          <span>{commentary.length > 0 ? '✓ Narração' : '✗ Narração'}</span>
          <span>Provider: {fixture.provider}</span>
        </div>
      )}
    </div>
  )
}

// ─── Data fetching (no routing dependency) ───────────────────────────────────

async function searchEspnForMatch(expectedHome: string, expectedAway: string): Promise<MatchData | null> {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard')
    if (!res.ok) return null
    const json = await res.json()

    for (const event of (json.events || [])) {
      const comp = event.competitions?.[0]
      if (!comp?.competitors || comp.competitors.length < 2) continue
      const h = comp.competitors.find((c: any) => c.homeAway === 'home')
      const a = comp.competitors.find((c: any) => c.homeAway === 'away')
      const eName = h?.team?.displayName || ''
      const aName = a?.team?.displayName || ''

      if (!isSameMatchStrict({ homeName: expectedHome, awayName: expectedAway }, { homeName: eName, awayName: aName })) {
        const eShort = h?.team?.shortDisplayName || ''
        const aShort = a?.team?.shortDisplayName || ''
        if (!eShort || !aShort || !isSameMatchStrict({ homeName: expectedHome, awayName: expectedAway }, { homeName: eShort, awayName: aShort })) continue
      }

      // Found — fetch summary
      const sumRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${event.id}`)
      if (!sumRes.ok) continue
      const sumJson = await sumRes.json()
      return parseEspnToMatchData(sumJson)
    }
    return null
  } catch { return null }
}

async function searchApiFootballForMatch(expectedHome: string, expectedAway: string): Promise<MatchData | null> {
  try {
    const res = await fetch('/.netlify/functions/api-football-live')
    if (!res.ok) return null
    const json = await res.json()
    const fixtures = json.response || []

    for (const item of fixtures) {
      const homeName = item.teams?.home?.name || ''
      const awayName = item.teams?.away?.name || ''
      if (!isSameMatchStrict({ homeName: expectedHome, awayName: expectedAway }, { homeName, awayName })) continue

      const stats: { label: string; home: string; away: string }[] = []
      const homeS = item.statistics?.[0]?.statistics || []
      const awayS = item.statistics?.[1]?.statistics || []
      for (const s of homeS) {
        const away = awayS.find((x: any) => x.type === s.type)
        if (s.value !== null || away?.value !== null) stats.push({ label: s.type || '', home: String(s.value ?? 0), away: String(away?.value ?? 0) })
      }

      const events = (item.events || []).map((ev: any) => ({
        clock: String(ev.time?.elapsed || ''), text: `${ev.type || ''} - ${ev.player?.name || ''} ${ev.detail || ''}`.trim(),
        type: ev.type || '', team: ev.team?.name || '',
      }))

      return {
        home: { name: homeName, logo: item.teams?.home?.logo || null, score: item.goals?.home ?? 0, color: '22d3ee', colors: ['22d3ee', '1a1a2e'] },
        away: { name: awayName, logo: item.teams?.away?.logo || null, score: item.goals?.away ?? 0, color: '34d399', colors: ['34d399', '1a1a2e'] },
        league: item.league?.name || '', leagueLogo: null,
        status: item.fixture?.status?.long || '', elapsed: item.fixture?.status?.elapsed || null,
        isLive: ['1H', '2H', 'HT', 'ET', 'P'].includes(item.fixture?.status?.short || ''),
        venue: item.fixture?.venue?.name || null, stats, events, commentary: [],
      }
    }
    return null
  } catch { return null }
}

function parseEspnToMatchData(json: any): MatchData {
  const comp = json.header?.competitions?.[0]
  const h = comp?.competitors?.find((c: any) => c.homeAway === 'home')
  const a = comp?.competitors?.find((c: any) => c.homeAway === 'away')
  const homeBox = json.boxscore?.teams?.[0]?.statistics || []
  const awayBox = json.boxscore?.teams?.[1]?.statistics || []
  const elapsed = comp?.status?.displayClock?.match(/(\d+)/)?.[1]

  return {
    home: { name: h?.team?.displayName || '', logo: h?.team?.logos?.[0]?.href || h?.team?.logo || null, score: parseInt(h?.score) || 0, color: '22d3ee', colors: ['22d3ee', '1a1a2e'] },
    away: { name: a?.team?.displayName || '', logo: a?.team?.logos?.[0]?.href || a?.team?.logo || null, score: parseInt(a?.score) || 0, color: '34d399', colors: ['34d399', '1a1a2e'] },
    league: json.header?.league?.name || '', leagueLogo: json.header?.league?.logos?.[0]?.href || null,
    status: comp?.status?.type?.description || '', elapsed: elapsed ? parseInt(elapsed) : null,
    isLive: comp?.status?.type?.state === 'in', venue: json.gameInfo?.venue?.fullName || null,
    stats: homeBox.map((s: any, i: number) => ({ label: s.label || s.name, home: s.displayValue || '0', away: awayBox[i]?.displayValue || '0' })),
    events: (json.keyEvents || []).map((ev: any) => ({ clock: ev.clock?.displayValue || '', text: ev.text || ev.shortText || '', type: ev.type?.text || '', team: ev.team?.displayName || '' })),
    commentary: (json.commentary || []).map((c: any) => ({ clock: c.time?.displayValue || c.clock?.displayValue || '', text: c.text || '' })),
  }
}
