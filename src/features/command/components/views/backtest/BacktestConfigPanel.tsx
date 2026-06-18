/**
 * BacktestConfigPanel — honest backtest configuration. No mocked pattern list.
 * Blocks the run when the API is disabled / backend not connected.
 */
import { Play, Lock, Info } from 'lucide-react'
import type { Pattern } from '../../../types/commandTypes'

export interface BacktestFormState {
  patternId: string
  dateFrom: string
  dateTo: string
  leagues: string
  teams: string
  maxFixtures: number
  includeUnknown: boolean
  evaluationMode: 'strict' | 'diagnostic'
}

interface Props {
  patterns: Pattern[]
  value: BacktestFormState
  onChange: (patch: Partial<BacktestFormState>) => void
  onRun: () => void
  running: boolean
  disabled: boolean
  backendConfigured: boolean
  maxFixturesCap: number
}

export function BacktestConfigPanel({ patterns, value, onChange, onRun, running, disabled, backendConfigured, maxFixturesCap }: Props) {
  const selected = patterns.find(p => p.id === value.patternId) || null
  const notSynced = !!selected && !selected.backendId
  const canRun = backendConfigured && !disabled && !!value.patternId && !running

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-5">
      <h3 className="text-[14px] font-semibold text-white/95 tracking-tight mb-4">Configurar backtest</h3>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Radar */}
        <div className="lg:col-span-5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-white/45 block mb-1.5">Radar</label>
          <select value={value.patternId} onChange={e => onChange({ patternId: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[13px] text-white/90 outline-none focus:border-[#2DD4BF]/40">
            <option value="">Selecione um radar…</option>
            {patterns.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {/* Period */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/45 block mb-1.5">De</label>
            <input type="date" value={value.dateFrom} onChange={e => onChange({ dateFrom: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[12px] text-white/90 outline-none focus:border-[#2DD4BF]/40" />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/45 block mb-1.5">Até</label>
            <input type="date" value={value.dateTo} onChange={e => onChange({ dateTo: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[12px] text-white/90 outline-none focus:border-[#2DD4BF]/40" />
          </div>
        </div>
        {/* Max fixtures */}
        <div className="lg:col-span-3">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-white/45 block mb-1.5">Máx. jogos (até {maxFixturesCap})</label>
          <input type="number" min={1} max={maxFixturesCap} value={value.maxFixtures} onChange={e => onChange({ maxFixtures: Math.min(maxFixturesCap, Math.max(1, Number(e.target.value) || 1)) })} className="w-full h-10 px-3 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[13px] text-white/90 tabular-nums outline-none focus:border-[#2DD4BF]/40" />
        </div>

        {/* Leagues / teams */}
        <div className="lg:col-span-6">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-white/45 block mb-1.5">Ligas (opcional, separadas por vírgula)</label>
          <input value={value.leagues} onChange={e => onChange({ leagues: e.target.value })} placeholder="Ex: Série A, Premier League" className="w-full h-10 px-3 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[12.5px] text-white/90 placeholder:text-white/30 outline-none focus:border-[#2DD4BF]/40" />
        </div>
        <div className="lg:col-span-6">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-white/45 block mb-1.5">Times (opcional, separados por vírgula)</label>
          <input value={value.teams} onChange={e => onChange({ teams: e.target.value })} placeholder="Ex: Flamengo, Palmeiras" className="w-full h-10 px-3 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[12.5px] text-white/90 placeholder:text-white/30 outline-none focus:border-[#2DD4BF]/40" />
        </div>
      </div>

      {/* Options row */}
      <div className="flex items-center gap-4 flex-wrap mt-4">
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
          {(['diagnostic', 'strict'] as const).map(m => (
            <button key={m} onClick={() => onChange({ evaluationMode: m })} type="button" className={`px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-colors ${value.evaluationMode === m ? 'bg-white/[0.08] text-white/95' : 'text-white/50 hover:text-white/80'}`}>
              {m === 'diagnostic' ? 'Diagnóstico' : 'Estrito'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-white/65 cursor-pointer select-none">
          <input type="checkbox" checked={value.includeUnknown} onChange={e => onChange({ includeUnknown: e.target.checked })} className="accent-[#13B8A6]" />
          Incluir sem-dados/não avaliável
        </label>
        <div className="flex-1" />
        {canRun ? (
          <button onClick={onRun} type="button" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-[#13B8A6] hover:bg-[#0FA594] transition-colors shadow-[0_8px_22px_-10px_rgba(19,184,166,0.9)] disabled:opacity-40">
            <Play size={14} />{running ? 'Rodando…' : 'Rodar backtest'}
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/45 border border-white/[0.08] bg-white/[0.02]">
            <Lock size={13} />{!backendConfigured ? 'Conecte um backend' : disabled ? 'Backtest desabilitado' : !value.patternId ? 'Escolha um radar' : 'Indisponível'}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2">
        <Info size={12} className="text-white/35 mt-0.5 shrink-0" />
        <p className="text-[11px] text-white/45 leading-relaxed">
          O backtest usa apenas snapshots registrados anteriormente pelo motor — não é projeção garantida de resultado futuro.
          {notSynced && <span className="text-amber-200/70"> Este radar ainda não foi sincronizado com o backend; sincronize-o antes de testar.</span>}
        </p>
      </div>
    </section>
  )
}
