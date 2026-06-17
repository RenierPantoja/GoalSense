/**
 * EngineDiagnosticPanel — Radar Blueprint 3.1 real backend diagnostic result
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the result of POST /api/patterns/diagnose (read-only). Never created
 * an alert, never saved, never sent Telegram — it only reports what the engine
 * would do against the current real live snapshots.
 */
import { X } from 'lucide-react'

export interface BackendDiagnostic {
  ok: boolean
  code: 'OK' | 'NO_LIVE_FIXTURES' | 'DATA_INSUFFICIENT' | 'UNSUPPORTED_CONDITION'
  evaluatedFixtures: number
  eligibleFixtures: number
  sufficientDataFixtures: number
  wouldTrigger: number
  blockedReasons: Record<string, number>
  unsupportedConditions: string[]
  dataDependencies: string[]
  sampleFixtures: { matchLabel: string; competition: string; minute: number | null; score: { home: number; away: number }; signalState: string; confidence: number; matched: number; total: number; dataQuality: string }[]
  warnings: string[]
}

const CODE_MESSAGE: Record<BackendDiagnostic['code'], string> = {
  OK: 'Diagnóstico concluído',
  NO_LIVE_FIXTURES: 'Nenhuma partida ao vivo agora',
  DATA_INSUFFICIENT: 'O motor não recebeu dados suficientes',
  UNSUPPORTED_CONDITION: 'Há condição não suportada pelo motor',
}

export function EngineDiagnosticPanel({ result, onClose, source, scopeNote }: { result: BackendDiagnostic; onClose: () => void; source: 'backend' | 'local'; scopeNote?: string }) {
  const blocked = Object.entries(result.blockedReasons).sort((a, b) => b[1] - a[1])
  return (
    <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.012] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center gap-2">
        <span className="text-[12px] font-semibold text-white/90">Diagnóstico do motor</span>
        <span className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${source === 'backend' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/15' : 'bg-white/[0.05] text-white/55 border-white/[0.08]'}`}>{source === 'backend' ? 'backend real' : 'local'}</span>
        <span className="text-[11px] text-white/50">· {CODE_MESSAGE[result.code]}</span>
        <button onClick={onClose} type="button" aria-label="Fechar" className="ml-auto h-7 w-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/90 hover:bg-white/[0.05] transition-colors"><X size={14} /></button>
      </div>

      <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-white/[0.05]">
        {[
          { label: 'Avaliadas', value: result.evaluatedFixtures },
          { label: 'No escopo', value: result.eligibleFixtures },
          { label: 'Dados suficientes', value: result.sufficientDataFixtures },
          { label: 'Possíveis disparos', value: result.wouldTrigger, accent: result.wouldTrigger > 0 },
        ].map(s => (
          <div key={s.label} className={`rounded-lg border px-3 py-2 ${s.accent ? 'border-emerald-400/20 bg-emerald-500/[0.05]' : 'border-white/[0.06] bg-white/[0.01]'}`}>
            <span className={`text-[18px] font-bold tabular-nums leading-none ${s.accent ? 'text-emerald-200' : 'text-white/90'}`}>{s.value}</span>
            <span className="block text-[10px] text-white/45 mt-1">{s.label}</span>
          </div>
        ))}
      </div>

      {blocked.length > 0 && (
        <div className="px-5 py-3 border-b border-white/[0.05]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 block mb-2">Bloqueios</span>
          <ul className="space-y-1">
            {blocked.slice(0, 8).map(([reason, count]) => (
              <li key={reason} className="flex items-center justify-between text-[11.5px] text-white/70"><span>{reason}</span><span className="tabular-nums text-white/45">{count}</span></li>
            ))}
          </ul>
        </div>
      )}

      {result.unsupportedConditions.length > 0 && (
        <div className="px-5 py-3 border-b border-white/[0.05]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-300/75 block mb-1.5">Não suportadas pelo motor</span>
          <div className="flex flex-wrap gap-1.5">{result.unsupportedConditions.map(c => <span key={c} className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-400/20 text-rose-200">{c}</span>)}</div>
        </div>
      )}

      {result.sampleFixtures.length > 0 && (
        <div className="px-5 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 block mb-2">Amostra de partidas</span>
          <ul className="space-y-1.5">
            {result.sampleFixtures.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-[11.5px]">
                <span className="text-white/85 font-medium truncate flex-1">{f.matchLabel}</span>
                <span className="text-white/45 tabular-nums">{f.score.home}-{f.score.away}{f.minute != null ? ` · ${f.minute}'` : ''}</span>
                <span className={`text-[9.5px] font-medium px-1.5 py-0.5 rounded border ${f.signalState === 'ready_to_alert' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/15' : 'bg-white/[0.05] text-white/55 border-white/[0.08]'}`}>{f.matched}/{f.total}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-5 py-2.5 border-t border-white/[0.05]">
        <span className="text-[10px] text-white/35">Read-only · não cria alerta · não salva · não envia Telegram</span>
        {scopeNote && <p className="text-[10px] text-amber-200/70 mt-1">{scopeNote}</p>}
      </div>
    </div>
  )
}
