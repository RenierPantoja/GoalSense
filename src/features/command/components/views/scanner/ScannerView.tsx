/**
 * ScannerView — Command Center "Scanner" tab.
 * ─────────────────────────────────────────────────────────────────────────────
 * Lists only fixtures with a hit or discovery (no generic match list ever).
 * Filter pills, counters, sidebar summaries and empty states preserved
 * byte-for-byte from CommandCenterPage.tsx (V3.18E).
 *
 * `isFavoriteTeam` is read from the FavoritesContext at this level so the
 * scanner row stays decoupled from the favorites store.
 */
import { useState } from 'react'
import { Eye } from 'lucide-react'
import type { LiveFixture } from '@/lib/apiClient'
import { useFavorites } from '@/context/FavoritesContext'
import type { Pattern, ScannerEntry } from '../../../types/commandTypes'
import { isLiveFx } from '../../../commandHelpers'
import { CounterCell } from '../shared/CounterCell'
import { ScannerRow } from './ScannerRow'
import { ScannerSidebar } from './ScannerSidebar'

type ScannerFilter = 'all' | 'critical' | 'attention' | 'favorites' | 'live' | 'soon' | 'rich'

export interface ScannerViewProps {
  hasIntelligence: boolean
  entries: ScannerEntry[]
  openMatch: (fx: LiveFixture) => void
  isAdvanced: boolean
  onGoToPatterns: () => void
  patterns: Pattern[]
}

export function ScannerView({ hasIntelligence, entries, openMatch, isAdvanced, onGoToPatterns, patterns }: ScannerViewProps) {
  const { isFavoriteTeam } = useFavorites()
  const [filter, setFilter] = useState<ScannerFilter>('all')

  // Empty state — no intelligence configured
  if (!hasIntelligence) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <section className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.02] via-white/[0.008] to-transparent p-10 text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] mb-4"><Eye size={20} className="text-white/40" /></div>
          <h3 className="text-[18px] font-semibold text-white/85 mb-1.5">Scanner operacional</h3>
          <p className="text-[12px] text-white/55 max-w-[420px] mx-auto leading-relaxed">Somente partidas com padrões ou descobertas ativas aparecem aqui. Configure um radar para o motor começar a detectar sinais reais.</p>
          <div className="flex justify-center gap-2.5 mt-5">
            <button onClick={onGoToPatterns} className="px-4 py-2.5 rounded-xl text-[12px] font-semibold bg-cyan-500/12 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/18 transition-colors" type="button">Ativar template</button>
            <button onClick={onGoToPatterns} className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/55 border border-white/[0.07] hover:text-white/80 hover:border-white/[0.12] transition-colors" type="button">Configurar automático</button>
          </div>
        </section>
        <ScannerSidebar entries={[]} isFavoriteTeam={isFavoriteTeam} />
      </div>
    )
  }

  // Counters per category
  const liveCount = entries.filter(e => isLiveFx(e.fixture)).length
  const soonCount = entries.filter(e => !isLiveFx(e.fixture) && new Date(e.fixture.date).getTime() - Date.now() <= 60 * 60 * 1000).length
  const criticalCount = entries.filter(e => e.priority === 'critical').length
  const attentionCount = entries.filter(e => e.priority === 'attention').length
  const favCount = entries.filter(e => isFavoriteTeam(e.fixture.homeTeam.name) || isFavoriteTeam(e.fixture.awayTeam.name)).length
  const richCount = entries.filter(e => e.fixture.provider === 'espn').length

  const filteredEntries = entries.filter(e => {
    if (filter === 'all') return true
    if (filter === 'critical') return e.priority === 'critical'
    if (filter === 'attention') return e.priority === 'attention'
    if (filter === 'favorites') return isFavoriteTeam(e.fixture.homeTeam.name) || isFavoriteTeam(e.fixture.awayTeam.name)
    if (filter === 'live') return isLiveFx(e.fixture)
    if (filter === 'soon') return !isLiveFx(e.fixture) && new Date(e.fixture.date).getTime() - Date.now() <= 60 * 60 * 1000
    if (filter === 'rich') return e.fixture.provider === 'espn'
    return true
  })

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5">
        {/* Header */}
        <header className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-transparent p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-[20px] font-bold text-white/90 tracking-tight">Scanner operacional</h2>
              <p className="text-[12px] text-white/55 mt-1">Somente partidas com padrões ou descobertas ativas aparecem aqui.</p>
            </div>
            <div className="text-right shrink-0"><span className="text-[26px] font-bold text-white/90 tabular-nums leading-none">{entries.length}</span><span className="text-[10px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">{entries.length === 1 ? 'sinal' : 'sinais'}</span></div>
          </div>
          {/* Counter strip */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-px rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.01]">
            <CounterCell label="Críticos" value={criticalCount} tone="rose" />
            <CounterCell label="Atenção" value={attentionCount} tone="amber" />
            <CounterCell label="Favoritos" value={favCount} tone="cyan" />
            <CounterCell label="Ao vivo" value={liveCount} tone="emerald" />
            <CounterCell label="Em breve" value={soonCount} tone="cyan" />
            <CounterCell label="Dados ricos" value={richCount} tone="white" />
          </div>
        </header>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {([
            ['all', 'Todos', entries.length],
            ['critical', 'Críticos', criticalCount],
            ['attention', 'Atenção', attentionCount],
            ['favorites', 'Favoritos', favCount],
            ['live', 'Ao vivo', liveCount],
            ['soon', 'Em breve', soonCount],
            ['rich', 'Dados ricos', richCount],
          ] as [ScannerFilter, string, number][]).map(([key, label, count]) => {
            const isActive = filter === key
            return (
              <button key={key} onClick={() => setFilter(key)} type="button" className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1.5 ${isActive ? 'bg-white/[0.09] text-white border border-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-white/55 border border-white/[0.06] hover:text-white/85 hover:border-white/[0.1]'}`}>
                {label}
                {count > 0 && <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md ${isActive ? 'bg-cyan-500/22 text-cyan-200' : 'bg-white/[0.06] text-white/55'}`}>{count}</span>}
              </button>
            )
          })}
        </div>

        {/* Entries */}
        {filteredEntries.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.008] p-10 text-center">
            <p className="text-[13px] text-white/55 font-medium">{entries.length === 0 ? 'Nenhum sinal detectado agora' : 'Nenhum sinal nesta categoria'}</p>
            <p className="text-[11px] text-white/35 mt-1">{entries.length === 0 ? 'O motor está analisando partidas com os padrões configurados.' : 'Selecione outro filtro acima para ver outros sinais.'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredEntries.map(entry => <ScannerRow key={entry.fixture.id} entry={entry} openMatch={openMatch} isAdvanced={isAdvanced} isFavoriteTeam={isFavoriteTeam} patterns={patterns} />)}
          </div>
        )}
      </div>

      <ScannerSidebar entries={entries} isFavoriteTeam={isFavoriteTeam} />
    </div>
  )
}
