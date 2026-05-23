import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { getFixtureDetails, type FixtureStatistic, type FixtureEvent } from '@/lib/apiClient'
import { ClubLogo } from '@/components/ui/ClubLogo'
import { StatusPill } from '@/components/ui/StatusPill'
import { LoadingState } from '@/components/ui/LoadingState'
import { calculateGoalSenseScore } from '@/services/goalSenseEngine'

export function MatchCenterPage() {
  const { fixtureId } = useParams<{ fixtureId: string }>()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!fixtureId) return
    setLoading(true)
    getFixtureDetails(Number(fixtureId))
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [fixtureId])

  if (loading) return <LoadingState message="Carregando dados da partida..." />
  if (error) return <ErrorBlock message={error} />
  if (!data) return <ErrorBlock message="Partida não encontrada." />

  const { fixture, statistics, events, unavailable } = data
  const intelligence = calculateGoalSenseScore(statistics, fixture.status.elapsed)

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link to="/app/live" className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
        <ArrowLeft size={14} />
        Voltar ao Live Radar
      </Link>

      {/* Match header */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-6">
        <div className="mb-4 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
          {fixture.league.logo && <img src={fixture.league.logo} alt="" className="h-4 w-4" />}
          <span>{fixture.league.name}</span>
        </div>

        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col items-center gap-2">
            <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={48} />
            <span className="text-sm font-medium text-[var(--text-primary)]">{fixture.homeTeam.name}</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold tabular-nums text-[var(--text-primary)]">
                {fixture.score.home ?? 0}
              </span>
              <span className="text-lg text-[var(--text-muted)]">:</span>
              <span className="text-4xl font-bold tabular-nums text-[var(--text-primary)]">
                {fixture.score.away ?? 0}
              </span>
            </div>
            <StatusPill label={fixture.status.elapsed ? `${fixture.status.elapsed}'` : fixture.status.long} variant="live" />
          </div>

          <div className="flex flex-col items-center gap-2">
            <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={48} />
            <span className="text-sm font-medium text-[var(--text-primary)]">{fixture.awayTeam.name}</span>
          </div>
        </div>
      </div>

      {/* Intelligence */}
      {intelligence.available && intelligence.signals && intelligence.signals.length > 0 && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-400 mb-3">GoalSense Intelligence</h3>
          <div className="space-y-2">
            {intelligence.signals.map((sig) => (
              <div key={sig.type} className="flex items-center justify-between rounded-lg bg-[var(--bg-panel)] px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-[var(--text-primary)]">{sig.label}</span>
                  <p className="text-[11px] text-[var(--text-muted)]">{sig.reasons.join(' · ')}</p>
                </div>
                <span className="text-sm font-bold tabular-nums text-violet-400">{sig.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Statistics */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Estatísticas</h3>
        {unavailable.statistics ? (
          <p className="text-sm text-[var(--text-muted)]">Estatísticas indisponíveis pelo provider.</p>
        ) : (
          <div className="space-y-3">
            {statistics.map((stat: FixtureStatistic) => (
              <StatRow key={stat.type} stat={stat} />
            ))}
          </div>
        )}
      </div>

      {/* Events */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Eventos</h3>
        {unavailable.events ? (
          <p className="text-sm text-[var(--text-muted)]">Eventos indisponíveis pelo provider.</p>
        ) : (
          <div className="space-y-2">
            {events.map((ev: FixtureEvent, i: number) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[var(--bg-elevated)]">
                <span className="w-8 text-right text-xs font-mono text-[var(--text-muted)]">{ev.time.elapsed}'</span>
                <span className="text-[var(--text-secondary)]">{ev.detail}</span>
                <span className="text-[var(--text-primary)] font-medium">{ev.player.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatRow({ stat }: { stat: FixtureStatistic }) {
  const home = stat.home ?? '-'
  const away = stat.away ?? '-'
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="w-16 text-right font-medium tabular-nums text-[var(--text-primary)]">{String(home)}</span>
      <span className="flex-1 text-center text-[11px] text-[var(--text-muted)]">{stat.type}</span>
      <span className="w-16 text-left font-medium tabular-nums text-[var(--text-primary)]">{String(away)}</span>
    </div>
  )
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5">
      <p className="text-sm text-rose-400">{message}</p>
    </div>
  )
}
