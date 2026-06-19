/**
 * ServerAlertList — scalable, server-side alert list (B18).
 * ─────────────────────────────────────────────────────────────────────────────
 * Primary source = GET /api/intelligence/alerts/search (paginated, filtered).
 * Honest: loading / empty / offline states; CSV export (env-gated → disabled note).
 * Read-only. "Ver análise" opens the Signal Ledger drawer.
 */
import { useCallback, useEffect, useState } from 'react'
import { Search, Download, Filter, X, ChevronDown } from 'lucide-react'
import { alertIntelligenceApi } from '@/services/alertIntelligenceApi'
import type { AlertSearchItem, AlertIntelFilters, AlertResult } from '../../../../intelligence/alertIntelligenceTypes'
import { RESULT_LABEL, RESULT_TONE } from '../../../../intelligence/alertIntelligenceTypes'

interface Props {
  filters: AlertIntelFilters
  onFiltersChange: (patch: Partial<AlertIntelFilters>) => void
  onClearFilters: () => void
  onOpenAnalysis: (alertId: string, headline: { patternName: string; matchLabel: string; minute: number | null; score: { home: number; away: number }; confidence: number; status: string }) => void
}

const RESULT_OPTIONS: (AlertResult | 'all')[] = ['all', 'pending', 'confirmed', 'confirmed_partial', 'failed', 'unknown', 'expired']
const PAGE = 50

export function ServerAlertList({ filters, onFiltersChange, onClearFilters, onOpenAnalysis }: Props) {
  const [items, setItems] = useState<AlertSearchItem[]>([])
  const [total, setTotal] = useState(0)
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const runSearch = useCallback(async (cursor?: number, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true)
    setError(null)
    const data = await alertIntelligenceApi.searchAlertIntelligence(filters, { limit: PAGE, cursor })
    if (!data) {
      if (!append) { setItems([]); setTotal(0); setNextCursor(null) }
      setError('Busca server-side indisponível (backend offline ou sem dados).')
      setLoading(false); setLoadingMore(false)
      return
    }
    setItems(prev => append ? [...prev, ...data.items] : data.items)
    setTotal(data.total)
    setNextCursor(data.nextCursor)
    setLoading(false); setLoadingMore(false)
  }, [filters]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { runSearch(undefined, false) }, [runSearch])

  const onExport = async () => {
    setExporting(true); setExportNote(null)
    const r = await alertIntelligenceApi.exportAlertsCsv(filters)
    setExporting(false)
    if (r.disabled) setExportNote(r.error || 'Exportação desabilitada (ENABLE_ALERT_EXPORT).')
    else if (!r.ok) setExportNote(r.error === 'no_backend' ? 'Backend não conectado.' : (r.error || 'Falha ao exportar.'))
    else setExportNote(null)
  }

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== 'result' && v != null && v !== '').length

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold text-white/95 tracking-tight">Sinais</h3>
          <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border text-[#7FE9DC]/85 bg-[#13B8A6]/[0.08] border-[#2DD4BF]/20">Busca server-side</span>
          <span className="text-[11px] text-white/40 tabular-nums">{total}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(s => !s)} type="button" className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[11.5px] font-medium border transition-colors ${activeFilterCount > 0 ? 'border-[#2DD4BF]/30 text-[#7FE9DC] bg-[#13B8A6]/[0.06]' : 'border-white/[0.08] text-white/60 hover:text-white/85'}`}>
            <Filter size={13} />Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}<ChevronDown size={12} className={showFilters ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          <button onClick={onExport} disabled={exporting} type="button" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[11.5px] font-medium border border-white/[0.08] text-white/65 hover:text-white/90 hover:border-white/[0.14] transition-colors disabled:opacity-40"><Download size={13} />{exporting ? 'Exportando…' : 'Exportar CSV'}</button>
        </div>
      </div>

      {/* Search box */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input value={filters.q || ''} onChange={e => onFiltersChange({ q: e.target.value || undefined })} placeholder="Buscar time, jogo ou radar" className="w-full h-10 pl-9 pr-3 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[12.5px] text-white/90 placeholder:text-white/30 outline-none focus:border-[#2DD4BF]/40" />
      </div>

      {/* Result chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {RESULT_OPTIONS.map(r => {
          const active = (filters.result || 'all') === r
          return (
            <button key={r} onClick={() => onFiltersChange({ result: r === 'all' ? undefined : r })} type="button" className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${active ? 'bg-white/[0.09] text-white border border-white/[0.14]' : 'text-white/55 border border-white/[0.06] hover:text-white/85'}`}>
              {r === 'all' ? 'Todos' : RESULT_LABEL[r as AlertResult]}
            </button>
          )
        })}
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3 mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <FilterInput label="Liga" value={filters.league || ''} onChange={v => onFiltersChange({ league: v || undefined })} />
          <FilterInput label="Time" value={filters.team || ''} onChange={v => onFiltersChange({ team: v || undefined })} />
          <FilterInput label="Radar" value={filters.patternName || ''} onChange={v => onFiltersChange({ patternName: v || undefined })} />
          <FilterSelect label="Severidade" value={filters.severity || ''} onChange={v => onFiltersChange({ severity: v || undefined })} options={[['', 'Todas'], ['critical', 'Crítico'], ['attention', 'Atenção'], ['info', 'Info']]} />
          <FilterSelect label="Dados" value={filters.dataQuality || ''} onChange={v => onFiltersChange({ dataQuality: v || undefined })} options={[['', 'Todas'], ['rich', 'Rica'], ['partial', 'Parcial'], ['poor', 'Pobre'], ['unknown', 'Desconhecida']]} />
          <FilterSelect label="Janela" value={filters.minuteWindow || ''} onChange={v => onFiltersChange({ minuteWindow: v || undefined })} options={[['', 'Todas'], ['0_15', "0–15'"], ['16_30', "16–30'"], ['31_45', "31–45'"], ['46_60', "46–60'"], ['61_70', "61–70'"], ['71_80', "71–80'"], ['81_90', "81–90'"], ['stoppage', 'Acréscimos']]} />
          <FilterSelect label="Com falha" value={filters.hasFailureAnalysis ? '1' : ''} onChange={v => onFiltersChange({ hasFailureAnalysis: v ? true : undefined })} options={[['', 'Indiferente'], ['1', 'Só com análise']]} />
          <div className="flex items-end"><button onClick={onClearFilters} type="button" className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white/80"><X size={12} />Limpar filtros</button></div>
        </div>
      )}

      {exportNote && <div className="rounded-lg border border-amber-400/15 bg-amber-500/[0.05] px-3 py-2 text-[11px] text-amber-100/80 mb-3">{exportNote}</div>}

      {/* List */}
      {loading ? (
        <p className="text-[12px] text-white/40 py-10 text-center">Carregando sinais…</p>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/15 bg-rose-500/[0.04] px-4 py-3 text-[12px] text-rose-200/80">{error}</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.005] p-8 text-center">
          <p className="text-[13px] text-white/70 font-medium">Nenhum alerta encontrado com estes filtros</p>
          <p className="text-[11px] text-white/45 mt-1">Ajuste os filtros ou limpe-os. Sinais aparecem aqui após registro no Signal Ledger.</p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {items.map(it => {
              const tone = RESULT_TONE[it.result] || RESULT_TONE.pending
              return (
                <div key={it.id} className="rounded-xl border border-white/[0.06] bg-white/[0.012] px-4 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-white/90 truncate">{it.fixtureLabel}</span>
                        <span className="text-[10px] text-white/40">{it.leagueName}</span>
                        {it.patternName?.startsWith('Motor Automático') && (
                          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border text-[#7FE9DC]/85 bg-[#13B8A6]/[0.08] border-[#2DD4BF]/20">Motor Automático</span>
                        )}
                      </div>
                      <div className="flex items-center gap-x-2.5 text-[11px] text-white/45 mt-0.5 flex-wrap">
                        <span className="text-white/60">{it.patternName}</span>
                        {it.minute != null && <span>· {it.minute}'</span>}
                        <span>· {it.scoreState.home}–{it.scoreState.away}</span>
                        {it.confidence != null && <span>· conf {it.confidence}</span>}
                        <span>· dados {it.dataQuality}</span>
                        {it.learningEventCount > 0 && <span className="text-[#7FE9DC]/70">· {it.learningEventCount} aprend.</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-medium px-2 py-1 rounded-md border ${tone.bg} ${tone.border} ${tone.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />{RESULT_LABEL[it.result]}
                      </span>
                      {it.canOpenAnalysis && (
                        <button onClick={() => onOpenAnalysis(it.alertId, { patternName: it.patternName, matchLabel: it.fixtureLabel, minute: it.minute, score: it.scoreState, confidence: it.confidence ?? 0, status: it.result })} type="button" className="text-[11px] font-medium text-[#5EEAD4] hover:text-[#7FE9DC] transition-colors">Ver análise →</button>
                      )}
                    </div>
                  </div>
                  {it.summaryReason && <p className="text-[11px] text-white/45 mt-1 truncate">{it.summaryReason}</p>}
                </div>
              )
            })}
          </div>
          {nextCursor != null && (
            <button onClick={() => runSearch(nextCursor, true)} disabled={loadingMore} type="button" className="mt-3 w-full h-10 rounded-lg text-[12px] font-medium text-white/70 border border-white/[0.08] hover:text-white/95 hover:border-white/[0.14] transition-colors disabled:opacity-40">{loadingMore ? 'Carregando…' : `Carregar mais (${items.length}/${total})`}</button>
          )}
          <p className="text-[10px] text-white/30 mt-2">Resultado paginado server-side · {PAGE} por página.</p>
        </>
      )}
    </section>
  )
}

function FilterInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[9.5px] uppercase tracking-wider text-white/45 font-semibold block mb-1">{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} className="w-full h-8 px-2.5 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[11.5px] text-white/90 outline-none focus:border-[#2DD4BF]/40" />
    </label>
  )
}
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="text-[9.5px] uppercase tracking-wider text-white/45 font-semibold block mb-1">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full h-8 px-2 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[11.5px] text-white/90 outline-none focus:border-[#2DD4BF]/40">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}
