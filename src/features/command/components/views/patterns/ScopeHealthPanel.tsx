/**
 * ScopeHealthPanel — small Scope Knowledge Base footprint panel.
 * Behaviour preserved byte-for-byte from CommandCenterPage.tsx (V3.18E).
 */
import { Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { ScopeKbMatch } from '@/services/intelligence/scopeKnowledgeBase'

interface ScopeHealthPanelProps {
  availableLeagues: string[]
  availableTeams: string[]
  availableMatches: ScopeKbMatch[]
  fixturesCount: number
  patternsCount: number
}

export function ScopeHealthPanel({ availableLeagues, availableTeams, availableMatches, fixturesCount, patternsCount }: ScopeHealthPanelProps) {
  const navigate = useNavigate()
  const stats: { label: string; value: number }[] = [
    { label: 'Ligas', value: availableLeagues.length },
    { label: 'Times', value: availableTeams.length },
    { label: 'Partidas', value: availableMatches.length },
  ]
  return (
    <section className="lg:col-span-5 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#13B8A6]/[0.05] via-white/[0.012] to-transparent p-5 flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-[#13B8A6]/[0.12] border border-[#2DD4BF]/22">
          <Eye size={15} className="text-[#5EEAD4]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold text-white/95 tracking-tight">Inteligência de escopo</h3>
          <p className="text-[11px] text-white/55 mt-0.5 leading-snug">Cresce com o uso real e refina o ScopePicker.</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02] flex-1">
        {stats.map(s => (
          <div key={s.label} className="bg-[#080d16] px-2 py-3 text-center flex flex-col items-center justify-center">
            <span className="text-[19px] font-bold text-white/95 leading-none tabular-nums">{s.value}</span>
            <span className="text-[9px] text-white/50 uppercase tracking-wider font-semibold mt-1">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-[10px] text-white/45">
          <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] tabular-nums">{fixturesCount} fixtures</span>
          <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] tabular-nums">{patternsCount} padrões</span>
        </div>
        <button onClick={() => navigate('/app/settings')} type="button" className="text-[11px] font-medium text-white/65 hover:text-white/95 transition-colors">Gerenciar →</button>
      </div>
    </section>
  )
}
