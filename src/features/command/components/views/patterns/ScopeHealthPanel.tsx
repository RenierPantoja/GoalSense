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

function ScopeStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <span className="text-[16px] font-bold text-white/95 block leading-none tabular-nums">{value}</span>
      <span className="text-[9px] text-white/55 uppercase tracking-wider font-semibold mt-0.5 block">{label}</span>
    </div>
  )
}

export function ScopeHealthPanel({ availableLeagues, availableTeams, availableMatches, fixturesCount, patternsCount }: ScopeHealthPanelProps) {
  const navigate = useNavigate()
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-gradient-to-r from-cyan-500/[0.03] via-white/[0.012] to-transparent p-4 flex items-center gap-4 flex-wrap">
      <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-cyan-500/12 border border-cyan-400/20"><Eye size={16} className="text-cyan-300" /></div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[12px] font-bold text-white/90 tracking-tight">Inteligência de escopo</h3>
        <p className="text-[11px] text-white/55 mt-0.5 leading-snug">A biblioteca local cresce com o uso real e melhora as sugestões do ScopePicker.</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <ScopeStat label="Ligas" value={availableLeagues.length} />
        <ScopeStat label="Times" value={availableTeams.length} />
        <ScopeStat label="Partidas" value={availableMatches.length} />
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-white/45">
        <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]">{fixturesCount} fixtures atuais</span>
        <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]">{patternsCount} padrões</span>
      </div>
      <button onClick={() => navigate('/app/settings')} type="button" className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white/65 hover:text-white/95 border border-white/[0.07] hover:border-white/[0.12] transition-all">Gerenciar em Settings</button>
    </section>
  )
}
