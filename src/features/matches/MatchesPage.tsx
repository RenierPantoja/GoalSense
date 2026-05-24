import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, ChevronLeft, ChevronRight, Search, X, Activity, Clock, CheckCircle2, BarChart3, LayoutGrid, List, Rows3 } from 'lucide-react'
import { ClubLogo } from '@/components/ui/ClubLogo'
import { storeFixtureForNavigation } from '@/lib/matchNavigation'
import type { LiveFixture } from '@/lib/apiClient'

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

type FilterKey = 'all' | 'live' | 'upcoming' | 'finished' | 'brazil' | 'europe' | 'relevant'
type ViewMode = 'agenda' | 'highlights' | 'compact'

function mapStatus(s: string) {
  if (s === 'IN_PLAY' || s === 'LIVE') return { label: 'Ao vivo', live: true, finished: false, upcoming: false }
  if (s === 'PAUSED') return { label: 'Intervalo', live: true, finished: false, upcoming: false }
  if (s === 'FINISHED') return { label: 'Encerrado', live: false, finished: true, upcoming: false }
  if (s === 'TIMED' || s === 'SCHEDULED') return { label: 'Agendado', live: false, finished: false, upcoming: true }
  if (s === 'POSTPONED') return { label: 'Adiado', live: false, finished: false, upcoming: false }
  return { label: s, live: false, finished: false, upcoming: true }
}

function translateComp(name: string): string {
  const m: Record<string, string> = { 'campeonato brasileiro série a': 'Brasileirão Série A', 'brazilian serie a': 'Brasileirão Série A', 'serie a': 'Serie A', 'primera division': 'La Liga', 'premier league': 'Premier League', 'ligue 1': 'Ligue 1', 'bundesliga': 'Bundesliga' }
  return m[name.toLowerCase()] || name
}

function calcImportance(m: FDMatch): number {
  let s = 0
  const { live, finished } = mapStatus(m.status)
  if (live) s += 30
  const comp = m.competition.name.toLowerCase()
  if (comp.includes('série a') || comp.includes('serie a') || comp.includes('brasileiro')) s += 25
  if (comp.includes('premier') || comp.includes('champions') || comp.includes('bundesliga') || comp.includes('ligue 1')) s += 20
  const diffMin = Math.round((new Date(m.utcDate).getTime() - Date.now()) / 60000)
  if (diffMin > 0 && diffMin <= 60) s += 10
  if (finished && m.score.fullTime.home !== null) { const d = Math.abs((m.score.fullTime.home||0) - (m.score.fullTime.away||0)); if (d >= 3) s += 15 }
  if (live && m.score.fullTime.home !== null && ((m.score.fullTime.home||0)+(m.score.fullTime.away||0)) >= 4) s += 15
  return s
}

function getInsight(m: FDMatch): string {
  const { live, finished } = mapStatus(m.status)
  const h = m.score.fullTime.home, a = m.score.fullTime.away
  if (live && h !== null && a !== null && (h+a) >= 4) return 'Jogo de muitos gols.'
  if (live) return 'Em andamento.'
  if (finished && h !== null && a !== null) { if (Math.abs(h-a) >= 3) return 'Placar dominante.'; if (h === a) return 'Empate.'; return h > a ? 'Vitória do mandante.' : 'Vitória do visitante.' }
  const diff = Math.round((new Date(m.utcDate).getTime() - Date.now()) / 60000)
  if (diff > 0 && diff <= 60) return `Começa em ${diff} min.`
  return ''
}

function getBadges(m: FDMatch): string[] {
  const badges: string[] = []
  const { live } = mapStatus(m.status)
  if (live) badges.push('Ao vivo')
  const imp = calcImportance(m)
  if (imp >= 70) badges.push('Jogo principal')
  else if (imp >= 55) badges.push('Alta relevância')
  const diff = Math.round((new Date(m.utcDate).getTime() - Date.now()) / 60000)
  if (diff > 0 && diff <= 60) badges.push('Em breve')
  return badges
}

export function MatchesPage() {
  const navigate = useNavigate()
  const [matches, setMatches] = useState<FDMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<ViewMode>('agenda')
  const isToday = date === new Date().toISOString().split('T')[0]

  useEffect(() => { setLoading(true); setError(null); fetch(`/.netlify/functions/football-data-matches?date=${date}`, { cache: 'no-store' }).then(async r => { const j = await r.json(); setMatches(j.matches || []) }).catch(e => setError(e.message)).finally(() => setLoading(false)) }, [date])

  const stats = useMemo(() => { const l = matches.filter(m => mapStatus(m.status).live).length; const f = matches.filter(m => mapStatus(m.status).finished).length; const u = matches.filter(m => mapStatus(m.status).upcoming).length; return { total: matches.length, live: l, finished: f, upcoming: u, comps: new Set(matches.map(m => m.competition.name)).size } }, [matches])

  const filtered = useMemo(() => {
    let list = matches
    if (search) { const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); list = list.filter(m => [m.homeTeam.shortName, m.homeTeam.name, m.awayTeam.shortName, m.awayTeam.name, m.competition.name].some(s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q))) }
    switch (filter) {
      case 'live': return list.filter(m => mapStatus(m.status).live)
      case 'upcoming': return list.filter(m => mapStatus(m.status).upcoming)
      case 'finished': return list.filter(m => mapStatus(m.status).finished)
      case 'brazil': return list.filter(m => m.area?.name === 'Brazil' || m.competition.name.toLowerCase().includes('brasil'))
      case 'europe': return list.filter(m => ['England','Spain','Germany','Italy','France'].includes(m.area?.name || ''))
      case 'relevant': return list.filter(m => calcImportance(m) >= 45).sort((a,b) => calcImportance(b) - calcImportance(a))
      default: return list
    }
  }, [matches, filter, search])

  const grouped = useMemo(() => { const map = new Map<string, FDMatch[]>(); for (const m of filtered) { const k = m.competition.name; if (!map.has(k)) map.set(k, []); map.get(k)!.push(m) }; return map }, [filtered])
  const featured = useMemo(() => [...matches].sort((a, b) => calcImportance(b) - calcImportance(a)).slice(0, 5), [matches])
  const sidebarNext = useMemo(() => matches.filter(m => mapStatus(m.status).upcoming).sort((a,b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()).slice(0, 5), [matches])
  const sidebarTop = useMemo(() => [...matches].sort((a, b) => calcImportance(b) - calcImportance(a)).slice(0, 5), [matches])

  const shiftDate = (d: number) => { const dt = new Date(date + 'T12:00:00'); dt.setDate(dt.getDate() + d); setDate(dt.toISOString().split('T')[0]) }
  const openMatch = (m: FDMatch) => { const { label, live } = mapStatus(m.status); const fx: LiveFixture = { id: m.id, provider: 'football_data', externalId: m.id, league: { id: 0, name: m.competition.name, logo: m.competition.emblem, country: m.area?.name || '', season: 2026 }, status: { long: label, short: live ? 'LIVE' : m.status === 'FINISHED' ? 'FT' : 'NS', elapsed: null }, homeTeam: { id: m.homeTeam.id, name: m.homeTeam.shortName || m.homeTeam.name, logo: m.homeTeam.crest }, awayTeam: { id: m.awayTeam.id, name: m.awayTeam.shortName || m.awayTeam.name, logo: m.awayTeam.crest }, score: { home: m.score.fullTime.home, away: m.score.fullTime.away }, venue: null, referee: null, date: m.utcDate, raw: m.status }; storeFixtureForNavigation(fx); navigate(`/app/matches/${m.id}`, { state: { fixture: fx } }) }
  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="flex gap-5">
      {/* MAIN */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex items-center justify-between">
            <div><h1 className="text-[20px] font-bold text-white">Partidas</h1><p className="text-[11px] text-white/30 mt-0.5">{stats.total} jogos · {stats.comps} competições · Dados reais</p></div>
            <div className="flex items-center gap-1.5">
              {!isToday && <button onClick={() => setDate(new Date().toISOString().split('T')[0])} className="px-2.5 py-1 rounded-lg text-[9px] font-medium text-cyan-400/70 border border-cyan-500/20 hover:bg-cyan-500/5">Hoje</button>}
              <div className="flex items-center rounded-xl border border-white/[0.06] bg-white/[0.02] p-0.5">
                <button onClick={() => setView('agenda')} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 ${view === 'agenda' ? 'bg-white/[0.08] text-white/70' : 'text-white/25'}`}><List size={11} />Agenda</button>
                <button onClick={() => setView('highlights')} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 ${view === 'highlights' ? 'bg-white/[0.08] text-white/70' : 'text-white/25'}`}><LayoutGrid size={11} />Destaques</button>
                <button onClick={() => setView('compact')} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 ${view === 'compact' ? 'bg-white/[0.08] text-white/70' : 'text-white/25'}`}><Rows3 size={11} />Compacto</button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => shiftDate(-1)} className="p-1.5 rounded-lg hover:bg-white/[0.04] text-white/30"><ChevronLeft size={16} /></button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.02] border border-white/[0.05]"><Calendar size={12} className="text-white/25" /><span className="text-[11px] font-medium text-white/50 capitalize">{fmtDate(date)}</span></div>
            <button onClick={() => shiftDate(1)} className="p-1.5 rounded-lg hover:bg-white/[0.04] text-white/30"><ChevronRight size={16} /></button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="ml-auto h-7 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 text-[10px] text-white/40 outline-none" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {stats.live > 0 && <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-[10px] text-emerald-400 font-medium"><Activity size={10} />{stats.live} ao vivo</span>}
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/[0.05] bg-white/[0.02] text-[10px] text-white/30"><CheckCircle2 size={10} />{stats.finished} enc.</span>
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/[0.05] bg-white/[0.02] text-[10px] text-white/30"><Clock size={10} />{stats.upcoming} próx.</span>
            <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/[0.05] bg-white/[0.02] text-[10px] text-white/30"><BarChart3 size={10} />{stats.comps} ligas</span>
          </div>
        </header>

        {/* Search + Filters */}
        <div className="space-y-2">
          <div className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar time, liga ou competição" className="w-full h-9 rounded-xl border border-white/[0.06] bg-white/[0.02] pl-8 pr-8 text-[11px] text-white placeholder:text-white/20 outline-none focus:border-white/[0.12]" />{search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20"><X size={12} /></button>}</div>
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {([['all','Todos'],['live','Ao vivo'],['upcoming','Próximos'],['finished','Encerrados'],['brazil','Brasil'],['europe','Europa'],['relevant','Relevantes']] as [FilterKey,string][]).map(([k,l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-medium ${filter === k ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-white/25 hover:text-white/40'}`}>{l}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading && <div className="space-y-2">{[1,2,3,4,5,6].map(i => <div key={i} className="h-14 rounded-xl bg-white/[0.02] animate-pulse" />)}</div>}
        {error && <div className="rounded-xl border border-rose-500/15 bg-rose-500/5 p-4 text-[12px] text-rose-400">{error}</div>}
        {!loading && !error && filtered.length === 0 && <div className="rounded-[20px] border border-white/[0.04] bg-white/[0.015] py-14 text-center"><p className="text-[13px] text-white/35">Nenhuma partida encontrada</p><p className="text-[10px] text-white/15 mt-1">{search ? 'Tente outra busca.' : 'Sem jogos para esta data.'}</p></div>}

        {/* HIGHLIGHTS MODE */}
        {!loading && view === 'highlights' && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...filtered].sort((a,b) => calcImportance(b) - calcImportance(a)).map(m => <HighlightCard key={m.id} match={m} onClick={() => openMatch(m)} />)}
          </div>
        )}

        {/* COMPACT MODE */}
        {!loading && view === 'compact' && filtered.length > 0 && (
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] divide-y divide-white/[0.02] overflow-hidden">
            {filtered.map(m => <CompactRow key={m.id} match={m} onClick={() => openMatch(m)} />)}
          </div>
        )}

        {/* AGENDA MODE */}
        {!loading && view === 'agenda' && filtered.length > 0 && (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([comp, items]) => {
              const live = items.filter(i => mapStatus(i.status).live).length
              const fin = items.filter(i => mapStatus(i.status).finished).length
              const upc = items.filter(i => mapStatus(i.status).upcoming).length
              return (
                <section key={comp}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    {items[0].competition.emblem && <img src={items[0].competition.emblem} alt="" className="h-4 w-4 object-contain opacity-50" />}
                    <h3 className="text-[11px] font-semibold text-white/40">{translateComp(comp)}</h3>
                    <span className="text-[9px] text-white/15">{items.length} {items.length === 1 ? 'jogo' : 'jogos'}{live > 0 ? ` · ${live} ao vivo` : ''}{fin > 0 ? ` · ${fin} enc.` : ''}{upc > 0 ? ` · ${upc} próx.` : ''}</span>
                  </div>
                  <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] divide-y divide-white/[0.02] overflow-hidden">
                    {items.map(m => <AgendaRow key={m.id} match={m} onClick={() => openMatch(m)} />)}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* SIDEBAR (desktop) */}
      <aside className="hidden xl:block w-[340px] shrink-0 space-y-5 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
        {/* Resumo do dia */}
        <div className="rounded-[16px] border border-white/[0.05] bg-gradient-to-b from-white/[0.025] to-transparent p-5">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/25 mb-3">Resumo do dia</h4>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center"><span className="text-[20px] font-bold tabular-nums text-white/70">{stats.total}</span><span className="block text-[8px] text-white/20 mt-0.5">Total</span></div>
            <div className="text-center"><span className={`text-[20px] font-bold tabular-nums ${stats.live > 0 ? 'text-emerald-400' : 'text-white/40'}`}>{stats.live}</span><span className="block text-[8px] text-white/20 mt-0.5">Ao vivo</span></div>
            <div className="text-center"><span className="text-[20px] font-bold tabular-nums text-white/40">{stats.finished}</span><span className="block text-[8px] text-white/20 mt-0.5">Encerrados</span></div>
            <div className="text-center"><span className="text-[20px] font-bold tabular-nums text-white/40">{stats.upcoming}</span><span className="block text-[8px] text-white/20 mt-0.5">Próximos</span></div>
          </div>
        </div>

        {/* Jogo principal do dia */}
        {sidebarTop[0] && (() => {
          const m = sidebarTop[0]
          const { label, live } = mapStatus(m.status)
          const imp = calcImportance(m)
          const reason = imp >= 70 ? 'Jogo principal' : m.competition.name.toLowerCase().includes('brasil') ? 'Brasileirão em destaque' : live ? 'Ao vivo agora' : 'Mais relevante'
          return (
            <div onClick={() => openMatch(m)} className="group rounded-[16px] border border-cyan-500/10 bg-gradient-to-b from-cyan-500/[0.03] to-transparent p-5 cursor-pointer hover:border-cyan-500/20 transition-all">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-400/50">{reason}</span>
                <span className={`text-[9px] font-medium ${live ? 'text-emerald-400' : 'text-white/25'}`}>{label}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col items-center gap-1.5">
                  <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={36} />
                  <span className="text-[10px] font-semibold text-white/60 text-center max-w-[80px]">{m.homeTeam.shortName}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[24px] font-bold tabular-nums text-white">{m.score.fullTime.home ?? '-'}</span>
                    <span className="text-[12px] text-white/15">:</span>
                    <span className="text-[24px] font-bold tabular-nums text-white">{m.score.fullTime.away ?? '-'}</span>
                  </div>
                  {live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={36} />
                  <span className="text-[10px] font-semibold text-white/50 text-center max-w-[80px]">{m.awayTeam.shortName}</span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[9px] text-white/20">{translateComp(m.competition.name)}</span>
                <span className="text-[9px] text-cyan-400/40 group-hover:text-cyan-400/70 font-medium transition-colors">Analisar</span>
              </div>
            </div>
          )
        })()}

        {/* Próximos jogos */}
        {sidebarNext.length > 0 && (
          <div className="rounded-[16px] border border-white/[0.05] bg-white/[0.015] p-5">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/25 mb-3">Próximos jogos</h4>
            <div className="space-y-2.5">
              {sidebarNext.map(m => {
                const time = new Date(m.utcDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                const diffMin = Math.round((new Date(m.utcDate).getTime() - Date.now()) / 60000)
                const soon = diffMin > 0 && diffMin <= 60
                return (
                  <div key={m.id} onClick={() => openMatch(m)} className="flex items-center gap-2.5 py-2 px-2 -mx-2 rounded-lg cursor-pointer hover:bg-white/[0.03] transition-colors">
                    <span className="text-[10px] tabular-nums text-white/30 w-10 shrink-0">{time}</span>
                    <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={18} />
                    <span className="text-[10px] text-white/50 flex-1 truncate">{m.homeTeam.shortName} vs {m.awayTeam.shortName}</span>
                    <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={18} />
                    {soon && <span className="text-[7px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/60 border border-amber-500/15 shrink-0">Em breve</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Mais relevantes */}
        {sidebarTop.length > 1 && (
          <div className="rounded-[16px] border border-white/[0.05] bg-white/[0.015] p-5">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/25 mb-3">Mais relevantes</h4>
            <div className="space-y-2">
              {sidebarTop.slice(1, 6).map((m, i) => {
                const imp = calcImportance(m)
                const badge = imp >= 70 ? 'Jogo principal' : imp >= 55 ? 'Alta relevância' : imp >= 45 ? 'Acompanhar' : ''
                const { live } = mapStatus(m.status)
                const reason = m.competition.name.toLowerCase().includes('brasil') ? 'Brasileirão' : live ? 'Ao vivo' : m.score.fullTime.home !== null && Math.abs((m.score.fullTime.home||0)-(m.score.fullTime.away||0)) >= 3 ? 'Placar dominante' : translateComp(m.competition.name)
                return (
                  <div key={m.id} onClick={() => openMatch(m)} className="flex items-center gap-2.5 py-2 px-2 -mx-2 rounded-lg cursor-pointer hover:bg-white/[0.03] transition-colors">
                    <span className="text-[10px] font-bold text-cyan-400/30 w-4 shrink-0">#{i + 2}</span>
                    <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={16} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-white/50 block truncate">{m.homeTeam.shortName} {m.score.fullTime.home ?? '-'}:{m.score.fullTime.away ?? '-'} {m.awayTeam.shortName}</span>
                      <span className="text-[8px] text-white/15">{reason}</span>
                    </div>
                    <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={16} />
                    {badge && <span className="text-[7px] px-1.5 py-0.5 rounded border border-white/[0.06] bg-white/[0.02] text-white/25 shrink-0">{badge}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Alertas do dia */}
        <div className="rounded-[16px] border border-white/[0.05] bg-white/[0.015] p-5">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/25 mb-3">Alertas do dia</h4>
          <div className="space-y-2">
            {stats.live > 0 && <AlertItem text={`${stats.live} ${stats.live === 1 ? 'jogo ao vivo' : 'jogos ao vivo'}`} type="live" />}
            {(() => { const soon = matches.filter(m => { const d = Math.round((new Date(m.utcDate).getTime() - Date.now()) / 60000); return d > 0 && d <= 60 }).length; return soon > 0 ? <AlertItem text={`${soon} ${soon === 1 ? 'jogo começa' : 'jogos começam'} em breve`} type="soon" /> : null })()}
            {(() => { const br = matches.filter(m => m.area?.name === 'Brazil' || m.competition.name.toLowerCase().includes('brasil')).length; return br > 0 ? <AlertItem text={`${br} ${br === 1 ? 'jogo do Brasil' : 'jogos do Brasil'}`} type="brazil" /> : null })()}
            {(() => { const rel = matches.filter(m => calcImportance(m) >= 55).length; return rel > 0 ? <AlertItem text={`${rel} de alta relevância`} type="relevant" /> : null })()}
            {stats.live === 0 && stats.upcoming === 0 && <span className="text-[9px] text-white/15 italic">Sem alertas no momento.</span>}
          </div>
        </div>
      </aside>
    </div>
  )
}

// --- Sub-components ---

function HighlightCard({ match: m, onClick }: { match: FDMatch; onClick: () => void }) {
  const { label, live } = mapStatus(m.status)
  const badges = getBadges(m)
  const insight = getInsight(m)
  const imp = calcImportance(m)
  const category = imp >= 70 ? 'Jogo principal' : imp >= 55 ? 'Alta relevância' : live ? 'Ao vivo agora' : mapStatus(m.status).upcoming ? 'Em breve' : 'Encerrado'

  return (
    <div onClick={onClick} className="group rounded-[16px] border border-white/[0.05] bg-gradient-to-b from-white/[0.03] to-transparent p-4 cursor-pointer hover:border-white/[0.1] hover:shadow-[0_8px_30px_-10px_rgba(0,0,0,0.4)] transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-medium text-white/20 uppercase tracking-wider">{category}</span>
        {badges.length > 0 && <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded ${live ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'bg-cyan-500/8 text-cyan-400/60 border border-cyan-500/12'}`}>{badges[0]}</span>}
      </div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={28} /><span className="text-[12px] font-semibold text-white/70">{m.homeTeam.shortName}</span></div>
        <div className="flex items-center gap-1.5">
          <span className="text-[18px] font-bold tabular-nums text-white">{m.score.fullTime.home ?? '-'}</span>
          <span className="text-[11px] text-white/15">:</span>
          <span className="text-[18px] font-bold tabular-nums text-white">{m.score.fullTime.away ?? '-'}</span>
        </div>
        <div className="flex items-center gap-2"><span className="text-[12px] font-semibold text-white/50">{m.awayTeam.shortName}</span><ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={28} /></div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-white/20">{translateComp(m.competition.name)}</span>
        <span className={`text-[9px] font-medium ${live ? 'text-emerald-400' : 'text-white/25'}`}>{label}</span>
      </div>
      {insight && <p className="text-[9px] text-white/25 mt-2 italic">{insight}</p>}
      <span className="block text-[9px] text-cyan-400/40 mt-2 group-hover:text-cyan-400/70 font-medium transition-colors">Analisar</span>
    </div>
  )
}

function AgendaRow({ match: m, onClick }: { match: FDMatch; onClick: () => void }) {
  const { label, live } = mapStatus(m.status)
  const time = new Date(m.utcDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const badges = getBadges(m)
  const insight = getInsight(m)

  return (
    <div onClick={onClick} className="group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.025] transition-colors">
      <div className="w-14 shrink-0 text-center">
        {live ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />Ao vivo</span>
         : m.status === 'FINISHED' ? <span className="text-[10px] text-white/20">Enc.</span>
         : <span className="text-[11px] tabular-nums text-white/35">{time}</span>}
      </div>
      <div className="flex flex-1 items-center justify-end gap-2 min-w-0"><span className="text-[12px] font-medium text-white/70 truncate text-right">{m.homeTeam.shortName || m.homeTeam.name}</span><ClubLogo src={m.homeTeam.crest} name={m.homeTeam.name} size={22} /></div>
      <div className="flex items-center gap-1.5 min-w-[48px] justify-center"><span className={`text-[15px] font-bold tabular-nums ${live ? 'text-white' : 'text-white/60'}`}>{m.score.fullTime.home ?? '-'}</span><span className="text-[9px] text-white/10">:</span><span className={`text-[15px] font-bold tabular-nums ${live ? 'text-white' : 'text-white/60'}`}>{m.score.fullTime.away ?? '-'}</span></div>
      <div className="flex flex-1 items-center gap-2 min-w-0"><ClubLogo src={m.awayTeam.crest} name={m.awayTeam.name} size={22} /><span className="text-[12px] font-medium text-white/50 truncate">{m.awayTeam.shortName || m.awayTeam.name}</span></div>
      <div className="hidden md:flex items-center gap-2 shrink-0">
        {badges.slice(0, 2).map((b, i) => <span key={i} className="text-[8px] px-1.5 py-0.5 rounded border border-white/[0.06] bg-white/[0.02] text-white/25">{b}</span>)}
        {insight && <span className="text-[9px] text-white/15 max-w-[100px] truncate">{insight}</span>}
      </div>
    </div>
  )
}

function CompactRow({ match: m, onClick }: { match: FDMatch; onClick: () => void }) {
  const { live } = mapStatus(m.status)
  const time = new Date(m.utcDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return (
    <div onClick={onClick} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/[0.02] transition-colors">
      <span className="w-10 text-center text-[9px] tabular-nums text-white/25">{live ? <span className="text-emerald-400 font-bold">LIVE</span> : m.status === 'FINISHED' ? 'FIM' : time}</span>
      <span className="flex-1 text-[10px] text-white/60 truncate text-right">{m.homeTeam.shortName}</span>
      <span className="text-[12px] font-bold tabular-nums text-white/70 w-8 text-center">{m.score.fullTime.home ?? '-'}</span>
      <span className="text-[8px] text-white/10">:</span>
      <span className="text-[12px] font-bold tabular-nums text-white/70 w-8 text-center">{m.score.fullTime.away ?? '-'}</span>
      <span className="flex-1 text-[10px] text-white/45 truncate">{m.awayTeam.shortName}</span>
      <span className="text-[8px] text-white/10 w-16 truncate text-right">{translateComp(m.competition.name)}</span>
    </div>
  )
}

function AlertItem({ text, type }: { text: string; type: 'live' | 'soon' | 'brazil' | 'relevant' }) {
  const colors = { live: 'text-emerald-400/60 bg-emerald-500/5 border-emerald-500/10', soon: 'text-amber-400/60 bg-amber-500/5 border-amber-500/10', brazil: 'text-cyan-400/50 bg-cyan-500/5 border-cyan-500/10', relevant: 'text-violet-400/50 bg-violet-500/5 border-violet-500/10' }
  return <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[9px] font-medium ${colors[type]}`}><Activity size={10} />{text}</div>
}

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-3.5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/25 mb-2.5">{title}</h4>
      {children}
    </div>
  )
}
