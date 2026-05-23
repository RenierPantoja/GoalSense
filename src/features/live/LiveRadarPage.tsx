import { useEffect, useState, useCallback, useMemo } from 'react'
import { Radio } from 'lucide-react'
import { getLiveFixtures, type LiveFixture } from '@/lib/apiClient'
import { PremiumMatchRow } from '@/components/live/PremiumMatchRow'
import { LoadingState } from '@/components/ui/LoadingState'
import { EmptyState } from '@/components/ui/EmptyState'

export function LiveRadarPage() {
  const [fixtures, setFixtures] = useState<LiveFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterCountry, setFilterCountry] = useState('all')

  const fetchLive = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await getLiveFixtures()
      setFixtures(data.fixtures)
      setLastUpdate(data.fetchedAt)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLive()
    const interval = setInterval(() => fetchLive(true), 60_000)
    return () => clearInterval(interval)
  }, [fetchLive])

  // Derived
  const countries = useMemo(() => {
    const set = new Set(fixtures.map((f) => f.league.country).filter(Boolean))
    return Array.from(set).sort()
  }, [fixtures])

  const filtered = useMemo(() => {
    let list = fixtures
    if (filterCountry !== 'all') {
      list = list.filter((f) => f.league.country === filterCountry)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (f) =>
          f.homeTeam.name.toLowerCase().includes(q) ||
          f.awayTeam.name.toLowerCase().includes(q) ||
          f.league.name.toLowerCase().includes(q)
      )
    }
    return list
  }, [fixtures, filterCountry, search])

  // Group by league
  const grouped = useMemo(() => {
    const map = new Map<string, LiveFixture[]>()
    for (const fx of filtered) {
      const key = `${fx.league.country} — ${fx.league.name}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(fx)
    }
    return map
  }, [filtered])

  if (loading) return <LoadingState message="Conectando ao provider..." />

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/15 bg-rose-500/5 p-5">
        <p className="text-sm font-medium text-rose-400">Erro ao buscar dados reais</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{error}</p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Limite de requisições pode ter sido atingido. Tente novamente em alguns minutos.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Radio size={18} className="text-[var(--accent-cyan)]" />
            <h1 className="text-[20px] font-semibold tracking-tight">Live Radar</h1>
          </div>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            {fixtures.length} jogos ao vivo
            {lastUpdate && ` · Atualizado ${new Date(lastUpdate).toLocaleTimeString('pt-BR')}`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar time ou liga..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-64 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-focus)]"
        />
        <select
          value={filterCountry}
          onChange={(e) => setFilterCountry(e.target.value)}
          className="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2.5 text-[12px] text-[var(--text-secondary)] outline-none focus:border-[var(--border-focus)]"
        >
          <option value="all">Todos os países</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="ml-auto text-[11px] text-[var(--text-muted)]">
          {filtered.length} partidas
        </span>
      </div>

      {/* Match list grouped by league */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum jogo ao vivo agora"
          description="Quando a API retornar partidas em andamento, elas aparecerão aqui automaticamente."
        />
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([leagueKey, matches]) => (
            <section key={leagueKey}>
              <div className="mb-2 flex items-center gap-2 px-4">
                {matches[0].league.logo && (
                  <img src={matches[0].league.logo} alt="" className="h-4 w-4 object-contain opacity-60" />
                )}
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {leagueKey}
                </h3>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] divide-y divide-[var(--border-subtle)]">
                {matches.map((fx) => (
                  <PremiumMatchRow key={fx.id} fixture={fx} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
