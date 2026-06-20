/**
 * BacktestResultsTable — premium, expandable per-fixture results with filters.
 * Honest tones; unknown/not_evaluable/no_trigger are neutral (never red).
 */
import { useMemo, useState } from 'react'
import { ChevronRight, Search, PlayCircle } from 'lucide-react'
import type { BacktestSignalResult, ResultDisplayStatus } from '../../../backtest/backtestTypes'
import { displayStatusOf, OUTCOME_LABEL, OUTCOME_TONE } from '../../../backtest/backtestTypes'

interface Props {
  results: BacktestSignalResult[]
  onOpenReplay: (fixtureId: string) => void
}

const FILTERS: { key: ResultDisplayStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'confirmed', label: 'Confirmados' },
  { key: 'confirmed_partial', label: 'Parciais' },
  { key: 'failed', label: 'Falhas' },
  { key: 'unknown', label: 'Sem dados' },
  { key: 'not_evaluable', label: 'Não avaliável' },
  { key: 'no_trigger', label: 'Não dispararia' },
]

function norm(s: string): string { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

/** B35: per-row inline snapshot evidence badges (exact/inferred/absent). */
function SnapshotBadge({ label, snapshotId, strength, capturedAt, minute, limitations }: {
  label: string; snapshotId?: string | null; strength?: string; capturedAt?: string | null; minute?: number | null; limitations?: string[]
}) {
  const exact = !!snapshotId
  const inferred = !exact && (strength === 'strong_inferred' || strength === 'window_inferred' || strength === 'weak_inferred')
  const cls = exact ? 'border-[#2DD4BF]/25 text-[#7FE9DC]' : inferred ? 'border-sky-400/20 text-sky-200/80' : 'border-white/10 text-white/40'
  const state = exact ? 'Exato' : inferred ? 'Inferido' : 'Ausente'
  const tip = [snapshotId ? `snap ${snapshotId.slice(0, 8)}…` : null, minute != null ? `${minute}'` : null, capturedAt ? new Date(capturedAt).toLocaleString('pt-BR') : null, (limitations && limitations.length) ? limitations.join(', ') : null].filter(Boolean).join(' · ')
  return <span title={tip || state} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${cls}`}>{label}: {state}</span>
}

function SnapshotEvidenceRow({ r }: { r: BacktestSignalResult }) {
  const hasInline = r.triggerEvidenceStrength != null || r.outcomeEvidenceStrength != null || r.triggerSnapshotId != null || r.outcomeSnapshotId != null
  if (!hasInline) return <p className="text-[10.5px] text-white/35">Sem evidência inline neste run (rode o backtest novamente para captura exata).</p>
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[9.5px] uppercase tracking-wider text-white/40 font-semibold">Evidência</span>
      <SnapshotBadge label="Trigger" snapshotId={r.triggerSnapshotId} strength={r.triggerEvidenceStrength} capturedAt={r.triggerSnapshotCapturedAt} minute={r.triggerSnapshotMinute} limitations={r.triggerEvidenceLimitations} />
      <SnapshotBadge label="Outcome" snapshotId={r.outcomeSnapshotId} strength={r.outcomeEvidenceStrength} capturedAt={r.outcomeSnapshotCapturedAt} minute={r.outcomeSnapshotMinute} limitations={r.outcomeEvidenceLimitations} />
    </div>
  )
}

export function BacktestResultsTable({ results, onOpenReplay }: Props) {
  const [filter, setFilter] = useState<ResultDisplayStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: results.length }
    for (const r of results) { const s = displayStatusOf(r); c[s] = (c[s] || 0) + 1 }
    return c
  }, [results])

  const visible = useMemo(() => {
    const q = norm(search.trim())
    return results.filter(r => {
      if (filter !== 'all' && displayStatusOf(r) !== filter) return false
      if (q && !norm(`${r.fixtureLabel} ${r.leagueName}`).includes(q)) return false
      return true
    })
  }, [results, filter, search])

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-[14px] font-semibold text-white/95 tracking-tight">Resultados por jogo</h3>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar time/jogo" className="h-9 w-[220px] pl-9 pr-3 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[12px] text-white/90 placeholder:text-white/30 outline-none focus:border-[#2DD4BF]/40" />
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {FILTERS.map(f => {
          const n = counts[f.key] || 0
          const active = filter === f.key
          return (
            <button key={f.key} onClick={() => setFilter(f.key)} type="button" className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5 ${active ? 'bg-white/[0.08] text-white/95 border border-white/[0.14]' : 'text-white/50 border border-transparent hover:text-white/80 hover:bg-white/[0.03]'}`}>
              {f.label}<span className={`text-[10px] tabular-nums ${active ? 'text-white/70' : 'text-white/35'}`}>{n}</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.005] p-8 text-center">
          <p className="text-[13px] text-white/70 font-medium">Nenhum resultado neste filtro</p>
          <p className="text-[11px] text-white/45 mt-1">Ajuste o filtro ou a busca.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {visible.map(r => {
            const status = displayStatusOf(r)
            const tone = OUTCOME_TONE[status]
            const open = expanded === r.fixtureId
            return (
              <div key={r.fixtureId} className={`rounded-xl border ${open ? 'border-white/[0.12]' : 'border-white/[0.06]'} bg-white/[0.012] overflow-hidden`}>
                <button onClick={() => setExpanded(open ? null : r.fixtureId)} type="button" className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                  <ChevronRight size={14} className={`text-white/35 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-white/90 truncate">{r.fixtureLabel}</span>
                      <span className="text-[10px] text-white/40">{r.leagueName}</span>
                    </div>
                    <div className="flex items-center gap-x-3 text-[11px] text-white/45 mt-0.5 flex-wrap">
                      {r.wouldTrigger && r.minute != null && <span>disparo {r.minute}'</span>}
                      {r.wouldTrigger && <span>· {r.scoreState.home}–{r.scoreState.away}</span>}
                      {r.confidenceAtTrigger != null && <span>· conf {r.confidenceAtTrigger}</span>}
                      <span>· dados {r.dataQuality}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1.5 text-[10.5px] font-medium px-2 py-1 rounded-md border ${tone.bg} ${tone.border} ${tone.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />{OUTCOME_LABEL[status]}
                  </span>
                </button>
                {open && (
                  <div className="px-4 pb-4 pt-1 border-t border-white/[0.05] space-y-3">
                    <p className="text-[11.5px] text-white/60 leading-relaxed">{r.outcomeReason}</p>
                    <SnapshotEvidenceRow r={r} />
                    {r.matchedConditions.length > 0 && (
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-[9.5px] uppercase tracking-wider text-white/40 font-semibold mt-0.5">Bateram</span>
                        {r.matchedConditions.map((c, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/8 border border-emerald-400/15 text-emerald-200/80">{c}</span>)}
                      </div>
                    )}
                    {r.missingConditions.length > 0 && (
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-[9.5px] uppercase tracking-wider text-white/40 font-semibold mt-0.5">Faltaram</span>
                        {r.missingConditions.map((c, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-white/55">{c}</span>)}
                      </div>
                    )}
                    {r.blockedReasons.length > 0 && (
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-[9.5px] uppercase tracking-wider text-white/40 font-semibold mt-0.5">Bloqueios</span>
                        {r.blockedReasons.map((c, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/8 border border-amber-400/15 text-amber-100/70">{c}</span>)}
                      </div>
                    )}
                    <button onClick={() => onOpenReplay(r.fixtureId)} type="button" className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#5EEAD4] hover:text-[#7FE9DC] transition-colors">
                      <PlayCircle size={14} />Ver replay minuto a minuto
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
