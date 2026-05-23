import { useEffect, useState, useCallback } from 'react'
import { Radio, RefreshCw } from 'lucide-react'
import { getLiveFixtures, type LiveFixture } from '@/lib/apiClient'
import { PremiumMatchCard } from '@/components/live/PremiumMatchCard'
import { LoadingState } from '@/components/ui/LoadingState'
import { EmptyState } from '@/components/ui/EmptyState'

export function LiveRadarPage() {
  const [fixtures, setFixtures] = useState<LiveFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchLive = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    try {
      const data = await getLiveFixtures()
      setFixtures(data.fixtures)
      setLastUpdate(data.fetchedAt)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchLive()
    const interval = setInterval(() => fetchLive(true), 60_000)
    return () => clearInterval(interval)
  }, [fetchLive])

  if (loading) return <LoadingState message="Conectando ao provider..." />

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5">
        <p className="text-sm font-medium text-rose-400">Erro ao buscar dados reais</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10">
            <Radio size={18} className="text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Live Radar
            </h1>
            <p className="text-[11px] text-[var(--text-muted)]">
              {fixtures.length} jogos ao vivo
              {lastUpdate && ` · ${new Date(lastUpdate).toLocaleTimeString('pt-BR')}`}
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchLive(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-all hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)] disabled:opacity-40"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Content */}
      {fixtures.length === 0 ? (
        <EmptyState
          title="Nenhum jogo ao vivo agora"
          description="Quando a API retornar partidas em andamento, elas aparecerão aqui automaticamente."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {fixtures.map((fx) => (
            <PremiumMatchCard key={fx.id} fixture={fx} />
          ))}
        </div>
      )}
    </div>
  )
}
