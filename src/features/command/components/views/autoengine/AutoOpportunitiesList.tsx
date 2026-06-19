/**
 * AutoOpportunitiesList — what the engine sees AND what it rejects. (B20)
 * ─────────────────────────────────────────────────────────────────────────────
 * Blocked opportunities are shown on purpose — they teach that the engine is
 * conservative. Score is signal-quality, never a "chance". No betting colors.
 */
import { useMemo, useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import type { AutoOpportunityDto, AutoOpportunityFilters } from '@/features/command/intelligence/autoEngineTypes'
import { OPP_TYPE_LABEL, STATUS_LABEL, STATUS_TONE, BAND_LABEL, blockReasonLabel } from '@/features/command/intelligence/autoEngineTypes'

interface Props {
  opportunities: AutoOpportunityDto[]
  loading: boolean
  /** Lock the view to blocked-only (the "Bloqueadas" segment). */
  blockedOnly?: boolean
  onOpen: (o: AutoOpportunityDto) => void
}

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export function AutoOpportunitiesList({ opportunities, loading, blockedOnly, onOpen }: Props) {
  const [f, setF] = useState<AutoOpportunityFilters>({})
  const patch = (p: Partial<AutoOpportunityFilters>) => setF(prev => ({ ...prev, ...p }))

  const leagues = useMemo(() => [...new Set(opportunities.map(o => o.leagueName).filter(Boolean))].sort(), [opportunities])

  const filtered = useMemo(() => {
    return opportunities.filter(o => {
      if (blockedOnly && o.status !== 'blocked') return false
      if (!blockedOnly && f.onlyBlocked && o.status !== 'blocked') return false
      if (f.onlyStrong && o.status !== 'strong') return false
      if (f.status && o.status !== f.status) return false
      if (f.type && o.opportunityType !== f.type) return false
      if (f.league && o.leagueName !== f.league) return false
      if (f.confidenceBand && o.confidenceBand !== f.confidenceBand) return false
      if (f.dataQuality && o.evidence?.dataQuality !== f.dataQuality) return false
      if (f.minScore != null && o.score < f.minScore) return false
      if (f.blockReason && !o.riskGate?.blockReasons?.includes(f.blockReason)) return false
      if (f.query) {
        const q = norm(f.query)
        if (!norm(o.fixtureLabel).includes(q) && !norm(o.homeTeam).includes(q) && !norm(o.awayTeam).includes(q) && !norm(o.leagueName).includes(q)) return false
      }
      return true
    })
  }, [opportunities, f, blockedOnly])

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={f.query || ''} onChange={e => patch({ query: e.target.value })} placeholder="Buscar jogo, time ou liga…" className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-white/90 placeholder:text-white/30 outline-none focus:border-[#2DD4BF]/40" />
          </div>
          <SlidersHorizontal size={14} className="text-white/30" />
        </div>
        <div className="flex flex-wrap gap-2">
          {!blockedOnly && (
            <Select value={f.status || ''} onChange={v => patch({ status: v as any })} options={[['', 'Todos os status'], ['strong', 'Forte'], ['watch', 'Observação'], ['candidate', 'Candidata'], ['blocked', 'Bloqueada']]} />
          )}
          <Select value={f.confidenceBand || ''} onChange={v => patch({ confidenceBand: v as any })} options={[['', 'Qualquer sinal'], ['high', 'Sinal alto'], ['medium', 'Sinal médio'], ['low', 'Sinal baixo'], ['insufficient_data', 'Dados insuf.']]} />
          <Select value={f.dataQuality || ''} onChange={v => patch({ dataQuality: v as any })} options={[['', 'Qualquer dado'], ['rich', 'Dados completos'], ['partial', 'Parciais'], ['poor', 'Pobres'], ['unknown', 'Desconhecidos']]} />
          {leagues.length > 0 && (
            <Select value={f.league || ''} onChange={v => patch({ league: v })} options={[['', 'Todas as ligas'], ...leagues.map(l => [l, l] as [string, string])]} />
          )}
          <label className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[11.5px] text-white/60">
            <span>Score ≥</span>
            <input type="number" min={0} max={100} value={f.minScore ?? ''} onChange={e => patch({ minScore: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-12 bg-transparent outline-none text-white/90 tabular-nums" />
          </label>
        </div>
      </div>

      {loading
        ? <p className="text-[12px] text-white/40 px-1 py-6 text-center">Carregando oportunidades…</p>
        : filtered.length === 0
          ? <p className="text-[12px] text-white/40 px-1 py-8 text-center">{blockedOnly ? 'Nenhuma oportunidade bloqueada no momento.' : 'Nenhuma oportunidade corresponde aos filtros.'}</p>
          : (
            <div className="space-y-2">
              {filtered.map(o => <Row key={o.id} o={o} onOpen={onOpen} />)}
            </div>
          )}
    </div>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="h-8 px-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[11.5px] text-white/70 outline-none focus:border-[#2DD4BF]/40 max-w-[180px]">
      {options.map(([v, l]) => <option key={v} value={v} className="bg-[#0b0f16]">{l}</option>)}
    </select>
  )
}

function Row({ o, onOpen }: { o: AutoOpportunityDto; onOpen: (o: AutoOpportunityDto) => void }) {
  const topRisk = o.riskGate?.blockReasons?.[0]
  const topEvidence = o.evidence?.passedSignals?.slice(0, 2) ?? []
  return (
    <button type="button" onClick={() => onOpen(o)} className="w-full text-left rounded-xl border border-white/[0.07] bg-white/[0.012] hover:bg-white/[0.03] hover:border-white/[0.12] transition-colors p-3.5">
      <div className="flex items-center gap-3">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-white/90 font-medium truncate">{o.fixtureLabel}</p>
          <p className="text-[11px] text-white/45 truncate">{o.leagueName} · {OPP_TYPE_LABEL[o.opportunityType]}</p>
        </div>
        <div className="text-right shrink-0">
          <span className="block text-[16px] font-bold text-white/85 tabular-nums leading-none">{o.score}</span>
          <span className="block text-[9px] text-white/40 uppercase tracking-wider mt-0.5">{BAND_LABEL[o.confidenceBand]}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        <span className="text-[10px] text-white/40 tabular-nums">{o.minute != null ? `${o.minute}'` : "—'"} · {o.scoreState.home}–{o.scoreState.away}</span>
        {o.status === 'blocked' && topRisk
          ? <span className="text-[10.5px] px-1.5 py-0.5 rounded border bg-amber-500/8 border-amber-400/15 text-amber-100/70">bloqueada: {blockReasonLabel(topRisk)}</span>
          : topEvidence.map((e, i) => <span key={i} className="text-[10.5px] px-1.5 py-0.5 rounded border bg-white/[0.04] border-white/[0.08] text-white/55">{e}</span>)}
        <span className="ml-auto text-[10.5px] text-[#5EEAD4]/70">Ver análise →</span>
      </div>
    </button>
  )
}
