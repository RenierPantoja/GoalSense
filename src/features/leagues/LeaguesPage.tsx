/**
 * Leagues page — lists available competitions with real data.
 * Uses football-data.org competitions + api-football standings.
 */
import { useEffect, useState, useMemo } from 'react'
import { Search, X, Trophy, Globe2, ChevronRight, Shield } from 'lucide-react'
import { useFavorites } from '@/context/FavoritesContext'
import { FavoriteButton } from '@/components/ui/FavoriteButton'

interface Competition {
  id: number
  name: string
  code: string
  type: string
  emblem: string | null
  area: { name: string; flag?: string | null }
  currentSeason?: { startDate: string; endDate: string; currentMatchday: number }
  numberOfAvailableSeasons: number
  provider: string
}

interface StandingTeam {
  position: number
  team: { id: number; name: string; crest: string | null }
  playedGames: number
  won: number
  draw: number
  lost: number
  points: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
}

type FilterKey = 'all' | 'brazil' | 'europe' | 'favorites'

export function LeaguesPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedLeague, setSelectedLeague] = useState<Competition | null>(null)
  const [standings, setStandings] = useState<StandingTeam[]>([])
  const [standingsLoading, setStandingsLoading] = useState(false)
  // Bumped by the "Tentar novamente" button so the original effect refetches
  // through the same code path (no parallel partial fetch).
  const [reloadKey, setReloadKey] = useState(0)
  const { isFavoriteLeague, toggleFavoriteLeague } = useFavorites()

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/api/football-data-competitions', { cache: 'no-store' })
      .then(async r => {
        const j = await r.json()
        const comps: Competition[] = (j.competitions || []).map((c: any) => ({
          id: c.id, name: c.name, code: c.code || '', type: c.type || 'LEAGUE',
          emblem: c.emblem || null, area: { name: c.area?.name || '', flag: c.area?.flag || null },
          currentSeason: c.currentSeason, numberOfAvailableSeasons: c.numberOfAvailableSeasons || 0,
          provider: 'football_data',
        }))
        setCompetitions(comps)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [reloadKey])

  const filtered = useMemo(() => {
    let list = competitions.filter(c => c.type === 'LEAGUE' || c.type === 'CUP')
    if (search) {
      const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      list = list.filter(c => [c.name, c.area.name].some(s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)))
    }
    switch (filter) {
      case 'brazil': return list.filter(c => c.area.name === 'Brazil')
      case 'europe': return list.filter(c => ['England', 'Spain', 'Germany', 'Italy', 'France', 'Netherlands', 'Portugal'].includes(c.area.name))
      case 'favorites': return list.filter(c => isFavoriteLeague(String(c.id)))
      default: return list
    }
  }, [competitions, search, filter, isFavoriteLeague])

  const loadStandings = async (comp: Competition) => {
    setSelectedLeague(comp)
    setStandings([])
    setStandingsLoading(true)
    try {
      // Try api-football standings (needs league ID mapping — use code for known leagues)
      const leagueIdMap: Record<string, number> = {
        'BSA': 71, 'PL': 39, 'PD': 140, 'SA': 135, 'BL1': 78, 'FL1': 61,
        'CL': 2, 'ELC': 40, 'DED': 88, 'PPL': 94,
      }
      const apiFootballId = leagueIdMap[comp.code]
      if (apiFootballId) {
        const season = new Date().getFullYear()
        const res = await fetch(`/api/api-football-standings?league=${apiFootballId}&season=${season}`)
        const j = await res.json()
        const league = (j.response || [])[0]?.league
        if (league?.standings?.[0]) {
          setStandings(league.standings[0].map((s: any) => ({
            position: s.rank, team: { id: s.team.id, name: s.team.name, crest: s.team.logo || null },
            playedGames: s.all.played, won: s.all.win, draw: s.all.draw, lost: s.all.lose,
            points: s.points, goalsFor: s.all.goals.for, goalsAgainst: s.all.goals.against,
            goalDifference: s.goalsDiff,
          })))
          return
        }
      }
      // Fallback: no standings available
      setStandings([])
    } catch {
      setStandings([])
    } finally {
      setStandingsLoading(false)
    }
  }

  if (selectedLeague) {
    return (
      <LeagueDetail
        league={selectedLeague}
        standings={standings}
        loading={standingsLoading}
        onBack={() => setSelectedLeague(null)}
        isFavorite={isFavoriteLeague(String(selectedLeague.id))}
        onToggleFavorite={() => toggleFavoriteLeague({ id: String(selectedLeague.id), name: selectedLeague.name, country: selectedLeague.area.name, logo: selectedLeague.emblem })}
      />
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <header>
        <h1 className="text-[24px] font-bold text-white/90 tracking-tight">Ligas e Competições</h1>
        <p className="text-[13px] text-white/40 mt-1">{competitions.length} competições disponíveis · Dados reais</p>
      </header>

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar liga ou país..." className="gs-input pl-10 pr-10" />
          {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50"><X size={14} /></button>}
        </div>
        <div className="flex gap-2">
          {([['all', 'Todas'], ['brazil', 'Brasil'], ['europe', 'Europa'], ['favorites', 'Favoritas']] as [FilterKey, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-4 py-2 rounded-xl text-[11px] font-medium transition-all ${filter === k ? 'bg-cyan-500/12 text-cyan-300 border border-cyan-500/20' : 'text-white/40 hover:text-white/60 border border-transparent hover:bg-white/[0.02]'}`}>{l}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading && <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-16 rounded-2xl bg-white/[0.02] animate-pulse" />)}</div>}
      {error && (
        <div className="rounded-2xl border border-rose-500/15 bg-rose-500/5 p-5 text-center">
          <p className="text-[13px] text-rose-400/80 font-medium">Não foi possível carregar as competições</p>
          <p className="text-[11px] text-white/35 mt-1">{error}</p>
          <button onClick={() => setReloadKey(k => k + 1)} type="button" className="mt-3 px-4 py-1.5 rounded-xl text-[10px] font-medium text-cyan-400/70 border border-cyan-500/20 hover:bg-cyan-500/5 transition-colors">Tentar novamente</button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="gs-empty">
          <Trophy size={20} className="mx-auto text-white/20 mb-3" />
          <p className="text-[14px] text-white/45">Nenhuma competição encontrada</p>
          {search && <p className="text-[12px] text-white/25 mt-1">Tente outro termo de busca</p>}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(c => (
            <LeagueCard
              key={c.id}
              competition={c}
              isFavorite={isFavoriteLeague(String(c.id))}
              onToggleFavorite={() => toggleFavoriteLeague({ id: String(c.id), name: c.name, country: c.area.name, logo: c.emblem })}
              onClick={() => loadStandings(c)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── League Card ─────────────────────────────────────────────────────────────

function LeagueCard({ competition: c, isFavorite, onToggleFavorite, onClick }: { competition: Competition; isFavorite: boolean; onToggleFavorite: () => void; onClick: () => void }) {
  return (
    <div onClick={onClick} className="group gs-card gs-card-hover flex items-center gap-4 cursor-pointer">
      <div className="flex items-center justify-center h-12 w-12 rounded-[12px] bg-white/[0.04] border border-white/[0.07] shrink-0">
        {c.emblem ? <img src={c.emblem} alt="" className="h-8 w-8 object-contain" /> : <Shield size={20} className="text-white/25" />}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] font-bold text-white/75 truncate">{c.name}</h3>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-white/40">{c.area.name}</span>
          {c.currentSeason && <span className="text-[10px] text-white/25">Rodada {c.currentSeason.currentMatchday}</span>}
        </div>
      </div>
      <FavoriteButton active={isFavorite} onClick={(e) => { e.stopPropagation(); onToggleFavorite() }} size={14} />
      <ChevronRight size={14} className="text-white/20 group-hover:text-white/45 transition-colors shrink-0" />
    </div>
  )
}

// ─── League Detail ───────────────────────────────────────────────────────────

function LeagueDetail({ league, standings, loading, onBack, isFavorite, onToggleFavorite }: { league: Competition; standings: StandingTeam[]; loading: boolean; onBack: () => void; isFavorite: boolean; onToggleFavorite: () => void }) {
  return (
    <div className="max-w-[900px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-[11px] text-white/30 hover:text-white/60 transition-colors">← Voltar</button>
      </div>
      <div className="flex items-center gap-4 rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-center justify-center h-14 w-14 rounded-[14px] bg-white/[0.04] border border-white/[0.08] shrink-0">
          {league.emblem ? <img src={league.emblem} alt="" className="h-9 w-9 object-contain" /> : <Trophy size={24} className="text-white/25" />}
        </div>
        <div className="flex-1">
          <h1 className="text-[18px] font-bold text-white/80">{league.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-white/30">{league.area.name}</span>
            {league.currentSeason && <span className="text-[10px] text-white/20">· Rodada {league.currentSeason.currentMatchday}</span>}
          </div>
        </div>
        <FavoriteButton active={isFavorite} onClick={onToggleFavorite} size={18} />
      </div>

      {/* Standings */}
      {loading && <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-10 rounded-xl bg-white/[0.02] animate-pulse" />)}</div>}

      {!loading && standings.length === 0 && (
        <div className="gs-empty">
          <Globe2 size={20} className="mx-auto text-white/20 mb-3" />
          <p className="text-[13px] text-white/45">Tabela indisponível neste provider</p>
          <p className="text-[11px] text-white/25 mt-1">Classificação não disponível para esta competição</p>
        </div>
      )}

      {!loading && standings.length > 0 && (
        <div className="gs-card overflow-x-auto p-0">
          {/* Table header */}
          <div className="grid grid-cols-[40px_1fr_40px_40px_40px_40px_50px_56px] items-center px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.05] text-[9px] uppercase tracking-[0.12em] text-white/25 font-semibold">
            <span className="text-center">#</span>
            <span>Clube</span>
            <span className="text-center">J</span>
            <span className="text-center">V</span>
            <span className="text-center">E</span>
            <span className="text-center">D</span>
            <span className="text-center">SG</span>
            <span className="text-center font-bold">Pts</span>
          </div>
          {standings.map((s, idx) => (
            <div key={s.team.id} className={`grid grid-cols-[40px_1fr_40px_40px_40px_40px_50px_56px] items-center px-4 py-2.5 border-b border-white/[0.03] last:border-b-0 ${idx < 4 ? 'bg-emerald-500/[0.02]' : idx >= standings.length - 3 ? 'bg-rose-500/[0.02]' : ''}`}>
              <span className="text-[12px] font-bold text-white/50 text-center">{s.position}</span>
              <div className="flex items-center gap-2.5 min-w-0">
                {s.team.crest ? <img src={s.team.crest} alt="" className="h-5 w-5 object-contain shrink-0" /> : <div className="h-5 w-5 rounded-full bg-white/[0.05] shrink-0" />}
                <span className="text-[12px] font-medium text-white/70 truncate">{s.team.name}</span>
              </div>
              <span className="text-[11px] text-white/40 text-center tabular-nums">{s.playedGames}</span>
              <span className="text-[11px] text-white/40 text-center tabular-nums">{s.won}</span>
              <span className="text-[11px] text-white/40 text-center tabular-nums">{s.draw}</span>
              <span className="text-[11px] text-white/40 text-center tabular-nums">{s.lost}</span>
              <span className={`text-[11px] text-center tabular-nums ${s.goalDifference > 0 ? 'text-emerald-400/60' : s.goalDifference < 0 ? 'text-rose-400/60' : 'text-white/30'}`}>{s.goalDifference > 0 ? '+' : ''}{s.goalDifference}</span>
              <span className="text-[13px] font-bold text-white/80 text-center tabular-nums">{s.points}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
