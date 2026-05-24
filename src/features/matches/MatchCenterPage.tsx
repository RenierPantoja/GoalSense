import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Circle, Square, ArrowRightLeft, Target, Flag } from 'lucide-react'
import { ClubLogo } from '@/components/ui/ClubLogo'
import { LoadingState } from '@/components/ui/LoadingState'
import { FavoriteButton } from '@/components/ui/FavoriteButton'
import { DataCoverageBadge, getMatchCoverage } from '@/components/ui/DataCoverageBadge'
import { useFavorites } from '@/context/FavoritesContext'
import { useViewMode } from '@/context/ViewModeContext'
import { buildCanonicalMatchId } from '@/features/providers/canonicalMatchId'
import { isScheduledMatch, isFinishedMatch } from '@/utils/matchStatus'
import type { LiveFixture } from '@/lib/apiClient'
import { retrieveStoredFixture } from '@/lib/matchNavigation'
import { isSameMatchStrict } from '@/features/providers/isSameMatchStrict'
import { calculateMatchIntelligence, type MetricResult } from '@/services/intelligence/matchIntelligence'
import { buildExecutiveRead } from '@/services/intelligence/buildExecutiveRead'
import { translateNarration, sanitizeFinalPortugueseText } from '@/features/matches/translateMatchNarration'
import { normalizeEvents } from '@/features/matches/normalizeMatchEvents'
import { buildPlayerEventMap, getBadgesForPlayer, getBadgeStyle } from '@/features/matches/buildPlayerEventMap'
import { MatchStoryline, PlayerImpactPanel, DangerousAttackPanel, StatsInsightHeader } from '@/features/matches/matchSections'
import { LivePressureGraph } from '@/components/matches/LivePressureGraph'
import { MatchHighlightsSection } from '@/features/matches/highlights/MatchHighlightsSection'
import { PreMatchIntelligencePanel } from '@/features/match-detail/PreMatchIntelligencePanel'
import { PostMatchIntelligencePanel } from '@/features/match-detail/PostMatchIntelligencePanel'

interface MatchData {
  home: { name: string; logo: string | null; score: number; color: string; colors: string[] }
  away: { name: string; logo: string | null; score: number; color: string; colors: string[] }
  league: string; leagueLogo: string | null; status: string; elapsed: number | null; isLive: boolean; venue: string | null
  stats: { label: string; home: string; away: string }[]
  events: { clock: string; text: string; type: string; team: string }[]
  commentary: { clock: string; text: string }[]
  homeRoster: Player[]; awayRoster: Player[]
}
interface Player { jersey: string; name: string; starter: boolean; goal?: boolean; yellowCard?: boolean; redCard?: boolean; subbed?: boolean }

type NarrationFilter = 'important' | 'all' | 'goals' | 'cards' | 'subs' | 'shots'

interface MatchCenterProps {
  inlineFixture?: LiveFixture
  onBack?: () => void
}

export function MatchCenterPage({ inlineFixture, onBack }: MatchCenterProps = {}) {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const location = useLocation()
  // Read fixture state: prop > location.state > sessionStorage
  const fixtureState = useMemo(() => {
    if (inlineFixture) return inlineFixture
    const fromState = (location.state as any)?.fixture as LiveFixture | undefined
    if (fromState) return fromState
    return retrieveStoredFixture() || undefined
  }, [location.state, inlineFixture])
  const effectiveFixtureId = inlineFixture ? String(inlineFixture.id) : fixtureId
  const [data, setData] = useState<MatchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [narFilter, setNarFilter] = useState<NarrationFilter>('important')
  const narRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async (silent = false) => {
    if (!effectiveFixtureId) return
    if (!silent) setLoading(true)
    try {
      const expectedHome = fixtureState?.homeTeam?.name || ''
      const expectedAway = fixtureState?.awayTeam?.name || ''

      // ===========================================================
      // STRATEGY: Show the correct match immediately from fixtureState,
      // then try to enrich with provider data. NEVER show wrong match.
      // Only use ESPN by ID if provider is ESPN. Always validate by name.
      // ===========================================================

      // If no expected names, we cannot validate anything — use fallback only
      if (!expectedHome || !expectedAway) {
        if (fixtureState) { setData(buildFallbackData(fixtureState)); setError(null); return }
        setError('Detalhes indisponíveis para esta partida.')
        return
      }

      const isEspnFixture = fixtureState?.provider === 'espn'

      // Attempt 1: Try ESPN summary by route ID — ONLY if fixture is from ESPN
      if (isEspnFixture) {
        const summaryData = await tryEspnSummary(effectiveFixtureId, expectedHome, expectedAway)
        if (summaryData) { setData(summaryData); setError(null); return }
      }

      // Attempt 2: Search ESPN by team names (works for all providers, returns full data)
      const searchData = await searchEspnScoreboard(expectedHome, expectedAway)
      if (searchData) { setData(searchData); setError(null); return }

      // Attempt 3: Try provider-specific data (non-ESPN or ESPN failed)
      const apiData = await tryApiFootballLive(expectedHome, expectedAway)
      if (apiData) { setData(apiData); setError(null); return }

      if (fixtureState?.provider === 'football_data' && effectiveFixtureId) {
        const fdData = await tryFootballDataDetail(effectiveFixtureId, expectedHome, expectedAway)
        if (fdData) { setData(fdData); setError(null); return }
      }

      const fptData = await tryFutPythonTrader(expectedHome, expectedAway)
      if (fptData) { setData(fptData); setError(null); return }

      // Attempt 4: Safe fallback — always shows the correct match
      if (fixtureState) {
        setData(buildFallbackData(fixtureState))
        setError(null)
        return
      }

      setError('Detalhes indisponíveis para esta partida.')
    } catch (err) { setError((err as Error).message) }
    finally { setLoading(false) }
  }, [effectiveFixtureId, fixtureState])

  function buildFallbackData(fs: LiveFixture): MatchData {
    return {
      home: { name: fs.homeTeam.name, logo: fs.homeTeam.logo, score: fs.score.home ?? 0, color: '22d3ee', colors: ['22d3ee', '1a1a2e'] },
      away: { name: fs.awayTeam.name, logo: fs.awayTeam.logo, score: fs.score.away ?? 0, color: '34d399', colors: ['34d399', '1a1a2e'] },
      league: fs.league.name, leagueLogo: fs.league.logo,
      status: fs.status.long || '', elapsed: fs.status.elapsed,
      isLive: fs.status.short === 'LIVE' || fs.status.short === 'HT',
      venue: fs.venue, stats: [], events: [], commentary: [], homeRoster: [], awayRoster: [],
    }
  }

  /** Try ESPN summary by event ID. Returns null if teams don't match expected. */
  async function tryEspnSummary(eventId: string, expectedHome: string, expectedAway: string): Promise<MatchData | null> {
    // CRITICAL: Only attempt if we have expected names to validate against
    if (!expectedHome || !expectedAway) return null

    try {
      // Only try the /all endpoint — league-specific endpoints can return different events for the same ID
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${eventId}`
      const res = await fetch(url)
      if (!res.ok) return null
      const json = await res.json()
      const comp = json.header?.competitions?.[0]
      if (!comp?.competitors || comp.competitors.length < 2) return null

      const espnHome = comp.competitors.find((c: any) => c.homeAway === 'home')?.team?.displayName || ''
      const espnAway = comp.competitors.find((c: any) => c.homeAway === 'away')?.team?.displayName || ''

      // STRICT VALIDATION: both teams must match
      if (!isSameMatchStrict({ homeName: expectedHome, awayName: expectedAway }, { homeName: espnHome, awayName: espnAway })) {
        if (import.meta.env.DEV) console.warn('[match-detail] ESPN ID mismatch:', { expected: `${expectedHome} x ${expectedAway}`, got: `${espnHome} x ${espnAway}`, eventId })
        return null
      }

      return parseEspn(json)
    } catch { return null }
  }

  /** Search ESPN scoreboard for a match by team names. */
  async function searchEspnScoreboard(expectedHome: string, expectedAway: string): Promise<MatchData | null> {
    try {
      // Use our ESPN function with today's date to include finished matches
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
      const res = await fetch(`/api/espn-live?date=${today}`)
      if (!res.ok) return null
      const json = await res.json()
      const fixtures = json.fixtures || []

      // Find the match by name
      for (const fx of fixtures) {
        const eName = fx.homeTeam?.name || ''
        const aName = fx.awayTeam?.name || ''
        if (!isSameMatchStrict({ homeName: expectedHome, awayName: expectedAway }, { homeName: eName, awayName: aName })) continue

        // Found! Get full ESPN summary for rich data
        const sumRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${fx.id}`)
        if (!sumRes.ok) continue
        const sumJson = await sumRes.json()
        const sumComp = sumJson.header?.competitions?.[0]
        if (!sumComp?.competitors || sumComp.competitors.length < 2) continue

        const sumHome = sumComp.competitors.find((c: any) => c.homeAway === 'home')?.team?.displayName || ''
        const sumAway = sumComp.competitors.find((c: any) => c.homeAway === 'away')?.team?.displayName || ''

        // Final validation
        if (isSameMatchStrict({ homeName: expectedHome, awayName: expectedAway }, { homeName: sumHome, awayName: sumAway })) {
          return parseEspn(sumJson)
        }
      }
      return null
    } catch { return null }
  }

  /** Try FutPythonTrader for match stats (footystats/bet365) */
  async function tryFutPythonTrader(expectedHome: string, expectedAway: string): Promise<MatchData | null> {
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch(`/api/misc?fn=futpythontrader-today&date=${today}&source=footystats`)
      if (!res.ok) return null
      const json = await res.json()
      const matches = json.matches || []

      for (const m of matches) {
        const homeName = m.home_name || m.homeTeam || m.Home || ''
        const awayName = m.away_name || m.awayTeam || m.Away || ''
        if (!homeName || !awayName) continue
        if (!isSameMatchStrict({ homeName: expectedHome, awayName: expectedAway }, { homeName, awayName })) continue

        // Found! Extract available stats
        const stats: { label: string; home: string; away: string }[] = []
        const statFields = [
          ['Posse de Bola', 'home_possession', 'away_possession'],
          ['Finalizações', 'home_shots', 'away_shots'],
          ['No Alvo', 'home_shots_on_target', 'away_shots_on_target'],
          ['Escanteios', 'home_corners', 'away_corners'],
          ['Faltas', 'home_fouls', 'away_fouls'],
          ['Cartões Amarelos', 'home_yellow_cards', 'away_yellow_cards'],
          ['Cartões Vermelhos', 'home_red_cards', 'away_red_cards'],
          ['Impedimentos', 'home_offsides', 'away_offsides'],
        ]
        for (const [label, hKey, aKey] of statFields) {
          const hVal = m[hKey] ?? m[hKey.replace('home_', 'ht_')] ?? null
          const aVal = m[aKey] ?? m[aKey.replace('away_', 'at_')] ?? null
          if (hVal !== null || aVal !== null) {
            stats.push({ label, home: String(hVal ?? 0), away: String(aVal ?? 0) })
          }
        }

        const homeScore = m.home_score ?? m.homeGoals ?? m.FTHG ?? 0
        const awayScore = m.away_score ?? m.awayGoals ?? m.FTAG ?? 0
        const status = m.status || (m.is_live ? 'Ao vivo' : '')

        // Use logos from fixtureState if available
        const homeLogo = fixtureState?.homeTeam?.logo || null
        const awayLogo = fixtureState?.awayTeam?.logo || null

        return {
          home: { name: homeName, logo: homeLogo, score: homeScore, color: '22d3ee', colors: ['22d3ee', '1a1a2e'] },
          away: { name: awayName, logo: awayLogo, score: awayScore, color: '34d399', colors: ['34d399', '1a1a2e'] },
          league: m.league || m.League || fixtureState?.league.name || '', leagueLogo: fixtureState?.league.logo || null,
          status: status || fixtureState?.status.long || '',
          elapsed: fixtureState?.status.elapsed || null,
          isLive: Boolean(m.is_live) || fixtureState?.status.short === 'LIVE',
          venue: m.venue || null,
          stats, events: [], commentary: [], homeRoster: [], awayRoster: [],
        }
      }
      return null
    } catch { return null }
  }

  /** Try football-data.org match detail endpoint */
  async function tryFootballDataDetail(matchId: string, expectedHome: string, expectedAway: string): Promise<MatchData | null> {
    try {
      const res = await fetch(`/api/football-data-matches?matchId=${matchId}`)
      if (!res.ok) return null
      const json = await res.json()

      // The endpoint may return a single match or a list
      const match = json.match || json

      if (!match.homeTeam || !match.awayTeam) return null

      const homeName = match.homeTeam.shortName || match.homeTeam.name || ''
      const awayName = match.awayTeam.shortName || match.awayTeam.name || ''

      // Validate
      if (expectedHome && expectedAway && !isSameMatchStrict({ homeName: expectedHome, awayName: expectedAway }, { homeName, awayName })) {
        return null
      }

      // Extract stats from match statistics if available
      const stats: { label: string; home: string; away: string }[] = []
      if (match.statistics) {
        for (const stat of match.statistics) {
          if (stat.type && (stat.home !== null || stat.away !== null)) {
            stats.push({ label: stat.type, home: String(stat.home ?? 0), away: String(stat.away ?? 0) })
          }
        }
      }

      // Extract goals/events
      const events: { clock: string; text: string; type: string; team: string }[] = []
      if (match.goals) {
        for (const goal of match.goals) {
          events.push({
            clock: String(goal.minute || ''),
            text: `Goal - ${goal.scorer?.name || 'Unknown'}${goal.assist?.name ? ` (assist: ${goal.assist.name})` : ''}`,
            type: 'Goal',
            team: goal.team?.name || '',
          })
        }
      }
      if (match.bookings) {
        for (const b of match.bookings) {
          events.push({
            clock: String(b.minute || ''),
            text: `${b.card === 'RED' ? 'Red Card' : 'Yellow Card'} - ${b.player?.name || ''}`,
            type: b.card === 'RED' ? 'Red Card' : 'Yellow Card',
            team: b.team?.name || '',
          })
        }
      }
      if (match.substitutions) {
        for (const s of match.substitutions) {
          events.push({
            clock: String(s.minute || ''),
            text: `Substitution - ${s.playerIn?.name || ''} replaces ${s.playerOut?.name || ''}`,
            type: 'Substitution',
            team: s.team?.name || '',
          })
        }
      }

      const elapsed = match.minute || match.status === 'IN_PLAY' ? 45 : null

      return {
        home: { name: homeName, logo: match.homeTeam.crest || null, score: match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? 0, color: '22d3ee', colors: ['22d3ee', '1a1a2e'] },
        away: { name: awayName, logo: match.awayTeam.crest || null, score: match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? 0, color: '34d399', colors: ['34d399', '1a1a2e'] },
        league: match.competition?.name || '', leagueLogo: match.competition?.emblem || null,
        status: match.status === 'IN_PLAY' ? 'Ao vivo' : match.status === 'FINISHED' ? 'Encerrado' : match.status || '',
        elapsed,
        isLive: match.status === 'IN_PLAY' || match.status === 'PAUSED',
        venue: match.venue || null,
        stats, events, commentary: [], homeRoster: [], awayRoster: [],
      }
    } catch { return null }
  }

  /** Try API-Football live endpoint for stats */
  async function tryApiFootballLive(expectedHome: string, expectedAway: string): Promise<MatchData | null> {
    try {
      const res = await fetch('/api/api-football-live')
      if (!res.ok) return null
      const json = await res.json()
      const fixtures = json.response || []

      for (const item of fixtures) {
        const homeName = item.teams?.home?.name || ''
        const awayName = item.teams?.away?.name || ''
        if (!isSameMatchStrict({ homeName: expectedHome, awayName: expectedAway }, { homeName, awayName })) continue

        // Found the fixture " now try to get detailed stats via fixture ID
        const fixtureApiId = item.fixture?.id
        let stats: { label: string; home: string; away: string }[] = []
        let events: { clock: string; text: string; type: string; team: string }[] = []
        let homeRoster: Player[] = []
        let awayRoster: Player[] = []

        if (fixtureApiId) {
          try {
            const detailRes = await fetch(`/api/api-football-fixture?id=${fixtureApiId}`)
            if (detailRes.ok) {
              const detailJson = await detailRes.json()
              const detail = detailJson.response?.[0] || detailJson

              // Stats
              const homeStats = detail.statistics?.[0]?.statistics || []
              const awayStats = detail.statistics?.[1]?.statistics || []
              for (const s of homeStats) {
                const away = awayStats.find((x: any) => x.type === s.type)
                if (s.value !== null || away?.value !== null) {
                  stats.push({ label: s.type || '', home: String(s.value ?? 0), away: String(away?.value ?? 0) })
                }
              }

              // Events
              events = (detail.events || []).map((ev: any) => ({
                clock: String(ev.time?.elapsed || ''),
                text: `${ev.type || ''} - ${ev.player?.name || ''} ${ev.detail || ''}`.trim(),
                type: ev.type || '',
                team: ev.team?.name || '',
              }))

              // Lineups
              const lineups = detail.lineups || []
              if (lineups.length >= 2) {
                homeRoster = (lineups[0]?.startXI || []).map((p: any) => ({ jersey: String(p.player?.number || ''), name: p.player?.name || '', starter: true }))
                  .concat((lineups[0]?.substitutes || []).map((p: any) => ({ jersey: String(p.player?.number || ''), name: p.player?.name || '', starter: false })))
                awayRoster = (lineups[1]?.startXI || []).map((p: any) => ({ jersey: String(p.player?.number || ''), name: p.player?.name || '', starter: true }))
                  .concat((lineups[1]?.substitutes || []).map((p: any) => ({ jersey: String(p.player?.number || ''), name: p.player?.name || '', starter: false })))
              }
            }
          } catch { /* detail fetch failed, continue with basic */ }
        }

        // If no stats from detail, try inline stats
        if (stats.length === 0) {
          const homeS = item.statistics?.[0]?.statistics || []
          const awayS = item.statistics?.[1]?.statistics || []
          for (const s of homeS) {
            const away = awayS.find((x: any) => x.type === s.type)
            if (s.value !== null || away?.value !== null) {
              stats.push({ label: s.type || '', home: String(s.value ?? 0), away: String(away?.value ?? 0) })
            }
          }
        }

        // If no events from detail, try inline
        if (events.length === 0) {
          events = (item.events || []).map((ev: any) => ({
            clock: String(ev.time?.elapsed || ''),
            text: `${ev.type || ''} - ${ev.player?.name || ''} ${ev.detail || ''}`.trim(),
            type: ev.type || '',
            team: ev.team?.name || '',
          }))
        }

        // Try to get logos from football-data if API-Football logos are missing
        let homeLogo = item.teams?.home?.logo || null
        let awayLogo = item.teams?.away?.logo || null
        if (homeLogo?.includes('media.api-sports.io')) homeLogo = null
        if (awayLogo?.includes('media.api-sports.io')) awayLogo = null

        // If no logos, try football-data crests from state
        if (!homeLogo && fixtureState?.homeTeam?.logo) homeLogo = fixtureState.homeTeam.logo
        if (!awayLogo && fixtureState?.awayTeam?.logo) awayLogo = fixtureState.awayTeam.logo

        return {
          home: { name: homeName, logo: homeLogo, score: item.goals?.home ?? 0, color: '22d3ee', colors: ['22d3ee', '1a1a2e'] },
          away: { name: awayName, logo: awayLogo, score: item.goals?.away ?? 0, color: '34d399', colors: ['34d399', '1a1a2e'] },
          league: item.league?.name || '', leagueLogo: null,
          status: item.fixture?.status?.long || '', elapsed: item.fixture?.status?.elapsed || null,
          isLive: ['1H', '2H', 'HT', 'ET', 'P'].includes(item.fixture?.status?.short || ''),
          venue: item.fixture?.venue?.name || null,
          stats, events, commentary: [], homeRoster, awayRoster,
        }
      }
      return null
    } catch { return null }
  }

  useEffect(() => {
    fetchData()
    const interval = (fixtureState?.status.short === 'LIVE' || fixtureState?.status.short === 'HT') ? 15_000 : 60_000
    const id = setInterval(() => fetchData(true), interval)
    return () => clearInterval(id)
  }, [fetchData])
  useEffect(() => { if (narRef.current) narRef.current.scrollTop = narRef.current.scrollHeight }, [data?.commentary.length])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><LoadingState message="" /></div>
  if (error || !data) return (
    <div className="space-y-6 animate-fadeIn">
      {onBack ? <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60"><ArrowLeft size={14} /> Voltar</button> : <Link to="/app/matches" className="inline-flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60"><ArrowLeft size={14} /> Voltar às Partidas</Link>}
      <div className="rounded-3xl border border-white/[0.04] bg-white/[0.015] p-10 text-center">
        <p className="text-[14px] text-white/40">{error || 'Partida não encontrada'}</p>
      </div>
    </div>
  )

  const { home, away, league, leagueLogo, status, elapsed, isLive, venue, stats, events, commentary, homeRoster, awayRoster } = data
  const getStat = (name: string) => { const s = stats.find(x => x.label === name); return s ? { home: parseFloat(s.home) || 0, away: parseFloat(s.away) || 0 } : undefined }

  const intelligence = calculateMatchIntelligence(
    { possession: getStat('POSSESSION') || getStat('possessionPct'), shots: getStat('SHOTS') || getStat('totalShots'), shotsOnTarget: getStat('ON GOAL') || getStat('shotsOnTarget'), corners: getStat('Corner Kicks') || getStat('wonCorners'), fouls: getStat('Fouls') || getStat('foulsCommitted') },
    elapsed, home.score, away.score, events.length > 0, commentary.length > 0, homeRoster.length > 0
  )

  const execRead = buildExecutiveRead({
    homeName: home.name, awayName: away.name, homeScore: home.score, awayScore: away.score,
    elapsed, isLive, isScheduled: isScheduledMatch(status),
    possession: getStat('POSSESSION') || getStat('possessionPct'),
    shots: getStat('SHOTS') || getStat('totalShots'), shotsOnTarget: getStat('ON GOAL') || getStat('shotsOnTarget'),
    corners: getStat('Corner Kicks') || getStat('wonCorners'),
    hasStats: stats.length > 0, hasEvents: events.length > 0, hasLineups: homeRoster.length > 0, hasNarration: commentary.length > 0,
  })

  const attack = stats.filter(s => ['SHOTS', 'ON GOAL', 'On Target %', 'Blocked Shots', 'totalShots', 'shotsOnTarget'].includes(s.label))
  const control = stats.filter(s => ['POSSESSION', 'Accurate Passes', 'Passes', 'Pass Completion %', 'possessionPct'].includes(s.label))
  const defense = stats.filter(s => ['Effective Tackles', 'Tackles', 'Interceptions', 'Saves', 'Clearances'].includes(s.label))
  const discipline = stats.filter(s => ['Fouls', 'Yellow Cards', 'Red Cards', 'Offsides', 'Corner Kicks', 'foulsCommitted', 'yellowCards', 'redCards', 'wonCorners', 'offsides'].includes(s.label))

  const filteredCommentary = commentary.filter((c, _idx) => {
    if (narFilter === 'all') return true
    const t = c.text.toLowerCase()
    const minute = parseInt(c.clock) || 0
    const isRecent = elapsed ? minute >= elapsed - 10 : false

    if (narFilter === 'important') {
      // Always show: goals, cards, subs, penalties, VAR
      if (t.includes('goal') && !t.includes('attempt') && !t.includes('goal kick')) return true
      if (t.includes('yellow') || t.includes('red card')) return true
      if (t.includes('substitution') || t.includes('replaces')) return true
      if (t.includes('penalty') || t.includes('var')) return true
      // Show saved/blocked only if recent
      if ((t.includes('saved') || t.includes('blocked')) && isRecent) return true
      // Corners only if recent
      if (t.includes('corner') && isRecent) return true
      return false
    }
    switch (narFilter) {
      case 'goals': return t.includes('goal') && !t.includes('attempt') && !t.includes('goal kick')
      case 'cards': return t.includes('yellow') || t.includes('red card')
      case 'subs': return t.includes('substitution') || t.includes('replaces')
      case 'shots': return t.includes('attempt') || t.includes('shot') || t.includes('header')
      default: return true
    }
  })

  // Build player event map for lineup badges
  const playerEventMap = buildPlayerEventMap(events)

  // Contextual phrase for hero
  const heroPhrase = (() => {
    if (!isLive) return ''
    const poss = getStat('POSSESSION') || getStat('possessionPct')
    const sh = getStat('SHOTS') || getStat('totalShots')
    if (elapsed && elapsed >= 80) return 'Reta final'
    if (poss && Math.abs(poss.home - poss.away) > 15) return poss.home > poss.away ? `${home.name} controla o jogo` : `${away.name} controla o jogo`
    if (sh && (sh.home + sh.away) >= 20) return 'Jogo aberto'
    if (home.score + away.score >= 4) return 'Alta eficiência ofensiva'
    if (home.score === away.score && home.score > 0) return 'Jogo equilibrado'
    return ''
  })()

  // Last 10 minutes
  const last10 = (() => {
    if (!elapsed || events.length === 0) return null
    const recentEvents = events.filter(ev => { const m = parseInt(ev.clock) || 0; return m >= elapsed - 10 && m <= elapsed })
    if (recentEvents.length < 2) return null
    const homeFirst = home.name.split(' ')[0].toLowerCase()
    const awayFirst = away.name.split(' ')[0].toLowerCase()
    let hCount = 0, aCount = 0
    for (const ev of recentEvents) {
      const t = (ev.team + ' ' + ev.text).toLowerCase()
      if (t.includes(homeFirst)) hCount++; else if (t.includes(awayFirst)) aCount++; else { hCount += 0.5; aCount += 0.5 }
    }
    const dominant = hCount > aCount * 1.5 ? home.name : aCount > hCount * 1.5 ? away.name : null
    const phrase = dominant ? `${dominant} cresce nos últimos minutos.` : 'Poucas ações relevantes nos últimos minutos.'
    return { hCount: Math.round(hCount), aCount: Math.round(aCount), total: recentEvents.length, phrase }
  })()

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fadeIn">
      {/* NAV */}
      <div className="flex items-center justify-between">
        {onBack ? <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60"><ArrowLeft size={14} /> Voltar</button> : <Link to="/app/matches" className="inline-flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60"><ArrowLeft size={14} /> Voltar às Partidas</Link>}
        <div className="flex items-center gap-2">
          <MatchDetailFavorites home={home} away={away} league={league} leagueLogo={leagueLogo} date={data?.events?.[0] ? '' : ''} utcDate={fixtureState?.date || ''} />
          <button onClick={() => fetchData(true)} className="p-2 rounded-full text-white/20 hover:text-white/50 hover:bg-white/[0.03]"><RefreshCw size={13} /></button>
        </div>
      </div>

      {/* 1. TOP MATCH HEADER */}
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
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-baseline gap-3">
                <span className="text-[48px] font-bold tabular-nums text-white leading-none">{isScheduledMatch(status) ? '-' : home.score}</span>
                <span className="text-[18px] text-white/10">:</span>
                <span className="text-[48px] font-bold tabular-nums text-white leading-none">{isScheduledMatch(status) ? '-' : away.score}</span>
              </div>
              {isLive && <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /><span className="text-[12px] font-semibold text-emerald-400">{elapsed ? `${elapsed}'` : 'Ao vivo'}</span></div>}
              {!isLive && status && <span className="text-[10px] text-white/25">{status}</span>}
              {heroPhrase && <span className="text-[10px] text-cyan-400/60 font-medium mt-0.5">{heroPhrase}</span>}
            </div>
            <div className="flex flex-col items-center gap-2">
              <ClubLogo src={away.logo} name={away.name} size={64} />
              <span className="text-[12px] font-semibold text-white text-center max-w-[120px]">{away.name}</span>
            </div>
          </div>
          {stats.length > 0 && (
            <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-white/40 font-medium">
              {getStat('POSSESSION') && (getStat('POSSESSION')!.home + getStat('POSSESSION')!.away) > 10 && <span>Posse {getStat('POSSESSION')!.home.toFixed(0)}%-{getStat('POSSESSION')!.away.toFixed(0)}%</span>}
              {getStat('SHOTS') && (getStat('SHOTS')!.home + getStat('SHOTS')!.away) > 0 && <span>Fin. {getStat('SHOTS')!.home}-{getStat('SHOTS')!.away}</span>}
              {getStat('Corner Kicks') && (getStat('Corner Kicks')!.home + getStat('Corner Kicks')!.away) > 0 && <span>Esc. {getStat('Corner Kicks')!.home}-{getStat('Corner Kicks')!.away}</span>}
            </div>
          )}
          {venue && <p className="text-center text-[9px] text-white/10 mt-2">{venue}</p>}
        </div>
      </section>

      {/* STICKY NAV */}
      <nav className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-[#0a0d14]/90 backdrop-blur-md border-b border-white/[0.03]">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {[['sec-resumo','Resumo'],['sec-pressao','Pressão'],['sec-stats','Estatísticas'],['sec-timeline','Linha do tempo'],['sec-narracao','Narração'],['sec-elenco','Elenco']].map(([id, label]) => (
            <button key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-medium text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors">
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* 2. MATCH INTELLIGENCE PANEL */}
      <section id="sec-resumo" className="rounded-[24px] border border-white/[0.04] bg-white/[0.02] p-5">
        <h2 className="text-[13px] font-bold text-white/70 mb-2">{execRead.title}</h2>
        <p className="text-[12px] text-white/50 leading-relaxed">{execRead.summary}</p>
        {execRead.bullets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {execRead.bullets.map((b, i) => <span key={i} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1 text-[10px] text-white/40">{b}</span>)}
          </div>
        )}
        {last10 && (
          <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center gap-3">
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/20">{'Últimos'} 10'</span>
            <span className="text-[10px] text-white/40">{last10.phrase}</span>
            <span className="ml-auto text-[9px] tabular-nums text-white/20">{last10.total} {last10.total === 1 ? 'ação' : 'ações'}</span>
          </div>
        )}
      </section>

      {/* DATA COVERAGE BADGE */}
      <MatchCoverageSection stats={stats} events={events} commentary={commentary} homeRoster={homeRoster} home={home} away={away} />

      {/* PRE-MATCH INTELLIGENCE (for scheduled/upcoming matches) */}
      {isScheduledMatch(status) && (
        <PreMatchIntelligencePanel homeName={home.name} awayName={away.name} competition={league} utcDate={fixtureState?.date} />
      )}

      {/* POST-MATCH INTELLIGENCE (for finished matches only) */}
      {isFinishedMatch(status) && (
        <PostMatchIntelligencePanel homeName={home.name} awayName={away.name} homeScore={home.score} awayScore={away.score} stats={stats} events={events} hasLineups={homeRoster.length > 0} hasNarration={commentary.length > 0} />
      )}

      {/* DIAGNOSTIC PANEL */}
      {stats.length > 0 && <DiagnosticPanel stats={stats} homeName={home.name} awayName={away.name} homeScore={home.score} awayScore={away.score} elapsed={elapsed} events={events} />}

      {/* 3. LIVE PRESSURE CENTER */}
      <div id="sec-pressao">
        <LivePressureGraph events={events} commentary={commentary} homeName={home.name} awayName={away.name} elapsed={elapsed} homeColors={home.colors} awayColors={away.colors} />
      </div>

      {/* 4. TACTICAL SNAPSHOT */}
      <div id="sec-stats">
        <CircularStatsPanel stats={stats} homeName={home.name} awayName={away.name} homeColor={home.color} awayColor={away.color} />
      </div>

      {/* 5. KEY MOMENTS + IMPACT */}
      {(events.length > 0 || stats.length > 0) && (
        <div id="sec-timeline" className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {events.length > 0 && <GroupedTimeline events={events} homeName={home.name} awayName={away.name} />}
          <div className="space-y-4">
            <PlayerImpactPanel events={events} />
            {stats.length > 0 && <DangerousAttackPanel stats={stats} events={events} homeName={home.name} awayName={away.name} />}
          </div>
        </div>
      )}

      {/* 6. LIVE COMMENTARY */}
      {commentary.length > 0 && (
        <section id="sec-narracao" className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25">Narração ao vivo</h3>
            <div className="flex flex-wrap gap-1">
              {([['important', 'Importantes'], ['all', 'Todos'], ['goals', 'Gols'], ['cards', 'Cartões'], ['subs', 'Subst.'], ['shots', 'Finaliz.']] as [NarrationFilter, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setNarFilter(key)}
                  className={`px-2 py-0.5 rounded text-[9px] font-medium ${narFilter === key ? 'bg-white/[0.08] text-white/60' : 'text-white/20 hover:text-white/40'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div ref={narRef} className="max-h-[320px] overflow-y-auto pr-1 scroll-smooth">
            {filteredCommentary.map((c, i) => (
              <div key={i} className="flex gap-2.5 py-1.5 border-b border-white/[0.02] last:border-0">
                <span className="w-6 shrink-0 text-right text-[9px] tabular-nums text-emerald-400/50">{c.clock}</span>
                <span className="text-[10px] text-white/45 leading-relaxed">{sanitizeFinalPortugueseText(c.text)}</span>
              </div>
            ))}
            {filteredCommentary.length === 0 && <p className="text-[10px] text-white/15 py-3 text-center">Nenhum evento nesta categoria.</p>}
          </div>
        </section>
      )}

      {/* 7. STATS DETAIL */}
      {stats.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {attack.length > 0 && <StatGroup title="Ataque" stats={attack} />}
          {control.length > 0 && <StatGroup title="Controle" stats={control} />}
          {defense.length > 0 && <StatGroup title="Defesa" stats={defense} />}
          {discipline.length > 0 && <StatGroup title="Disciplina" stats={discipline} />}
        </div>
      )}

      {/* 8. LINEUPS */}
      {(homeRoster.length > 0 || awayRoster.length > 0) && (
        <section id="sec-elenco" className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <RosterPanel team={home.name} logo={home.logo} players={homeRoster} eventMap={playerEventMap} />
          <RosterPanel team={away.name} logo={away.logo} players={awayRoster} eventMap={playerEventMap} />
        </section>
      )}

      {/* 9. HIGHLIGHTS */}
      <MatchHighlightsSection homeName={home.name} awayName={away.name} />
    </div>
  )
}
// --- DIAGNOSTIC PANEL ---
function DiagnosticPanel({ stats, homeName, awayName, homeScore, awayScore, elapsed, events }: { stats: { label: string; home: string; away: string }[]; homeName: string; awayName: string; homeScore: number; awayScore: number; elapsed: number | null; events: { clock: string; text: string; type: string; team: string }[] }) {
  const getStat = (name: string) => { const s = stats.find(x => x.label.toLowerCase().includes(name.toLowerCase())); return s ? { home: parseFloat(s.home) || 0, away: parseFloat(s.away) || 0 } : null }

  const possession = getStat('possession') || getStat('POSSESSION')
  const shots = getStat('shots') || getStat('SHOTS') || getStat('totalShots')
  const onTarget = getStat('on goal') || getStat('ON GOAL') || getStat('shotsOnTarget')

  const controlTeam = possession && possession.home > possession.away ? homeName : possession && possession.away > possession.home ? awayName : null
  const dangerTeam = shots && shots.home > shots.away ? homeName : shots && shots.away > shots.home ? awayName : null
  const efficiencyTeam = (() => {
    if (!onTarget) return null
    const hEff = onTarget.home > 0 ? homeScore / onTarget.home : 0
    const aEff = onTarget.away > 0 ? awayScore / onTarget.away : 0
    if (hEff > aEff && homeScore > 0) return homeName
    if (aEff > hEff && awayScore > 0) return awayName
    return null
  })()

  // Moment: last 10 min events
  const momentTeam = (() => {
    if (!elapsed || events.length === 0) return null
    const recent = events.filter(ev => { const m = parseInt(ev.clock) || 0; return m >= elapsed - 10 })
    if (recent.length < 2) return null
    const hFirst = homeName.split(' ')[0].toLowerCase()
    const aFirst = awayName.split(' ')[0].toLowerCase()
    let h = 0, a = 0
    for (const ev of recent) { const t = (ev.team + ev.text).toLowerCase(); if (t.includes(hFirst)) h++; else if (t.includes(aFirst)) a++ }
    return h > a * 1.3 ? homeName : a > h * 1.3 ? awayName : null
  })()

  if (!controlTeam && !dangerTeam) return null

  const items: { label: string; team: string | null; detail: string }[] = []
  if (controlTeam) items.push({ label: 'Controle', team: controlTeam, detail: possession ? `${Math.max(possession.home, possession.away).toFixed(0)}% de posse` : '' })
  if (dangerTeam) items.push({ label: 'Perigo', team: dangerTeam, detail: shots ? `${Math.max(shots.home, shots.away)} finalizações` : '' })
  if (efficiencyTeam) items.push({ label: 'Eficiência', team: efficiencyTeam, detail: onTarget ? `${homeScore + awayScore} gols em ${(onTarget.home + onTarget.away)} no alvo` : '' })
  items.push({ label: 'Momento', team: momentTeam || 'Equilibrado', detail: momentTeam ? 'cresce nos últimos 10 minutos' : 'sem domínio recente claro' })

  return (
    <section className="rounded-[20px] border border-white/[0.04] bg-white/[0.015] p-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((item, i) => (
          <div key={i} className="space-y-0.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/20">{item.label}</span>
            <p className="text-[11px] font-semibold text-white/60">{item.team}</p>
            {item.detail && <p className="text-[9px] text-white/25">{item.detail}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

// --- PREMIUM TIMELINE ---
function GroupedTimeline({ events, homeName, awayName }: { events: { clock: string; text: string; type: string; team: string }[]; homeName?: string; awayName?: string }) {
  const [filter, setFilter] = useState<string>('all')
  const normalized = normalizeEvents(events)

  const filtered = normalized.filter(e => {
    if (e.type === 'other' || e.type === 'period_start' || e.type === 'period_end') return false
    if (filter === 'all') return true
    if (filter === 'goals') return e.type === 'goal'
    if (filter === 'cards') return e.type === 'yellow_card' || e.type === 'red_card'
    if (filter === 'subs') return e.type === 'substitution'
    if (filter === 'shots') return e.type === 'shot'
    return true
  })

  const firstHalf = filtered.filter(e => e.minute <= 45)
  const secondHalf = filtered.filter(e => e.minute > 45 && e.minute <= 90)
  const extraTime = filtered.filter(e => e.minute > 90)

  // Track running score for goal events
  let runningHome = 0, runningAway = 0
  const scoreMap = new Map<string, string>()
  for (const ev of normalized.filter(e => e.type === 'goal').sort((a, b) => a.minute - b.minute)) {
    const isHome = homeName && ev.teamName?.toLowerCase().includes(homeName.split(' ')[0].toLowerCase())
    if (isHome) runningHome++; else runningAway++
    scoreMap.set(ev.id, `${runningHome}-${runningAway}`)
  }

  const renderEvent = (ev: ReturnType<typeof normalizeEvents>[number], i: number) => {
    const isGoal = ev.type === 'goal'
    const isCard = ev.type === 'yellow_card' || ev.type === 'red_card'
    const isSub = ev.type === 'substitution'
    const isCorner = ev.type === 'corner'
    const isShot = ev.type === 'shot'

    const borderColor = isGoal ? 'border-emerald-500/20' : ev.type === 'red_card' ? 'border-rose-500/20' : isCard ? 'border-amber-500/15' : isSub ? 'border-cyan-500/10' : 'border-white/[0.02]'
    const bgColor = isGoal ? 'bg-emerald-500/[0.04]' : ev.type === 'red_card' ? 'bg-rose-500/[0.03]' : ''
    const hasInjury = ev.rawText?.toLowerCase().includes('injur')

    const icon = isGoal ? <Circle size={12} className="text-emerald-400 fill-emerald-400/30" />
      : ev.type === 'red_card' ? <Square size={10} className="text-rose-500 fill-rose-500/50" />
      : isCard ? <Square size={10} className="text-amber-400 fill-amber-400/50" />
      : isSub ? <ArrowRightLeft size={11} className="text-cyan-400/60" />
      : isShot ? <Target size={11} className="text-white/30" />
      : isCorner ? <Flag size={10} className="text-white/20" />
      : <Circle size={8} className="text-white/15" />

    return (
      <div key={i} className={`relative flex gap-3 rounded-xl px-3 py-2.5 border ${borderColor} ${bgColor}`}>
        <div className="shrink-0 w-8 text-right">
          <span className={`text-[13px] font-bold tabular-nums ${isGoal ? 'text-emerald-400' : 'text-white/35'}`}>{ev.minute}'</span>
        </div>
        <div className="flex flex-col items-center shrink-0 pt-0.5">
          {icon}
          <div className="w-px flex-1 bg-white/[0.03] mt-1" />
        </div>
        <div className="min-w-0 flex-1 pb-1">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-semibold ${isGoal ? 'text-emerald-400' : isCard ? (ev.type === 'red_card' ? 'text-rose-400' : 'text-amber-400') : 'text-white/55'}`}>{ev.title}</span>
            {ev.teamName && <span className="text-[9px] text-white/20">{ev.teamName}</span>}
          </div>
          {isGoal && (
            <div className="mt-1 space-y-0.5">
              {ev.playerName && <span className="text-[10px] text-white/50 block">{ev.playerName} marcou.</span>}
              {ev.assistName && <span className="text-[10px] text-white/35 block">Assistência: {ev.assistName}</span>}
              {scoreMap.get(ev.id) && <span className="text-[9px] text-emerald-400/40 block">Placar: {scoreMap.get(ev.id)}</span>}
            </div>
          )}
          {isSub && (
            <div className="mt-1 space-y-0.5">
              {ev.playerIn && <span className="text-[10px] text-cyan-400/60 block">{ev.playerIn} entrou</span>}
              {ev.playerOut && <span className="text-[10px] text-white/25 block">{sanitizePlayerText(ev.playerOut)} saiu</span>}
              {hasInjury && <span className="text-[9px] text-rose-400/40 block">Motivo: lesão</span>}
            </div>
          )}
          {isCard && ev.playerName && (
            <span className="text-[10px] text-white/35 block mt-0.5">{sanitizePlayerText(ev.playerName)}{ev.rawText?.toLowerCase().includes('bad foul') || ev.rawText?.toLowerCase().includes('falta dura') ? ' — falta dura' : ''}</span>
          )}
          {isShot && ev.playerName && (
            <span className="text-[10px] text-white/25 block mt-0.5">{sanitizePlayerText(ev.playerName)}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <section id="sec-timeline" className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/30">Linha do tempo</h3>
        <div className="flex gap-1">
          {[['all','Todos'],['goals','Gols'],['cards','Cart.'],['subs','Subst.'],['shots','Fin.']].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-2 py-0.5 rounded text-[8px] font-medium ${filter === k ? 'bg-white/[0.08] text-white/60' : 'text-white/20 hover:text-white/40'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className={`${filtered.length > 6 ? 'max-h-[450px] overflow-y-auto' : ''} pr-1 scroll-smooth space-y-1.5`}>
        {firstHalf.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2"><span className="text-[8px] font-bold uppercase tracking-widest text-white/15">1T</span><div className="flex-1 h-px bg-white/[0.03]" /></div>
            <div className="space-y-1">{firstHalf.map((ev, i) => renderEvent(ev, i))}</div>
          </div>
        )}
        {secondHalf.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2"><span className="text-[8px] font-bold uppercase tracking-widest text-white/15">2T</span><div className="flex-1 h-px bg-white/[0.03]" /></div>
            <div className="space-y-1">{secondHalf.map((ev, i) => renderEvent(ev, i + 100))}</div>
          </div>
        )}
        {extraTime.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2"><span className="text-[8px] font-bold uppercase tracking-widest text-white/15">ACR</span><div className="flex-1 h-px bg-white/[0.03]" /></div>
            <div className="space-y-1">{extraTime.map((ev, i) => renderEvent(ev, i + 200))}</div>
          </div>
        )}
        {filtered.length === 0 && <p className="text-[10px] text-white/15 py-4 text-center">Nenhum evento nesta categoria.</p>}
      </div>
    </section>
  )
}

// --- PULSE CARD ---
function PulseCard({ metric, title, color }: { metric: MetricResult; title: string; color: string }) {
  const colors: Record<string, string> = { cyan: 'text-cyan-400', violet: 'text-violet-400', amber: 'text-amber-400', emerald: 'text-emerald-400' }
  const barColors: Record<string, string> = { cyan: 'bg-cyan-400', violet: 'bg-violet-400', amber: 'bg-amber-400', emerald: 'bg-emerald-400' }
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/30">{title}</span>
        <span className={`text-[15px] font-bold tabular-nums ${colors[color]}`}>{metric.value}</span>
      </div>
      <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden mb-1.5">
        <div className={`h-full rounded-full ${barColors[color]} transition-all duration-700`} style={{ width: `${metric.value}%` }} />
      </div>
      <p className="text-[9px] text-white/25">{metric.label}</p>
    </div>
  )
}

// --- STAT GROUP ---
function StatGroup({ title, stats }: { title: string; stats: { label: string; home: string; away: string }[] }) {
  const useful = stats.filter(s => (parseFloat(s.home) || 0) > 0 || (parseFloat(s.away) || 0) > 0)
  if (useful.length === 0) return null
  return (
    <div className="rounded-[20px] border border-white/[0.04] bg-white/[0.015] p-4">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25 mb-3">{title}</h3>
      <div className="space-y-2.5">
        {useful.map(s => {
          const h = parseFloat(s.home) || 0, a = parseFloat(s.away) || 0, t = h + a || 1
          const hPct = (h / t) * 100, hLeads = h > a
          return (
            <div key={s.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className={`text-[12px] font-bold tabular-nums ${hLeads ? 'text-white' : 'text-white/50'}`}>{s.home}</span>
                <span className="text-[10px] text-white/30">{translateStat(s.label)}</span>
                <span className={`text-[12px] font-bold tabular-nums ${!hLeads && h !== a ? 'text-white' : 'text-white/50'}`}>{s.away}</span>
              </div>
              <div className="flex h-[3px] rounded-full overflow-hidden bg-white/[0.04] gap-[1px]">
                <div className="bg-white/50 rounded-full transition-all duration-700" style={{ width: `${hPct}%` }} />
                <div className="bg-white/15 rounded-full flex-1" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- ROSTER PANEL with badges ---
function RosterPanel({ team, logo, players, eventMap }: { team: string; logo: string | null; players: Player[]; eventMap: ReturnType<typeof buildPlayerEventMap> }) {
  const starters = players.filter(p => p.starter)
  const bench = players.filter(p => !p.starter)

  const renderPlayer = (p: Player, i: number, isBench = false) => {
    const badges = getBadgesForPlayer(p.name, eventMap)
    const hasGoal = badges.some(b => b.type === 'goal') || p.goal
    const hasAssist = badges.some(b => b.type === 'assist')
    const hasRed = badges.some(b => b.type === 'red_card') || p.redCard
    const hasSubOut = badges.some(b => b.type === 'sub_out') || (p.subbed && p.starter)
    const hasSubIn = badges.some(b => b.type === 'sub_in') || (p.subbed && !p.starter)
    const hasInjury = badges.some(b => b.label?.includes('Les'))
    const dimmed = hasSubOut || hasRed

    return (
      <div key={i} className={`flex items-center gap-2 ${dimmed ? 'opacity-50' : ''} ${hasSubIn && isBench ? 'bg-cyan-500/[0.03] rounded' : ''} ${isBench ? 'py-1.5 px-2' : 'py-2 px-2 rounded-lg hover:bg-white/[0.02]'}`}>
        <span className={`${isBench ? 'text-[10px] w-4 text-right' : 'w-6 h-6 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[10px] font-bold'} tabular-nums text-white/40`}>{p.jersey}</span>
        <span className={`text-[11px] font-medium flex-1 truncate ${hasGoal ? 'text-emerald-400' : hasAssist ? 'text-cyan-400' : hasRed ? 'text-rose-400' : isBench ? 'text-white/40' : 'text-white/70'}`}>{p.name}</span>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {badges.map((b, bi) => (
            <span key={bi} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-medium ${getBadgeStyle(b.type)}`}>{b.label}</span>
          ))}
          {badges.length === 0 && p.goal && <span className="text-[8px] text-emerald-400 bg-emerald-500/10 rounded px-1.5 py-0.5">GOL</span>}
          {badges.length === 0 && p.yellowCard && <span className="h-2.5 w-1.5 rounded-sm bg-amber-400/80" />}
          {badges.length === 0 && p.redCard && <span className="h-2.5 w-1.5 rounded-sm bg-rose-500/80" />}
          {badges.length === 0 && p.subbed && !p.starter && <span className="text-[8px] text-cyan-400/60">ENT</span>}
          {badges.length === 0 && p.subbed && p.starter && <span className="text-[8px] text-white/20">SAIU</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] bg-white/[0.01]">
        <ClubLogo src={logo} name={team} size={22} />
        <h3 className="text-[11px] font-bold text-white/70">{team}</h3>
        <span className="ml-auto text-[10px] text-white/20">{starters.length} titulares</span>
      </div>
      <div className="px-4 py-3">
        <div className="grid grid-cols-1 gap-0">{starters.map((p, i) => renderPlayer(p, i))}</div>
      </div>
      {bench.length > 0 && (
        <div className="px-4 py-3 border-t border-white/[0.03]">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/15 mb-1.5">Banco ({bench.length})</p>
          <div className="grid grid-cols-2 gap-0">{bench.map((p, i) => renderPlayer(p, i, true))}</div>
        </div>
      )}
    </div>
  )
}

// --- CIRCULAR STATS ---
function CircularStatsPanel({ stats, homeName, awayName, homeColor, awayColor }: { stats: { label: string; home: string; away: string }[]; homeName: string; awayName: string; homeColor: string; awayColor: string }) {
  const getStat = (name: string) => {
    const s = stats.find(x => x.label === name || x.label.toLowerCase().includes(name.toLowerCase()))
    return s ? { home: parseFloat(s.home) || 0, away: parseFloat(s.away) || 0 } : null
  }
  const possession = getStat('POSSESSION') || getStat('possessionPct')
  const shots = getStat('SHOTS') || getStat('totalShots')
  const corners = getStat('Corner') || getStat('wonCorners')
  if (!possession || (possession.home + possession.away) < 10) return null

  const hc = `#${homeColor}`, ac = `#${awayColor}`

  const renderDonut = (label: string, home: number, away: number, suffix = '') => {
    const total = home + away || 1
    const homePct = (home / total) * 100
    const r = 16, cx = 20, cy = 20, circ = 2 * Math.PI * r
    const homeArc = (homePct / 100) * circ
    return (
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[10px] text-white/30">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[16px] font-bold tabular-nums text-white/80">{Math.round(home)}{suffix}</span>
          <svg width="40" height="40" viewBox="0 0 40 40">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3.5" />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={hc} strokeWidth="3.5" strokeDasharray={`${homeArc} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="round" opacity="0.8" />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={ac} strokeWidth="3.5" strokeDasharray={`${circ - homeArc} ${circ}`} strokeDashoffset={`${-homeArc}`} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="round" opacity="0.6" />
          </svg>
          <span className="text-[16px] font-bold tabular-nums text-white/80">{Math.round(away)}{suffix}</span>
        </div>
      </div>
    )
  }

  return (
    <section className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] p-5 animate-slideUp">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {possession && (possession.home + possession.away) > 10 && renderDonut('Posse de bola', possession.home, possession.away, '%')}
        {shots && (shots.home + shots.away) > 0 && renderDonut('Finalizações', shots.home, shots.away)}
        {corners && (corners.home + corners.away) > 0 && renderDonut('Escanteios', corners.home, corners.away)}
      </div>
    </section>
  )
}

// --- HELPERS ---
function translateStat(l: string): string {
  const m: Record<string, string> = { 'SHOTS': 'Finalizações', 'ON GOAL': 'No alvo', 'On Target %': 'Precisão', 'Blocked Shots': 'Bloqueadas', 'POSSESSION': 'Posse', 'possessionPct': 'Posse', 'Accurate Passes': 'Passes certos', 'Passes': 'Passes', 'Pass Completion %': 'Precisão', 'Effective Tackles': 'Desarmes', 'Tackles': 'Tentativas', 'Interceptions': 'Interceptações', 'Saves': 'Defesas', 'Clearances': 'Cortes', 'Fouls': 'Faltas', 'foulsCommitted': 'Faltas', 'Yellow Cards': 'Amarelos', 'yellowCards': 'Amarelos', 'Red Cards': 'Vermelhos', 'redCards': 'Vermelhos', 'Offsides': 'Impedimentos', 'offsides': 'Impedimentos', 'Corner Kicks': 'Escanteios', 'wonCorners': 'Escanteios', 'totalShots': 'Finalizações', 'shotsOnTarget': 'No alvo' }
  return m[l] || l
}

function sanitizePlayerText(text: string): string {
  // Remove English remnants from player/event text
  return text
    .replace(/\s*because of an? (?:injury|lesão|injur\w*)\.?/gi, '')
    .replace(/\s*due to (?:an? )?(?:injury|lesão)\.?/gi, '')
    .replace(/\s*because\b.*/gi, '')
    .trim()
}

function extractColors(competitor: any): string[] {
  const colors: string[] = []
  const c1 = competitor?.team?.color
  const c2 = competitor?.team?.alternateColor
  if (c1) colors.push(c1)
  if (c2 && c2 !== c1) colors.push(c2)
  if (colors.length === 0) colors.push('22d3ee')
  if (colors.length === 1) { const bright = parseInt(colors[0], 16) > 0x888888; colors.push(bright ? '1a1a2e' : 'e8e8e8') }
  return colors.slice(0, 3)
}

function resolveTeamColors(homeColors: string[], awayColors: string[]): { home: string[]; away: string[] } {
  const hP = homeColors[0], aP = awayColors[0]
  if (areColorsSimilar(hP, aP)) {
    if (awayColors.length > 1 && !areColorsSimilar(hP, awayColors[1]) && !isTooFaint(awayColors[1])) return { home: homeColors, away: [awayColors[1], awayColors[0], ...awayColors.slice(2)] }
    if (homeColors.length > 1 && !areColorsSimilar(homeColors[1], aP) && !isTooFaint(homeColors[1])) return { home: [homeColors[1], homeColors[0], ...homeColors.slice(2)], away: awayColors }
    if (awayColors.length > 1 && isLight(awayColors[1])) return { home: homeColors, away: [awayColors[1], awayColors[0]] }
    return { home: homeColors, away: ['ffffff', ...awayColors] }
  }
  if (isTooFaint(aP) && awayColors.length > 1 && !isTooFaint(awayColors[1])) return { home: homeColors, away: [awayColors[1], awayColors[0], ...awayColors.slice(2)] }
  if (isTooFaint(hP) && homeColors.length > 1 && !isTooFaint(homeColors[1])) return { home: [homeColors[1], homeColors[0], ...homeColors.slice(2)], away: awayColors }
  return { home: homeColors, away: awayColors }
}

function areColorsSimilar(hex1: string, hex2: string): boolean {
  if (!hex1 || !hex2) return false
  const r1 = parseInt(hex1.slice(0, 2), 16), g1 = parseInt(hex1.slice(2, 4), 16), b1 = parseInt(hex1.slice(4, 6), 16)
  const r2 = parseInt(hex2.slice(0, 2), 16), g2 = parseInt(hex2.slice(2, 4), 16), b2 = parseInt(hex2.slice(4, 6), 16)
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) < 80
}

function isTooFaint(hex: string): boolean {
  if (!hex) return true
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 < 40
}

function isLight(hex: string): boolean {
  if (!hex) return false
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 180
}

function parseEspn(json: any): MatchData {
  const comp = json.header?.competitions?.[0]
  const h = comp?.competitors?.find((c: any) => c.homeAway === 'home')
  const a = comp?.competitors?.find((c: any) => c.homeAway === 'away')
  const boxTeams = json.boxscore?.teams || []
  const homeBox = boxTeams.find((t: any) => t.team?.id === h?.id || t.team?.id === h?.team?.id) || boxTeams[0]
  const awayBox = boxTeams.find((t: any) => t.team?.id === a?.id || t.team?.id === a?.team?.id) || boxTeams[1]
  const homeStats = homeBox?.statistics || []
  const awayStats = awayBox?.statistics || []
  const elapsed = comp?.status?.displayClock?.match(/(\d+)/)?.[1]

  const gs = new Set<string>(); const yc = new Set<string>(); const rc = new Set<string>(); const sub = new Set<string>()
  for (const ev of (json.keyEvents || [])) {
    const n = ev.athletesInvolved?.[0]?.displayName || ''
    const t = (ev.text || '').toLowerCase()
    if (t.includes('goal') && !t.includes('attempt')) gs.add(n)
    if (t.includes('yellow')) yc.add(n)
    if (t.includes('red card')) rc.add(n)
    if (t.includes('substitution')) sub.add(n)
  }
  const roster = (r: any[]): Player[] => r.map((p: any) => ({
    jersey: p.jersey || '', name: p.athlete?.displayName || '', starter: p.starter ?? true,
    goal: gs.has(p.athlete?.displayName || ''), yellowCard: yc.has(p.athlete?.displayName || ''),
    redCard: rc.has(p.athlete?.displayName || ''), subbed: sub.has(p.athlete?.displayName || ''),
  }))

  const result: MatchData = {
    home: { name: h?.team?.displayName || '', logo: h?.team?.logos?.[0]?.href || h?.team?.logo || null, score: parseInt(h?.score) || 0, color: h?.team?.color || '22d3ee', colors: [] },
    away: { name: a?.team?.displayName || '', logo: a?.team?.logos?.[0]?.href || a?.team?.logo || null, score: parseInt(a?.score) || 0, color: a?.team?.color || '34d399', colors: [] },
    league: json.header?.league?.name || '', leagueLogo: json.header?.league?.logos?.[0]?.href || null,
    status: comp?.status?.type?.description || '', elapsed: elapsed ? parseInt(elapsed) : null,
    isLive: comp?.status?.type?.state === 'in', venue: json.gameInfo?.venue?.fullName || null,
    stats: homeStats.map((s: any, i: number) => ({ label: s.label || s.name, home: s.displayValue || '0', away: awayStats[i]?.displayValue || '0' })),
    events: (json.keyEvents || []).map((ev: any) => ({ clock: ev.clock?.displayValue || '', text: ev.text || ev.shortText || '', type: ev.type?.text || '', team: ev.team?.displayName || '' })),
    commentary: (json.commentary || []).map((c: any) => ({ clock: c.time?.displayValue || c.clock?.displayValue || '', text: c.text || '' })),
    homeRoster: roster(json.rosters?.[0]?.roster || []), awayRoster: roster(json.rosters?.[1]?.roster || []),
  }

  const rawHome = extractColors(h)
  const rawAway = extractColors(a)
  const resolved = resolveTeamColors(rawHome, rawAway)
  result.home.colors = resolved.home
  result.away.colors = resolved.away
  result.home.color = resolved.home[0]
  result.away.color = resolved.away[0]
  return result
}

// ─── Match Detail Favorites ──────────────────────────────────────────────────

function MatchDetailFavorites({ home, away, league, leagueLogo, utcDate }: { home: { name: string; logo: string | null }; away: { name: string; logo: string | null }; league: string; leagueLogo: string | null; date: string; utcDate: string }) {
  const { isFavoriteTeam, toggleFavoriteTeam, isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const matchId = buildCanonicalMatchId(home.name, away.name, utcDate)
  const isMatchFav = isFavoriteMatch(matchId)
  const isHomeFav = isFavoriteTeam(home.name)
  const isAwayFav = isFavoriteTeam(away.name)

  return (
    <div className="flex items-center gap-1">
      {(isHomeFav || isAwayFav) && <span className="text-[8px] text-rose-400/50 mr-1">Favorito em campo</span>}
      <FavoriteButton
        active={isMatchFav}
        onClick={() => toggleFavoriteMatch({ canonicalMatchId: matchId, homeTeam: home.name, awayTeam: away.name, competition: league, utcDate })}
        size={14}
        label={isMatchFav ? 'Remover partida dos favoritos' : 'Favoritar partida'}
      />
      <FavoriteButton
        active={isHomeFav}
        onClick={() => toggleFavoriteTeam({ name: home.name, logo: home.logo })}
        size={12}
        label={isHomeFav ? `Remover ${home.name} dos favoritos` : `Favoritar ${home.name}`}
      />
      <FavoriteButton
        active={isAwayFav}
        onClick={() => toggleFavoriteTeam({ name: away.name, logo: away.logo })}
        size={12}
        label={isAwayFav ? `Remover ${away.name} dos favoritos` : `Favoritar ${away.name}`}
      />
    </div>
  )
}

// ─── Match Coverage Section ──────────────────────────────────────────────────

function MatchCoverageSection({ stats, events, commentary, homeRoster, home, away }: { stats: { label: string; home: string; away: string }[]; events: { clock: string; text: string; type: string; team: string }[]; commentary: { clock: string; text: string }[]; homeRoster: any[]; home: { name: string; logo: string | null }; away: { name: string; logo: string | null } }) {
  const { isAdvanced } = useViewMode()
  const coverage = getMatchCoverage({
    hasStats: stats.length > 0,
    hasEvents: events.length > 0,
    hasLineups: homeRoster.length > 0,
    hasNarration: commentary.length > 0,
    hasLogos: Boolean(home.logo && away.logo),
  })

  if (!isAdvanced && coverage.level === 'basic') return null

  return (
    <div className="flex items-center gap-3">
      <DataCoverageBadge coverage={coverage} />
      {isAdvanced && (
        <div className="flex items-center gap-2 text-[9px] text-white/20">
          <span>{stats.length > 0 ? '✓ Estatísticas' : '✗ Estatísticas'}</span>
          <span>{events.length > 0 ? '✓ Eventos' : '✗ Eventos'}</span>
          <span>{commentary.length > 0 ? '✓ Narração' : '✗ Narração'}</span>
          <span>{homeRoster.length > 0 ? '✓ Escalações' : '✗ Escalações'}</span>
        </div>
      )}
    </div>
  )
}
