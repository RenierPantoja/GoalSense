/**
 * ScannerSidebar — right rail of the Scanner view, summarising signals.
 * Behaviour preserved byte-for-byte from CommandCenterPage.tsx (V3.18E).
 */
import type { ScannerEntry } from '../../../types/commandTypes'
import { isLiveFx } from '../../../commandHelpers'
import { SidebarRow } from '../shared/SidebarRow'

interface ScannerSidebarProps {
  entries: ScannerEntry[]
  isFavoriteTeam: (name: string) => boolean
}

export function ScannerSidebar({ entries, isFavoriteTeam }: ScannerSidebarProps) {
  const totalEntries = entries.length
  const fav = entries.filter(e => isFavoriteTeam(e.fixture.homeTeam.name) || isFavoriteTeam(e.fixture.awayTeam.name)).length
  const live = entries.filter(e => isLiveFx(e.fixture)).length
  const espn = entries.filter(e => e.fixture.provider === 'espn').length

  return (
    <aside className="space-y-3">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Resumo dos sinais</h4>
        <div className="space-y-2">
          <SidebarRow label="Sinais totais" value={totalEntries} />
          <SidebarRow label="Críticos" value={entries.filter(e => e.priority === 'critical').length} tone="rose" />
          <SidebarRow label="Atenção" value={entries.filter(e => e.priority === 'attention').length} tone="amber" />
          <SidebarRow label="Observar" value={entries.filter(e => e.priority === 'watch').length} tone="cyan" />
        </div>
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] p-4">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55 mb-3">Origem</h4>
        <div className="space-y-2">
          <SidebarRow label="Padrões manuais" value={entries.filter(e => e.topPattern !== null).length} tone="white" />
          <SidebarRow label="Descoberta automática" value={entries.filter(e => e.topPattern === null).length} tone="cyan" />
          <SidebarRow label="Cobertura ESPN" value={espn} tone="emerald" />
          <SidebarRow label="Favoritos envolvidos" value={fav} tone="cyan" />
          <SidebarRow label="Ao vivo agora" value={live} tone="emerald" />
        </div>
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.03] via-transparent to-transparent p-4">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300/80 mb-2">Como funciona</h4>
        <p className="text-[11px] text-white/55 leading-relaxed">
          Cada linha é uma partida onde pelo menos um padrão configurado ou uma descoberta do motor automático bateu. Clique para abrir a análise completa.
        </p>
      </div>
    </aside>
  )
}
