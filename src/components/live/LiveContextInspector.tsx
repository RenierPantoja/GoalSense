
import { ClubLogo } from '@/components/ui/ClubLogo'
import type { LiveFixture } from '@/lib/apiClient'

interface Props {
  fixture: LiveFixture | null
  liveCount: number
  leagues: string[]
  sources: string[]
  onOpenDetail?: () => void
}

export function LiveContextInspector({ fixture, liveCount, leagues, sources, onOpenDetail }: Props) {


  if (!fixture) {
    return (
      <div className="sticky top-20 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 space-y-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Visão geral</h3>

        <div className="space-y-3">
          <InspectorItem label="Jogos ao vivo" value={String(liveCount)} />
          <InspectorItem label="Ligas" value={String(leagues.length)} />
          <InspectorItem label="Fontes ativas" value={sources.join(', ') || 'Nenhuma'} />
        </div>

        {leagues.length > 0 && (
          <div>
            <h4 className="text-[10px] font-medium text-[var(--text-muted)] mb-2">Ligas ativas</h4>
            <div className="space-y-1">
              {leagues.slice(0, 8).map(l => (
                <p key={l} className="text-[11px] text-[var(--text-secondary)] truncate">{l}</p>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
          Selecione uma partida para ver detalhes e disponibilidade de dados.
        </p>
      </div>
    )
  }

  return (
    <div className="sticky top-20 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 space-y-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Inspector</h3>

      {/* Teams */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col items-center gap-1.5">
          <ClubLogo src={fixture.homeTeam.logo} name={fixture.homeTeam.name} size={36} />
          <span className="text-[10px] font-medium text-[var(--text-primary)] text-center max-w-[80px] line-clamp-2">{fixture.homeTeam.name}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[20px] font-bold tabular-nums text-[var(--text-primary)]">{fixture.score.home ?? 0}</span>
          <span className="text-[var(--text-muted)]">:</span>
          <span className="text-[20px] font-bold tabular-nums text-[var(--text-primary)]">{fixture.score.away ?? 0}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <ClubLogo src={fixture.awayTeam.logo} name={fixture.awayTeam.name} size={36} />
          <span className="text-[10px] font-medium text-[var(--text-primary)] text-center max-w-[80px] line-clamp-2">{fixture.awayTeam.name}</span>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
        <InspectorItem label="Liga" value={fixture.league.name} />
        <InspectorItem label="Status" value={fixture.status.elapsed ? `${fixture.status.elapsed}'` : fixture.status.short} />
        <InspectorItem label="Fonte" value={fixture.provider} />
        <InspectorItem label="País" value={fixture.league.country || 'Indisponível'} />
      </div>

      {/* Availability */}
      <div className="pt-2 border-t border-[var(--border-subtle)]">
        <h4 className="text-[10px] font-medium text-[var(--text-muted)] mb-2">Disponibilidade</h4>
        <div className="grid grid-cols-2 gap-1.5">
          <AvailDot label="Placar" available />
          <AvailDot label="Escudos" available={Boolean(fixture.homeTeam.logo && fixture.awayTeam.logo)} />
          <AvailDot label="Estatísticas" available={fixture.provider === 'api_football'} />
          <AvailDot label="Eventos" available={fixture.provider === 'api_football' || fixture.provider === 'espn'} />
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={() => onOpenDetail?.()}
        className="w-full h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[12px] font-medium text-cyan-400 transition-all hover:bg-cyan-500/15"
      >
        Analisar partida
      </button>
    </div>
  )
}

function InspectorItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[11px] font-medium text-[var(--text-secondary)]">{value}</span>
    </div>
  )
}

function AvailDot({ label, available }: { label: string; available: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${available ? 'bg-emerald-400' : 'bg-[var(--text-muted)]/50'}`} />
      <span className="text-[10px] text-[var(--text-secondary)]">{label}</span>
    </div>
  )
}
