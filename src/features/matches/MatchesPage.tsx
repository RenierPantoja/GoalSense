import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, ChevronLeft, ChevronRight, Search, X, Activity, Clock, CheckCircle2, BarChart3, LayoutGrid, List, Rows3, Zap, TrendingUp, Trophy, Globe2, Sparkles } from 'lucide-react'
import { ClubLogo } from '@/components/ui/ClubLogo'
import { storeFixtureForNavigation } from '@/lib/matchNavigation'
import { getMatchLocalDateKey, formatMatchTime, isMatchOnSelectedLocalDate, formatSelectedDateLabel, getTodayLocalDateKey, debugMatchDate } from '@/utils/matchDate'
import { getMatchImportanceScore, getMatchImportanceReason, getMatchImportanceBadge, sortMatchesByImportance, getMainGlobalMatch, getBrazilFeaturedMatch } from '@/utils/matchImportance'
import type { LiveFixture } from '@/lib/apiClient'
import { useFavorites } from '@/context/FavoritesContext'
import { useViewMode } from '@/context/ViewModeContext'
import { FavoriteButton } from '@/components/ui/FavoriteButton'
import { buildCanonicalMatchId } from '@/features/providers/canonicalMatchId'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FDMatch {
  id: number
  competition: { name: string; emblem: string | null }
  homeTeam: { id: number; name: string; crest: string | null; shortName: string }
  awayTeam: { id: number; name: string; crest: string | null; shortName: string }
  score: { fullTime: { home: number | null; away: number | null } }
  status: string
  matchday: number
  utcDate: string
  area?: { name: string }
}

type FilterKey = 'all' | 'live' | 'upcoming' | 'finished' | 'brazil' | 'europe' | 'relevant' | 'soon' | 'dominant' | 'favorites'
type ViewMode = 'agenda' | 'highlights' | 'compact'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapStatus(s: string) {
  if (s === 'IN_PLAY' || s === 'LIVE') return { label: 'Ao vivo', live: true, finished: false, upcoming: false }
  if (s === 'PAUSED') return { label: 'Intervalo', live: true, finished: false, upcoming: false }
  if (s === 'FINISHED') return { label: 'Encerrado', live: false, finished: true, upcoming: false }
  if (s === 'TIMED' || s === 'SCHEDULED') return { label: 'Agendado', live: false, finished: false, upcoming: true }
  if (s === 'POSTPONED') return { label: 'Adiado', live: false, finished: false, upcoming: false }
  return { label: s, live: false, finished: false, upcoming: true }
}

function translateComp(name: string): string {
  const m: Record<string, string> = { 'campeonato brasileiro série a': 'Brasileirão Série A', 'brazilian serie a': 'Brasileirão Série A', 'serie a': 'Serie A', 'primera division': 'La Liga', 'premier league': 'Premier League', 'ligue 1': 'Ligue 1', 'bundesliga': 'Bundesliga', 'championship': 'Championship', 'eredivisie': 'Eredivisie' }
  return m[name.toLowerCase()] || name
}

function getCountry(m: FDMatch): string {
  if (m.area?.name) return m.area.name
  const comp = m.competition.name.toLowerCase()
  if (comp.includes('brasil') || comp.includes('série')) return 'Brasil'
  if (comp.includes('premier')) return 'Inglaterra'
  if (comp.includes('liga') || comp.includes('primera')) return 'Espanha'
  if (comp.includes('bundesliga')) return 'Alemanha'
  if (comp.includes('serie a') && !comp.includes('brasil')) return 'Itália'
  if (comp.includes('ligue')) return 'França'
  return ''
}

function calcImportance(m: FDMatch): number {
  return getMatchImportanceScore(m)
}

function getInsight(m: FDMatch): string {
  const { live, finished } = mapStatus(m.status)
  const h = m.score.fullTime.home, a = m.score.fullTime.away
  if (live && h !== null && a !== null && (h + a) >= 4) return 'Jogo de muitos gols'
  if (live) return 'Em andamento'
  if (finished && h !== null && a !== null) { if (Math.abs(h - a) >= 3) return 'Placar dominante'; if (h === a) return 'Empate'; return h > a ? 'Vitória mandante' : 'Vitória visitante' }
  const diff = Math.round((new Date(m.utcDate).getTime() - Date.now()) / 60000)
  if (diff > 0 && diff <= 60) return 'Começa em breve'
  return ''
}

function getRelevanceReason(m: FDMatch): string {
  return getMatchImportanceReason(m)
}

function getRelevanceBadge(m: FDMatch): { label: string; style: string } {
  return getMatchImportanceBadge(m)
}

function getInsightBadge(m: FDMatch): { label: string; style: string } {
  const { live, finished } = mapStatus(m.status)
  const h = m.score.fullTime.home, a = m.score.fullTime.away
  if (live) return { label: 'Ao vivo', style: 'border-emerald-500/20 bg-emerald-500/8 text-emerald-400' }
  if (finished && h !== null && a !== null && Math.abs(h - a) >= 3) return { label: 'Placar dominante', style: 'border-violet-500/20 bg-violet-500/8 text-violet-400/70' }
  const diff = Math.round((new Date(m.utcDate).getTime() - Date.now()) / 60000)
  if (diff > 0 && diff <= 60) return { label: 'Em breve', style: 'border-amber-500/20 bg-amber-500/8 text-amber-400/70' }
  const imp = calcImportance(m)
  if (imp >= 80) return { label: 'Jogo relevante', style: 'border-cyan-500/15 bg-cyan-500/5 text-cyan-400/60' }
  const comp = m.competition.name.toLowerCase()
  if (comp.includes('brasil') || comp.includes('série')) return { label: 'Brasil', style: 'border-emerald-500/12 bg-emerald-500/5 text-emerald-400/50' }
  if (imp >= 60) return { label: 'Liga forte', style: 'border-white/[0.08] bg-white/[0.03] text-white/35' }
  if (finished) return { label: 'Encerrado', style: 'border-white/[0.06] bg-white/[0.02] text-white/25' }
  return { label: '', style: '' }
}

function isDominant(m: FDMatch): boolean {
  const { finished } = mapStatus(m.status)
  if (!finished || m.score.fullTime.home === null) return false
  return Math.abs((m.score.fullTime.home || 0) - (m.score.fullTime.away || 0)) >= 3
}

function isBrazil(m: FDMatch): boolean {
  return m.area?.name === 'Brazil' || m.competition.name.toLowerCase().includes('brasil')
}

function isEurope(m: FDMatch): boolean {
  return ['England', 'Spain', 'Germany', 'Italy', 'France', 'Netherlands', 'Portugal'].includes(m.area?.name || '')
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function MatchesPage() {
  const navigate = useNavigate()
  const [matches, setMatches] = useState<FDMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState(() => getTodayLocalDateKey())
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<ViewMode>('agenda')
  const isToday = date === getTodayLocalDateKey()
  const { isFavoriteTeam, isFavoriteLeague, isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const { isAdvanced } = useViewMode()

  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`/.netlify/functions/football-data-matches?date=${date}`, { cache: 'no-store' })
      .then(async r => {
        const j = await r.json()
        const raw: FDMatch[] = j.matches || []
        // Filter by local date to prevent timezone-shift bugs
        const localFiltered = raw.filter(m => {
          const onDate = isMatchOnSelectedLocalDate(m.utcDate, date)
          debugMatchDate(m.utcDate, date, m.homeTeam.shortName || m.homeTeam.name, m.awayTeam.shortName || m.awayTeam.name)
          return onDate
        })
        setMatches(localFiltered)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [date])

  const stats = useMemo(() => {
    const l = matches.filter(m => mapStatus(m.status).live).length
    const f = matches.filter(m => mapStatus(m.status).finished).length
    const u = matches.filter(m => mapStatus(m.status).upcoming).length
    const br = matches.filter(m => isBrazil(m)).length
    const eu = matches.filter(m => isEurope(m)).length
    const dominant = matches.filter(m => isDominant(m)).length
    const soon = matches.filter(m => { const d = Math.round((new Date(m.utcDate).getTime() - Date.now()) / 60000); return d > 0 && d <= 60 }).length
    const comps = new Set(matches.map(m => m.competition.name)).size
    const topComp = (() => { const counts = new Map<string, number>(); matches.forEach(m => counts.set(m.competition.name, (counts.get(m.competition.name) || 0) + 1)); let max = '', maxN = 0; counts.forEach((v, k) => { if (v > maxN) { max = k; maxN = v } }); return max ? translateComp(max) : '' })()
    return { total: matches.length, live: l, finished: f, upcoming: u, comps, br, eu, dominant, soon, topComp }
  }, [matches])

  const filtered = useMemo(() => {
    let list = matches
    if (search) {
      const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      list = list.filter(m => [m.homeTeam.shortName, m.homeTeam.name, m.awayTeam.shortName, m.awayTeam.name, m.competition.name].some(s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)))
    }
    switch (filter) {
      case 'live': return list.filter(m => mapStatus(m.status).live)
      case 'upcoming': return list.filter(m => mapStatus(m.status).upcoming)
      case 'finished': return list.filter(m => mapStatus(m.status).finished)
      case 'brazil': return list.filter(m => isBrazil(m))
      case 'europe': return list.filter(m => isEurope(m))
      case 'relevant': return list.filter(m => calcImportance(m) >= 70).sort((a, b) => calcImportance(b) - calcImportance(a))
      case 'soon': return list.filter(m => { const d = Math.round((new Date(m.utcDate).getTime() - Date.now()) / 60000); return d > 0 && d <= 60 })
      case 'dominant': return list.filter(m => isDominant(m))
      case 'favorites': return list.filter(m => isFavoriteMatch(buildCanonicalMatchId(m.homeTeam.shortName || m.homeTeam.name, m.awayTeam.shortName || m.awayTeam.name, m.utcDate)) || isFavoriteTeam(m.homeTeam.shortName || m.homeTeam.name) || isFavoriteTeam(m.awayTeam.shortName || m.awayTeam.name) || isFavoriteLeague(String(m.competition.name)))
      default: return list
    }
  }, [matches, filter, search])

  const grouped = useMemo(() => { const map = new Map<string, FDMatch[]>(); for (const m of filtered) { const k = m.competition.name; if (!map.has(k)) map.set(k, []); map.get(k)!.push(m) }; return map }, [filtered])
  const sidebarNext = useMemo(() => matches.filter(m => mapStatus(m.status).upcoming).sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()).slice(0, 4), [matches])
  const sidebarTop = useMemo(() => sortMatchesByImportance(matches).slice(0, 6), [matches])
  const mainMatch = useMemo(() => getMainGlobalMatch(matches), [matches])
  const brazilMatch = useMemo(() => getBrazilFeaturedMatch(matches), [matches])

  const shiftDate = (d: number) => { const dt = new Date(date + 'T12:00:00'); dt.setDate(dt.getDate() + d); const shifted = dt.toISOString().split('T')[0]; setDate(shifted) }

  const openMatch = (m: FDMatch) => {
    const { label, live } = mapStatus(m.status)
    const fx: LiveFixture = { id: m.id, provider: 'football_data', externalId: m.id, league: { id: 0, name: m.competition.name, logo: m.competition.emblem, country: m.area?.name || '', season: 2026 }, status: { long: label, short: live ? 'LIVE' : m.status === 'FINISHED' ? 'FT' : 'NS', elapsed: null }, homeTeam: { id: m.homeTeam.id, name: m.homeTeam.shortName || m.homeTeam.name, logo: m.homeTeam.crest }, awayTeam: { id: m.awayTeam.id, name: m.awayTeam.shortName || m.awayTeam.name, logo: m.awayTeam.crest }, score: { home: m.score.fullTime.home, away: m.score.fullTime.away }, venue: null, referee: null, date: m.utcDate, raw: m.status }
    storeFixtureForNavigation(fx)
    navigate(`/app/matches/${m.id}`, { state: { fixture: fx } })
  }

  const fmtDate = (d: string) => formatSelectedDateLabel(d)

  // ─── Leitura do dia (editorial) ──────────────────────────────────────────────
  const dailyReading = useMemo(() => {
    const phrases: { text: string; priority: number; action?: FilterKey }[] = []
    if (stats.topComp && stats.total > 3) phrases.push({ text: `${stats.topComp} concentra mais jogos hoje`, priority: 1 })
    if (stats.br > 0) phrases.push({ text: `Brasileirão tem ${stats.br} ${stats.br === 1 ? 'partida' : 'partidas'} no calendário`, priority: stats.br >= 3 ? 0 : 2, action: 'brazil' })
    if (stats.dominant > 0) phrases.push({ text: `${stats.dominant} ${stats.dominant === 1 ? 'jogo terminou' : 'jogos terminaram'} com placar dominante`, priority: 2, action: 'dominant' })
    if (stats.upcoming > 0) phrases.push({ text: `${stats.upcoming} ${stats.upcoming === 1 ? 'partida ainda vai' : 'partidas ainda vão'} começar`, priority: 3, action: 'upcoming' })
    if (stats.soon > 0) phrases.push({ text: `${stats.soon} ${stats.soon === 1 ? 'jogo começa' : 'jogos começam'} nos próximos 60 minutos`, priority: 1, action: 'soon' })
    if (stats.live > 0) phrases.push({ text: `${stats.live} ${stats.live === 1 ? 'jogo acontecendo' : 'jogos acontecendo'} agora`, priority: 0, action: 'live' })
    return phrases.sort((a, b) => a.priority - b.priority).slice(0, 4)
  }, [stats])

  return (
    <div className="max-w-[1440px] mx-auto flex gap-7">
      {/* MAIN CONTENT */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Header */}
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[22px] font-bold text-white tracking-tight">Central de Partidas</h1>
              <p className="text-[11px] text-white/25 mt-0.5">{stats.total} jogos · {stats.comps} competições · Dados em tempo real</p>
            </div>
            <div className="flex items-center gap-2">
              {!isToday && <button onClick={() => setDate(getTodayLocalDateKey())} className="px-3 py-1.5 rounded-xl text-[10px] font-medium text-cyan-400/70 border border-cyan-500/20 hover:bg-cyan-500/5 transition-colors">Hoje</button>}
              <div className="flex items-center rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1 gap-0.5">
                <ViewModeBtn active={view === 'agenda'} onClick={() => setView('agenda')} icon={<List size={13} />} label="Agenda" />
                <ViewModeBtn active={view === 'highlights'} onClick={() => setView('highlights')} icon={<LayoutGrid size={13} />} label="Destaques" />
                <ViewModeBtn active={view === 'compact'} onClick={() => setView('compact')} icon={<Rows3 size={13} />} label="Compacto" />
              </div>
            </div>
          </div>
          {/* Date nav */}
          <div className="flex items-center gap-2">
            <button onClick={() => shiftDate(-1)} className="p-2 rounded-xl hover:bg-white/[0.04] text-white/30 transition-colors"><ChevronLeft size={16} /></button>
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
              <Calendar size={13} className="text-white/25" />
              <span className="text-[12px] font-medium text-white/50 capitalize">{fmtDate(date)}</span>
            </div>
            <button onClick={() => shiftDate(1)} className="p-2 rounded-xl hover:bg-white/[0.04] text-white/30 transition-colors"><ChevronRight size={16} /></button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="ml-auto h-8 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 text-[10px] text-white/40 outline-none" />
          </div>
          {/* Stats strip */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {stats.live > 0 && <StatChip icon={<Activity size={11} />} text={`${stats.live} ao vivo`} variant="live" />}
            <StatChip icon={<CheckCircle2 size={11} />} text={`${stats.finished} encerrados`} />
            <StatChip icon={<Clock size={11} />} text={`${stats.upcoming} próximos`} />
            <StatChip icon={<BarChart3 size={11} />} text={`${stats.comps} ligas`} />
            {stats.br > 0 && <StatChip icon={<Globe2 size={11} />} text={`${stats.br} Brasil`} variant="brazil" />}
          </div>
        </header>

        {/* Search + Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar time, liga ou competição..." className="w-full h-10 rounded-2xl border border-white/[0.06] bg-white/[0.02] pl-10 pr-10 text-[12px] text-white placeholder:text-white/20 outline-none focus:border-white/[0.12] transition-colors" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40"><X size={14} /></button>}
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {([['all','Todos'],['live','Ao vivo'],['upcoming','Próximos'],['finished','Encerrados'],['relevant','Alta relevância'],['soon','Em breve'],['brazil','Brasil'],['europe','Europa'],['dominant','Placar definido'],['favorites','Favoritos']] as [FilterKey,string][]).map(([k,l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-medium transition-all ${filter === k ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 shadow-[0_0_12px_-4px_rgba(34,211,238,0.15)]' : 'text-white/30 hover:text-white/50 hover:bg-white/[0.03] border border-transparent'}`}>{l}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading && (
          <div className="space-y-4">
            <div className="h-12 w-48 rounded-xl bg-white/[0.03] animate-pulse" />
            {[1,2,3,4,5].map(i => (
              <div key={i} className="flex items-center gap-4 px-5 py-5 rounded-2xl bg-white/[0.015] border border-white/[0.03] animate-pulse">
                <div className="w-14 h-5 rounded-lg bg-white/[0.04]" />
                <div className="flex-1 flex items-center justify-end gap-3"><div className="h-4 w-24 rounded bg-white/[0.03]" /><div className="h-8 w-8 rounded-full bg-white/[0.04]" /></div>
                <div className="w-16 h-6 rounded bg-white/[0.04]" />
                <div className="flex-1 flex items-center gap-3"><div className="h-8 w-8 rounded-full bg-white/[0.04]" /><div className="h-4 w-24 rounded bg-white/[0.03]" /></div>
                <div className="w-20 h-5 rounded-lg bg-white/[0.03]" />
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="rounded-[20px] border border-rose-500/10 bg-rose-500/[0.03] p-6 text-center">
            <p className="text-[13px] text-rose-400/70 font-medium">Não foi possível carregar as partidas</p>
            <p className="text-[10px] text-white/20 mt-1">{error}</p>
            <button onClick={() => { setLoading(true); setError(null); fetch(`/.netlify/functions/football-data-matches?date=${date}`, { cache: 'no-store' }).then(async r => { const j = await r.json(); setMatches(j.matches || []) }).catch(e => setError(e.message)).finally(() => setLoading(false)) }} className="mt-3 px-4 py-1.5 rounded-xl text-[10px] font-medium text-cyan-400/70 border border-cyan-500/20 hover:bg-cyan-500/5 transition-colors">Tentar novamente</button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] py-16 text-center">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-white/[0.03] border border-white/[0.05] mb-4">
              <Search size={18} className="text-white/20" />
            </div>
            <p className="text-[14px] text-white/40 font-medium">Nenhuma partida encontrada</p>
            <p className="text-[11px] text-white/20 mt-1">{search ? 'Tente outra busca ou limpe o filtro.' : 'Sem jogos para esta data.'}</p>
            {(search || filter !== 'all') && (
              <button onClick={() => { setSearch(''); setFilter('all') }} className="mt-4 px-4 py-1.5 rounded-xl text-[10px] font-medium text-cyan-400/60 border border-cyan-500/15 hover:bg-cyan-500/5 transition-colors">Limpar filtros</button>
            )}
          </div>
        )}

        {/* HIGHLIGHTS MODE */}
        {!loading && view === 'highlights' && filtered.length > 0 && <HighlightsView matches={filtered} openMatch={openMatch} />}

        {/* COMPACT MODE */}
        {!loading && view === 'compact' && filtered.length > 0 && (
          <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] overflow-hidden">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-[76px_1fr_64px_1fr_120px_32px] items-center px-5 py-2.5 bg-white/[0.015] border-b border-white/[0.06]">
              <span className="text-[10px] uppercase tracking-[0.16em] text-white/25 font-semibold">Horário</span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-white/25 font-semibold text-right pr-3">Mandante</span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-white/25 font-semibold text-center">Placar</span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-white/25 font-semibold pl-3">Visitante</span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-white/25 font-semibold text-right">Competição</span>
              <span></span>
            </div>
            {filtered.map(m => <CompactRow key={m.id} match={m} onClick={() => openMatch(m)} />)}
          </div>
        )}

        {/* AGENDA MODE */}
        {!loading && view === 'agenda' && filtered.length > 0 && (
          <div className="space-y-7">
            {Array.from(grouped.entries()).map(([comp, items]) => {
              const live = items.filter(i => mapStatus(i.status).live).length
              const fin = items.filter(i => mapStatus(i.status).finished).length
              const upc = items.filter(i => mapStatus(i.status).upcoming).length
              const country = getCountry(items[0])
              return (
                <section key={comp}>
                  <CompetitionHeader emblem={items[0].competition.emblem} name={translateComp(comp)} country={country} total={items.length} live={live} finished={fin} upcoming={upc} />
                  <div className="rounded-[20px] border border-white/[0.05] bg-white/[0.012] overflow-hidden">
                    {items.map((m, idx) => <AgendaRow key={m.id} match={m} onClick={() => openMatch(m)} isLast={idx === items.length - 1} />)}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* SIDEBAR (desktop) — scrolls with the page, no internal scroll */}
      <aside className="hidden xl:block w-[360px] shrink-0 space-y-5 sticky top-20 self-start">
        {/* Leitura do dia - editorial */}
        {dailyReading.length > 0 && !loading && <DailyReadingPanel phrases={dailyReading} total={stats.total} comps={stats.comps} setFilter={setFilter} />}

        {/* Jogo principal do dia (global) */}
        {mainMatch && !loading && <FeaturedMatchCard match={mainMatch} openMatch={openMatch} />}

        {/* Brasil em destaque (only if main is not Brazilian) */}
        {brazilMatch && !loading && mainMatch && mainMatch.id !== brazilMatch.id && (
          <BrazilFeaturedCard match={brazilMatch} openMatch={openMatch} />
        )}

        {/* Seus favoritos hoje */}
        {!loading && (() => {
          const favMatches = matches.filter(m => isFavoriteTeam(m.homeTeam.shortName || m.homeTeam.name) || isFavoriteTeam(m.awayTeam.shortName || m.awayTeam.name) || isFavoriteMatch(buildCanonicalMatchId(m.homeTeam.shortName || m.homeTeam.name, m.awayTeam.shortName || m.awayTeam.name, m.utcDate)))
          if (favMatches.length === 0) return null
          return (
            <div className="rounded-[20px] border border-rose-500/10 bg-rose-500/[0.02] p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-rose-400/50">Seus favoritos hoje</h4>
                <button onClick={() => setFilter('favorites')} className="text-[9px] text-rose-400/40 hover:text-rose-400/70 font-medium transition-colors">Ver todos →</button>
              </div>
              <div className="space-y-2">
                {favMatches.slice(0, 3).map(m => {
                  const { live } = mapStatus(m.status)
                  const time = formatMatchTime(m.utcDate)
                  return (
                    <div key={m.id} onClick={() => openMatch(m)} className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/[0.03] cursor-pointer transition-colors">
                      <span className="text-[11px] tabular-nums text-white/40 w-10 shrink-0">{live ? <span className="text-emerald-400 font-bold text-[9px]">LIVE</span> : time}</span>
                      <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={20} />
                      <span className="text-[10px] text-white/55 flex-1 truncate">{m.homeTeam.shortName} x {m.awayTeam.shortName}</span>
                      <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={20} />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Próximos jogos — max 3 cards */}
        {sidebarNext.length > 0 && !loading && (
          <div className="rounded-[20px] border border-white/[0.05] bg-white/[0.015] p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/30">Próximos jogos</h4>
              {sidebarNext.length > 3 && <button onClick={() => setFilter('upcoming')} className="text-[9px] text-cyan-400/40 hover:text-cyan-400/70 font-medium transition-colors">Ver todos →</button>}
            </div>
            <div className="space-y-2">
              {sidebarNext.slice(0, 3).map(m => <SidebarNextCard key={m.id} match={m} onClick={() => openMatch(m)} />)}
            </div>
          </div>
        )}

        {/* Mais relevantes — only in highlights mode */}
        {sidebarTop.length > 1 && !loading && view === 'highlights' && (
          <div className="rounded-[20px] border border-white/[0.05] bg-white/[0.015] p-5">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/30 mb-4">Mais relevantes</h4>
            <div className="space-y-2">
              {sidebarTop.slice(1, 4).map((m, i) => <SidebarRelevantCard key={m.id} match={m} rank={i + 2} onClick={() => openMatch(m)} />)}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}


// ─── Sub-components ──────────────────────────────────────────────────────────

function ViewModeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`group relative px-3.5 py-2 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all ${active ? 'bg-white/[0.1] text-white/80 shadow-[0_2px_10px_-3px_rgba(255,255,255,0.06)]' : 'text-white/25 hover:text-white/50'}`}>
      {icon}{label}
    </button>
  )
}

function StatChip({ icon, text, variant }: { icon: React.ReactNode; text: string; variant?: 'live' | 'brazil' }) {
  const base = variant === 'live' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : variant === 'brazil' ? 'border-cyan-500/15 bg-cyan-500/5 text-cyan-400/70' : 'border-white/[0.05] bg-white/[0.02] text-white/30'
  return <span className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-medium ${base}`}>{icon}{text}</span>
}


// ─── Daily Reading Panel (editorial) ─────────────────────────────────────────

function DailyReadingPanel({ phrases, total, comps, setFilter }: { phrases: { text: string; priority: number; action?: FilterKey }[]; total: number; comps: number; setFilter: (f: FilterKey) => void }) {
  return (
    <div className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.04] via-white/[0.01] to-transparent p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[120px] h-[120px] bg-cyan-500/[0.03] rounded-full blur-[50px]" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={14} className="text-cyan-400/60" />
          <h4 className="text-[12px] font-bold text-white/55">O que importa hoje</h4>
        </div>
        {/* Principal insight */}
        {phrases[0] && (
          <p onClick={() => phrases[0].action && setFilter(phrases[0].action)} className={`text-[13px] font-semibold text-white/65 leading-relaxed mb-3 ${phrases[0].action ? 'cursor-pointer hover:text-white/80 transition-colors' : ''}`}>
            {phrases[0].text}
            {phrases[0].action && <span className="text-[9px] text-cyan-400/40 ml-2">→ filtrar</span>}
          </p>
        )}
        {/* Secondary insights */}
        {phrases.length > 1 && (
          <div className="space-y-2 pt-3 border-t border-white/[0.04]">
            {phrases.slice(1).map((p, i) => (
              <p key={i} onClick={() => p.action && setFilter(p.action)} className={`text-[11px] text-white/40 leading-relaxed flex items-start gap-2 ${p.action ? 'cursor-pointer hover:text-white/60 transition-colors' : ''}`}>
                <span className="text-cyan-400/40 mt-0.5 shrink-0">&#8226;</span>
                <span className="flex-1">{p.text}</span>
                {p.action && <span className="text-[8px] text-cyan-400/30 shrink-0 self-center">→</span>}
              </p>
            ))}
          </div>
        )}
        <p className="text-[9px] text-white/20 mt-3">{total} jogos em {comps} {comps === 1 ? 'competição' : 'competições'}</p>
      </div>
    </div>
  )
}

// ─── Competition Header (premium, strong) ────────────────────────────────────

function CompetitionHeader({ emblem, name, country, total, live, finished, upcoming }: { emblem: string | null; name: string; country: string; total: number; live: number; finished: number; upcoming: number }) {
  return (
    <div className="flex items-center gap-4 mb-3 px-2">
      {/* Logo box with glow */}
      <div className="relative flex items-center justify-center h-11 w-11 rounded-[14px] bg-gradient-to-b from-white/[0.05] to-white/[0.02] border border-white/[0.08] shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)]">
        {emblem ? (
          <img src={emblem} alt="" className="h-7 w-7 object-contain" />
        ) : (
          <Trophy size={18} className="text-white/25" />
        )}
        <div className="absolute inset-0 rounded-[14px] bg-white/[0.02]" />
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[14px] font-bold text-white/75">{name}</h3>
          {country && (
            <span className="text-[9px] text-white/30 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-md font-medium">{country}</span>
          )}
        </div>
        {/* Pills */}
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[9px] text-white/25 bg-white/[0.03] border border-white/[0.05] px-2 py-0.5 rounded-md">{total} {total === 1 ? 'jogo' : 'jogos'}</span>
          {live > 0 && <span className="text-[9px] text-emerald-400/70 bg-emerald-500/8 border border-emerald-500/15 px-2 py-0.5 rounded-md flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />{live} ao vivo</span>}
          {finished > 0 && <span className="text-[9px] text-white/20 bg-white/[0.02] border border-white/[0.04] px-2 py-0.5 rounded-md">{finished} enc.</span>}
          {upcoming > 0 && <span className="text-[9px] text-white/20 bg-white/[0.02] border border-white/[0.04] px-2 py-0.5 rounded-md">{upcoming} próx.</span>}
        </div>
      </div>
    </div>
  )
}

// ─── Featured Match Card (Jogo principal - premium) ──────────────────────────

function FeaturedMatchCard({ match: m, openMatch }: { match: FDMatch; openMatch: (m: FDMatch) => void }) {
  const { label, live, finished } = mapStatus(m.status)
  const imp = calcImportance(m)
  const reason = imp >= 100 ? 'Jogo principal do dia' : m.competition.name.toLowerCase().includes('brasil') ? 'Brasileirão em destaque' : live ? 'Ao vivo agora' : 'Mais relevante do dia'
  const time = formatMatchTime(m.utcDate)
  const statusText = live ? (label || 'Ao vivo') : finished ? 'Encerrado' : `${time} · Agendado`

  return (
    <div onClick={() => openMatch(m)} className="group rounded-[20px] border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.05] via-transparent to-violet-500/[0.02] p-6 cursor-pointer hover:border-cyan-500/30 hover:shadow-[0_16px_50px_-16px_rgba(34,211,238,0.1)] transition-all relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[100px] bg-cyan-500/[0.04] rounded-full blur-[60px]" />
      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Zap size={12} className="text-cyan-400/70" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400/70">{reason}</span>
          </div>
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg ${live ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : finished ? 'bg-white/[0.03] text-white/30 border border-white/[0.06]' : 'text-white/30'}`}>
            {live && <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5" />}
            {statusText}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-2.5 w-[100px]">
            <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={54} />
            <span className="text-[11px] font-bold text-white/70 text-center leading-tight">{m.homeTeam.shortName}</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-baseline gap-3">
              <span className="text-[36px] font-bold tabular-nums text-white">{m.score.fullTime.home ?? '-'}</span>
              <span className="text-[14px] text-white/10">:</span>
              <span className="text-[36px] font-bold tabular-nums text-white">{m.score.fullTime.away ?? '-'}</span>
            </div>
            {live && <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />}
          </div>
          <div className="flex flex-col items-center gap-2.5 w-[100px]">
            <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={54} />
            <span className="text-[11px] font-bold text-white/50 text-center leading-tight">{m.awayTeam.shortName}</span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-5 pt-3 border-t border-white/[0.05]">
          <div className="flex items-center gap-2.5">
            {m.competition.emblem && <img src={m.competition.emblem} alt="" className="h-5 w-5 object-contain opacity-60" />}
            <span className="text-[11px] text-white/30 font-medium">{translateComp(m.competition.name)}</span>
          </div>
          <span className="text-[10px] text-cyan-400/50 group-hover:text-cyan-400/90 font-bold transition-colors flex items-center gap-1.5">
            Analisar partida <TrendingUp size={11} />
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Brazil Featured Card (sidebar) ─────────────────────────────────────────

function BrazilFeaturedCard({ match: m, openMatch }: { match: FDMatch; openMatch: (m: FDMatch) => void }) {
  const { label, live, finished } = mapStatus(m.status)
  const time = formatMatchTime(m.utcDate)
  const statusText = live ? (label || 'Ao vivo') : finished ? 'Encerrado' : `${time}`

  return (
    <div onClick={() => openMatch(m)} className="group rounded-[18px] border border-emerald-500/10 bg-gradient-to-br from-emerald-500/[0.03] via-transparent to-transparent p-5 cursor-pointer hover:border-emerald-500/20 hover:shadow-[0_8px_30px_-10px_rgba(52,211,153,0.06)] transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe2 size={11} className="text-emerald-400/60" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400/60">Brasil em destaque</span>
        </div>
        <span className={`text-[9px] font-semibold ${live ? 'text-emerald-400' : 'text-white/25'}`}>{statusText}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={32} />
          <span className="text-[11px] font-bold text-white/65">{m.homeTeam.shortName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[18px] font-bold tabular-nums text-white/80">{m.score.fullTime.home ?? '-'}</span>
          <span className="text-[10px] text-white/10">:</span>
          <span className="text-[18px] font-bold tabular-nums text-white/80">{m.score.fullTime.away ?? '-'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-white/50">{m.awayTeam.shortName}</span>
          <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={32} />
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-[9px] text-white/20">{translateComp(m.competition.name)}</span>
        <span className="text-[9px] text-emerald-400/40 group-hover:text-emerald-400/70 font-medium transition-colors">Analisar →</span>
      </div>
    </div>
  )
}

// ─── Sidebar Next Card (mini-card style) ─────────────────────────────────────

function SidebarNextCard({ match: m, onClick }: { match: FDMatch; onClick: () => void }) {
  const time = formatMatchTime(m.utcDate)
  const diffMin = Math.round((new Date(m.utcDate).getTime() - Date.now()) / 60000)
  const soon = diffMin > 0 && diffMin <= 60
  const comp = m.competition.name.toLowerCase()
  const contextBadge = soon ? { label: 'Em breve', style: 'text-amber-400/80 bg-amber-500/10 border-amber-500/15' }
    : (comp.includes('brasil') || comp.includes('série')) ? { label: 'Brasil', style: 'text-emerald-400/60 bg-emerald-500/8 border-emerald-500/12' }
    : (comp.includes('premier') || comp.includes('champions') || comp.includes('bundesliga')) ? { label: 'Liga forte', style: 'text-white/35 bg-white/[0.03] border-white/[0.06]' }
    : calcImportance(m) >= 45 ? { label: 'Relevante', style: 'text-cyan-400/50 bg-cyan-500/5 border-cyan-500/12' }
    : null

  return (
    <div onClick={onClick} className="group rounded-[14px] border border-white/[0.04] hover:border-white/[0.12] bg-white/[0.01] hover:bg-white/[0.03] p-3.5 cursor-pointer transition-all hover:shadow-[0_6px_20px_-8px_rgba(0,0,0,0.4)]">
      <div className="flex items-center gap-3">
        {/* Time block */}
        <div className="w-14 shrink-0 text-center">
          <span className="text-[15px] font-bold tabular-nums text-white/50 block">{time}</span>
        </div>
        {/* Teams stacked */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2.5">
            <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={24} />
            <span className="text-[11px] font-semibold text-white/70 truncate">{m.homeTeam.shortName}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={24} />
            <span className="text-[11px] font-semibold text-white/50 truncate">{m.awayTeam.shortName}</span>
          </div>
        </div>
        {/* Competition + Badge + CTA */}
        <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            {m.competition.emblem && <img src={m.competition.emblem} alt="" className="h-4 w-4 object-contain opacity-50" />}
          </div>
          <span className="text-[8px] text-white/20">{translateComp(m.competition.name)}</span>
          {contextBadge && <span className={`text-[7px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md border ${contextBadge.style}`}>{contextBadge.label}</span>}
          <span className="text-[8px] text-cyan-400/0 group-hover:text-cyan-400/70 font-semibold transition-colors">Analisar →</span>
        </div>
      </div>
    </div>
  )
}

// ─── Sidebar Relevant Card ───────────────────────────────────────────────────

function SidebarRelevantCard({ match: m, rank, onClick }: { match: FDMatch; rank: number; onClick: () => void }) {
  const { live, finished } = mapStatus(m.status)
  const reason = getRelevanceReason(m)
  const badge = getRelevanceBadge(m)
  const time = formatMatchTime(m.utcDate)

  return (
    <div onClick={onClick} className="group rounded-[14px] border border-white/[0.04] hover:border-white/[0.1] bg-white/[0.01] hover:bg-white/[0.025] p-3.5 cursor-pointer transition-all hover:shadow-[0_4px_16px_-6px_rgba(0,0,0,0.3)]">
      <div className="flex items-center gap-3">
        {/* Rank */}
        <div className="w-7 shrink-0 flex flex-col items-center">
          <span className="text-[13px] font-bold text-cyan-400/40">#{rank}</span>
        </div>
        {/* Teams + score */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={26} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-white/60 truncate">{m.homeTeam.shortName}</span>
              <span className="text-[14px] font-bold tabular-nums text-white/70">{m.score.fullTime.home ?? '-'}</span>
              <span className="text-[9px] text-white/10">:</span>
              <span className="text-[14px] font-bold tabular-nums text-white/70">{m.score.fullTime.away ?? '-'}</span>
              <span className="text-[11px] font-semibold text-white/45 truncate">{m.awayTeam.shortName}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] text-white/20">{reason}</span>
              {!live && !finished && <span className="text-[8px] text-white/15 tabular-nums">{time}</span>}
            </div>
          </div>
          <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={26} />
        </div>
        {/* Badge + CTA */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          {badge.label && <span className={`text-[8px] px-2 py-0.5 rounded-md border font-medium ${badge.style}`}>{badge.label}</span>}
          <span className="text-[8px] text-cyan-400/0 group-hover:text-cyan-400/60 font-medium transition-colors">Analisar</span>
        </div>
      </div>
    </div>
  )
}


// ─── Agenda Row (premium, not a table) ───────────────────────────────────────

function AgendaRow({ match: m, onClick, isLast }: { match: FDMatch; onClick: () => void; isLast: boolean }) {
  const { live, finished } = mapStatus(m.status)
  const time = formatMatchTime(m.utcDate)
  const diffMin = Math.round((new Date(m.utcDate).getTime() - Date.now()) / 60000)
  const soon = diffMin > 0 && diffMin <= 60
  const insightBadge = getInsightBadge(m)
  const imp = calcImportance(m)
  const { isFavoriteMatch: isFavMatch, toggleFavoriteMatch: toggleFav, isFavoriteTeam: isFavTeam } = useFavorites()
  const { isAdvanced } = useViewMode()
  const matchId = buildCanonicalMatchId(m.homeTeam.shortName || m.homeTeam.name, m.awayTeam.shortName || m.awayTeam.name, m.utcDate)
  const isFav = isFavMatch(matchId) || isFavTeam(m.homeTeam.shortName || m.homeTeam.name) || isFavTeam(m.awayTeam.shortName || m.awayTeam.name)
  // Micro-text only for relevant matches
  const microText = (() => {
    if (imp < 40) return ''
    const comp = m.competition.name.toLowerCase()
    if (live) return ''
    if (finished && isDominant(m)) return 'Placar dominante'
    if (comp.includes('brasil') || comp.includes('série')) return finished ? 'Brasileirão · Encerrado' : 'Brasileirão'
    if (soon) return 'Analisar pré-jogo'
    if (comp.includes('premier') || comp.includes('champions') || comp.includes('bundesliga')) return 'Liga forte'
    return ''
  })()

  return (
    <div onClick={onClick} className={`group flex items-center gap-4 px-5 py-[18px] cursor-pointer transition-all hover:bg-white/[0.04] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] ${live ? 'bg-emerald-500/[0.02]' : ''} ${isFav ? 'border-l-2 border-l-cyan-500/30' : ''} ${!isLast ? 'border-b border-white/[0.03]' : ''}`}>
      {/* Status/Time */}
      <div className="w-[70px] shrink-0 text-center">
        {live ? (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/15">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-400">Ao vivo</span>
          </div>
        ) : finished ? (
          <span className="inline-block text-[10px] font-medium text-white/30 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04]">Enc.</span>
        ) : (
          <div>
            <span className="text-[13px] font-bold tabular-nums text-white/55 block">{time}</span>
            {soon && <span className="text-[8px] font-bold text-amber-400/80 mt-0.5 block">Em breve</span>}
          </div>
        )}
      </div>

      {/* Home team */}
      <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
        <span className="text-[13px] font-semibold text-white/80 truncate text-right">{m.homeTeam.shortName || m.homeTeam.name}</span>
        <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.name} size={30} />
      </div>

      {/* Score */}
      <div className="flex items-center gap-2.5 min-w-[64px] justify-center">
        <span className={`text-[20px] font-bold tabular-nums ${live ? 'text-white' : 'text-white/75'}`}>{m.score.fullTime.home ?? '-'}</span>
        <span className="text-[11px] text-white/12 font-light">:</span>
        <span className={`text-[20px] font-bold tabular-nums ${live ? 'text-white' : 'text-white/75'}`}>{m.score.fullTime.away ?? '-'}</span>
      </div>

      {/* Away team */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.name} size={30} />
        <span className="text-[13px] font-semibold text-white/60 truncate">{m.awayTeam.shortName || m.awayTeam.name}</span>
      </div>

      {/* Insight + micro-text + CTA + Favorite */}
      <div className="hidden md:flex items-center gap-2 shrink-0 w-[240px] justify-end">
        {isAdvanced && <span className="text-[8px] tabular-nums text-white/15 font-mono" title={`Score: ${imp}`}>{imp}</span>}
        {insightBadge.label && (
          <span className={`text-[9px] px-2.5 py-1 rounded-lg border font-medium ${insightBadge.style}`}>{insightBadge.label}</span>
        )}
        {!insightBadge.label && microText && (
          <span className="text-[9px] text-white/25 italic">{microText}</span>
        )}
        <FavoriteButton active={isFav} onClick={() => toggleFav({ canonicalMatchId: matchId, homeTeam: m.homeTeam.shortName || m.homeTeam.name, awayTeam: m.awayTeam.shortName || m.awayTeam.name, competition: m.competition.name, utcDate: m.utcDate })} size={13} />
        <span className="text-[9px] text-cyan-400/0 group-hover:text-cyan-400/70 font-semibold transition-all group-hover:translate-x-0 translate-x-1">Analisar →</span>
      </div>
    </div>
  )
}

// ─── Compact Row ─────────────────────────────────────────────────────────────

function CompactRow({ match: m, onClick }: { match: FDMatch; onClick: () => void }) {
  const { live, finished } = mapStatus(m.status)
  const time = formatMatchTime(m.utcDate)
  const { isFavoriteMatch: isFavMatch, toggleFavoriteMatch: toggleFav, isFavoriteTeam: isFavTeam } = useFavorites()
  const matchId = buildCanonicalMatchId(m.homeTeam.shortName || m.homeTeam.name, m.awayTeam.shortName || m.awayTeam.name, m.utcDate)
  const isFav = isFavMatch(matchId) || isFavTeam(m.homeTeam.shortName || m.homeTeam.name) || isFavTeam(m.awayTeam.shortName || m.awayTeam.name)
  return (
    <div onClick={onClick} className={`grid grid-cols-[76px_1fr_64px_1fr_120px_32px] sm:grid-cols-[76px_1fr_64px_1fr_120px_32px] items-center px-5 min-h-[52px] cursor-pointer hover:bg-white/[0.035] transition-colors border-b border-white/[0.055] last:border-b-0 ${isFav ? 'border-l-2 border-l-cyan-500/30' : ''}`}>
      {/* Time/Status */}
      <div className="text-center">
        {live ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-bold text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />AO VIVO</span>
        ) : finished ? (
          <span className="text-[12px] font-semibold text-white/30">FIM</span>
        ) : (
          <span className="text-[13px] font-semibold tabular-nums text-white/55">{time}</span>
        )}
      </div>
      {/* Home team */}
      <div className="flex items-center gap-2.5 justify-end pr-3 min-w-0">
        <span className="text-[13px] font-medium text-white/80 truncate text-right">{m.homeTeam.shortName}</span>
        <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={24} />
      </div>
      {/* Score */}
      <div className="flex items-center justify-center gap-1.5">
        <span className={`text-[15px] font-bold tabular-nums ${live ? 'text-white' : 'text-white/80'}`}>{m.score.fullTime.home ?? '-'}</span>
        <span className="text-[10px] text-white/15">:</span>
        <span className={`text-[15px] font-bold tabular-nums ${live ? 'text-white' : 'text-white/80'}`}>{m.score.fullTime.away ?? '-'}</span>
      </div>
      {/* Away team */}
      <div className="flex items-center gap-2.5 pl-3 min-w-0">
        <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={24} />
        <span className="text-[13px] font-medium text-white/65 truncate">{m.awayTeam.shortName}</span>
      </div>
      {/* Competition */}
      <div className="text-right min-w-0">
        <span className="text-[11px] text-white/35 truncate block">{translateComp(m.competition.name)}</span>
      </div>
      {/* Favorite */}
      <div className="flex justify-center">
        <FavoriteButton active={isFav} onClick={() => toggleFav({ canonicalMatchId: matchId, homeTeam: m.homeTeam.shortName || m.homeTeam.name, awayTeam: m.awayTeam.shortName || m.awayTeam.name, competition: m.competition.name, utcDate: m.utcDate })} size={12} />
      </div>
    </div>
  )
}

// ─── Highlights View (editorial, visual separation) ──────────────────────────

function HighlightsView({ matches, openMatch }: { matches: FDMatch[]; openMatch: (m: FDMatch) => void }) {
  const sorted = useMemo(() => [...matches].sort((a, b) => calcImportance(b) - calcImportance(a)), [matches])
  const hero = sorted[0]
  const rest = sorted.slice(1)

  const brazil = rest.filter(m => isBrazil(m))
  const europe = rest.filter(m => isEurope(m) && !isBrazil(m))
  const fin = rest.filter(m => mapStatus(m.status).finished && !isBrazil(m) && !isEurope(m))
  const upcoming = rest.filter(m => mapStatus(m.status).upcoming && !isBrazil(m) && !isEurope(m))
  const other = rest.filter(m => !brazil.includes(m) && !europe.includes(m) && !fin.includes(m) && !upcoming.includes(m))

  return (
    <div className="space-y-7">
      {/* Hero */}
      {hero && <HeroHighlightCard match={hero} onClick={() => openMatch(hero)} />}

      {brazil.length > 0 && <HighlightSection title="Brasil" icon={<Globe2 size={13} className="text-emerald-400/50" />} matches={brazil} openMatch={openMatch} />}
      {europe.length > 0 && <HighlightSection title="Europa" icon={<Trophy size={13} className="text-violet-400/50" />} matches={europe} openMatch={openMatch} />}
      {fin.length > 0 && <HighlightSection title="Encerrados" icon={<CheckCircle2 size={13} className="text-white/25" />} matches={fin} openMatch={openMatch} />}
      {upcoming.length > 0 && <HighlightSection title="Próximos" icon={<Clock size={13} className="text-white/25" />} matches={upcoming} openMatch={openMatch} />}
      {other.length > 0 && <HighlightSection title="Outros" icon={<BarChart3 size={13} className="text-white/20" />} matches={other} openMatch={openMatch} />}
    </div>
  )
}

function HeroHighlightCard({ match: m, onClick }: { match: FDMatch; onClick: () => void }) {
  const { label, live, finished } = mapStatus(m.status)
  const insight = getInsight(m)
  const imp = calcImportance(m)
  const reason = imp >= 100 ? 'Jogo principal do dia' : live ? 'Ao vivo agora' : getRelevanceReason(m)
  const time = formatMatchTime(m.utcDate)

  return (
    <div onClick={onClick} className="group relative rounded-[24px] border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.05] via-transparent to-violet-500/[0.03] p-8 cursor-pointer hover:border-cyan-500/30 hover:shadow-[0_20px_60px_-20px_rgba(34,211,238,0.12)] transition-all overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[120px] bg-cyan-500/[0.04] rounded-full blur-[60px]" />
      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Zap size={13} className="text-cyan-400/70" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400/70">{reason}</span>
          </div>
          <span className={`text-[10px] font-semibold ${live ? 'text-emerald-400' : 'text-white/25'}`}>{live ? label : finished ? 'Encerrado' : time}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-3 w-[110px]">
            <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={60} />
            <span className="text-[12px] font-bold text-white/75 text-center leading-tight">{m.homeTeam.shortName}</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-baseline gap-4">
              <span className="text-[44px] font-bold tabular-nums text-white">{m.score.fullTime.home ?? '-'}</span>
              <span className="text-[18px] text-white/10">:</span>
              <span className="text-[44px] font-bold tabular-nums text-white">{m.score.fullTime.away ?? '-'}</span>
            </div>
            {live && <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />}
            {insight && <span className="text-[10px] text-white/30 italic mt-1">{insight}</span>}
          </div>
          <div className="flex flex-col items-center gap-3 w-[110px]">
            <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={60} />
            <span className="text-[12px] font-bold text-white/50 text-center leading-tight">{m.awayTeam.shortName}</span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-6 pt-3 border-t border-white/[0.05]">
          <div className="flex items-center gap-2.5">
            {m.competition.emblem && <img src={m.competition.emblem} alt="" className="h-5 w-5 object-contain opacity-60" />}
            <span className="text-[11px] text-white/30 font-medium">{translateComp(m.competition.name)}</span>
          </div>
          <span className="text-[10px] text-cyan-400/50 group-hover:text-cyan-400/90 font-bold transition-colors flex items-center gap-1.5">
            Analisar partida <TrendingUp size={11} />
          </span>
        </div>
      </div>
    </div>
  )
}

function HighlightSection({ title, icon, matches, openMatch }: { title: string; icon: React.ReactNode; matches: FDMatch[]; openMatch: (m: FDMatch) => void }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3 px-1">
        {icon}
        <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/35">{title}</h3>
        <div className="flex-1 h-px bg-white/[0.04]" />
        <span className="text-[9px] text-white/15">{matches.length} {matches.length === 1 ? 'jogo' : 'jogos'}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {matches.map(m => <HighlightCard key={m.id} match={m} onClick={() => openMatch(m)} />)}
      </div>
    </div>
  )
}

function HighlightCard({ match: m, onClick }: { match: FDMatch; onClick: () => void }) {
  const { label, live, finished } = mapStatus(m.status)
  const insight = getInsight(m)
  const reason = getRelevanceReason(m)
  const time = formatMatchTime(m.utcDate)
  const { isFavoriteMatch: isFavMatch, toggleFavoriteMatch: toggleFav, isFavoriteTeam: isFavTeam } = useFavorites()
  const matchId = buildCanonicalMatchId(m.homeTeam.shortName || m.homeTeam.name, m.awayTeam.shortName || m.awayTeam.name, m.utcDate)
  const isFav = isFavMatch(matchId) || isFavTeam(m.homeTeam.shortName || m.homeTeam.name) || isFavTeam(m.awayTeam.shortName || m.awayTeam.name)

  return (
    <div onClick={onClick} className={`group rounded-[18px] border ${isFav ? 'border-cyan-500/20' : 'border-white/[0.05]'} bg-gradient-to-b from-white/[0.03] to-transparent p-5 cursor-pointer hover:border-white/[0.12] hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.4)] transition-all`}>
      <div className="flex items-center justify-between mb-3.5">
        <span className="text-[9px] font-semibold text-white/25 uppercase tracking-wider">{reason}</span>
        <div className="flex items-center gap-1.5">
          <FavoriteButton active={isFav} onClick={() => toggleFav({ canonicalMatchId: matchId, homeTeam: m.homeTeam.shortName || m.homeTeam.name, awayTeam: m.awayTeam.shortName || m.awayTeam.name, competition: m.competition.name, utcDate: m.utcDate })} size={12} />
          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${live ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'text-white/20'}`}>
            {live && <span className="inline-block h-1 w-1 rounded-full bg-emerald-400 animate-pulse mr-1" />}
            {live ? label : finished ? 'Enc.' : time}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={30} />
          <span className="text-[12px] font-bold text-white/70">{m.homeTeam.shortName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[22px] font-bold tabular-nums text-white">{m.score.fullTime.home ?? '-'}</span>
          <span className="text-[11px] text-white/10">:</span>
          <span className="text-[22px] font-bold tabular-nums text-white">{m.score.fullTime.away ?? '-'}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[12px] font-bold text-white/50">{m.awayTeam.shortName}</span>
          <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={30} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-white/20">{translateComp(m.competition.name)}</span>
        {insight && <span className="text-[9px] text-white/25 italic">{insight}</span>}
      </div>
      <span className="block text-[9px] text-cyan-400/0 group-hover:text-cyan-400/60 mt-2.5 font-semibold transition-colors">Analisar →</span>
    </div>
  )
}
