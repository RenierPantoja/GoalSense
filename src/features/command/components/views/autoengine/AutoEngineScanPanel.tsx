/**
 * AutoEngineScanPanel — explicit, controlled manual scan. (B20)
 * ─────────────────────────────────────────────────────────────────────────────
 * Never loops, never runs on its own. Scan creates NO alert, sends NO Telegram,
 * uses NO odds. Opportunity is analysis, not a betting recommendation.
 */
import { useState } from 'react'
import { Play, Loader2, Info } from 'lucide-react'
import type { AutoEngineRunDto, AutoEngineScanRequest } from '@/features/command/intelligence/autoEngineTypes'

interface Props {
  enabled: boolean
  writeEnabled: boolean
  backendConfigured: boolean
  running: boolean
  lastScan: AutoEngineRunDto | null
  error: string | null
  onScan: (config: AutoEngineScanRequest) => void
}

export function AutoEngineScanPanel({ enabled, writeEnabled, backendConfigured, running, lastScan, error, onScan }: Props) {
  const [limit, setLimit] = useState(20)
  const [persist, setPersist] = useState(false)

  const canScan = backendConfigured && enabled && !running

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-5 space-y-4">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Scan manual</h3>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Limite de jogos</span>
          <input
            type="number" min={1} max={60} value={limit}
            onChange={e => setLimit(Math.min(60, Math.max(1, Number(e.target.value) || 1)))}
            disabled={!canScan}
            className="w-28 h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white/90 outline-none focus:border-[#2DD4BF]/40 disabled:opacity-40"
          />
        </label>

        <label className={`flex items-center gap-2 h-10 px-3 rounded-lg border ${persist && writeEnabled ? 'bg-[#13B8A6]/8 border-[#2DD4BF]/22' : 'bg-white/[0.03] border-white/[0.08]'} ${!writeEnabled || !canScan ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
          <input type="checkbox" checked={persist && writeEnabled} disabled={!writeEnabled || !canScan} onChange={e => setPersist(e.target.checked)} className="accent-[#13B8A6]" />
          <span className="text-[12px] text-white/70">Persistir resultados</span>
        </label>

        <button
          type="button" onClick={() => onScan({ limit, persist: persist && writeEnabled, dryRun: !(persist && writeEnabled) })}
          disabled={!canScan}
          className="h-10 px-5 rounded-lg text-[13px] font-semibold inline-flex items-center gap-2 transition-colors bg-[#13B8A6] hover:bg-[#0FA594] text-white disabled:opacity-30 disabled:hover:bg-[#13B8A6]"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          {running ? 'Escaneando…' : 'Rodar scan'}
        </button>
      </div>

      {!writeEnabled && (
        <p className="text-[11px] text-amber-100/65">Scan em modo leitura: oportunidades não serão persistidas (ENABLE_AUTO_ENGINE_WRITE=false).</p>
      )}
      {!enabled && backendConfigured && (
        <p className="text-[11px] text-amber-100/65">Motor desabilitado: o scan retornará 403 até que ENABLE_AUTO_ENGINE=true.</p>
      )}
      {error && <p className="text-[11px] text-rose-300/80">{error}</p>}

      {lastScan && (
        <div className="rounded-xl border border-white/[0.06] bg-[#080d16] px-4 py-3 text-[12px] text-white/70">
          <span className="text-white/90 font-medium capitalize">{lastScan.status}</span> — {lastScan.fixturesScanned} jogos analisados, {lastScan.opportunitiesFound} oportunidades
          {' '}({lastScan.strong} fortes / {lastScan.watch} observação / {lastScan.blocked} bloqueadas).
          {lastScan.notes?.length > 0 && <span className="block text-[11px] text-white/40 mt-1">{lastScan.notes.join(' · ')}</span>}
        </div>
      )}

      <div className="flex items-start gap-2 text-[11px] text-white/40 border-t border-white/[0.06] pt-3">
        <Info size={13} className="shrink-0 mt-px text-white/30" />
        <span>O scan não cria alerta, não envia Telegram e não usa odds nesta fase. Oportunidade é análise, não recomendação de aposta.</span>
      </div>
    </div>
  )
}
