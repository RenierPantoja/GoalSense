import { useEffect, useState } from 'react'
import { MatchCard } from '../components/MatchCard'
import type { LiveFixture } from '../types'

export function LivePage() {
  const [fixtures, setFixtures] = useState<LiveFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  async function fetchLive() {
    try {
      const res = await fetch('/api/live')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setFixtures(data.fixtures)
      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLive()
    const interval = setInterval(fetchLive, 30_000) // atualiza a cada 30s
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-cyan-400">Carregando jogos ao vivo...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">
        Erro ao buscar jogos: {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Jogos ao vivo ({fixtures.length})
        </h2>
        {lastUpdate && (
          <span className="text-xs text-slate-500">
            Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}
          </span>
        )}
      </div>

      {fixtures.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center text-slate-400">
          Nenhum jogo ao vivo no momento.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {fixtures.map((fx) => (
            <MatchCard key={fx.id} fixture={fx} />
          ))}
        </div>
      )}
    </div>
  )
}
