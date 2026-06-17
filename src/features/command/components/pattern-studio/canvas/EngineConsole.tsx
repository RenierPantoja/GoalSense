/**
 * EngineConsole — Radar Blueprint 3.6 (calm Apple-style summary sidebar)
 * ─────────────────────────────────────────────────────────────────────────────
 * A refined, restrained "engine summary": a soft status card, settings-style
 * composition rows, requirements/warnings, data dependencies and a quiet
 * read-only diagnostic. Driven by getRadarReadiness + compileRadarContract.
 * No gauges, no neon — calm system materials.
 */
import { ShieldCheck, ShieldAlert, Activity, Check, ChevronRight, Loader2 } from 'lucide-react'
import type { RadarContract, RadarReadiness } from '../../../intelligence/radarReadiness'
import type { BackendDiagnostic } from '../dryrun/EngineDiagnosticPanel'

interface EngineConsoleProps {
  readiness: RadarReadiness
  contract: RadarContract
  canDiagnose: boolean
  diagLoading: boolean
  lastDiagnostic: BackendDiagnostic | null
  onDiagnose: () => void
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/35 mb-2">{children}</p>
}

export function EngineConsole({ readiness, contract, canDiagnose, diagLoading, lastDiagnostic, onDiagnose }: EngineConsoleProps) {
  const blocked = readiness.requirements.length > 0 || readiness.status === 'blocked'
  const ready = readiness.canSavePaused && readiness.requirements.length === 0
  const state: 'blocked' | 'ready' | 'progress' = blocked ? 'blocked' : ready ? 'ready' : 'progress'

  const core = {
    blocked: { tint: '#FF453A', icon: <ShieldAlert size={20} />, label: 'Bloqueado' },
    progress: { tint: '#FF9F0A', icon: <Activity size={20} />, label: 'Em configuração' },
    ready: { tint: '#30D158', icon: <ShieldCheck size={20} />, label: readiness.status === 'ready_to_activate' ? 'Pronto para ativar' : 'Pronto para revisão' },
  }[state]

  const message = readiness.status === 'ready_to_activate' ? 'Contrato confirmado. Pode ativar.'
    : ready ? 'Regra executável. Revise para ativar.'
    : readiness.primaryMessage

  return (
    <div className="h-full flex flex-col bg-black/15 border-l border-white/[0.07]">
      <div className="shrink-0 px-6 pt-6 pb-4">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white/85">Resumo do motor</h3>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll px-6 pb-5 space-y-6">
        {/* Status card */}
        <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.04] p-4 flex items-start gap-3.5">
          <span className="h-10 w-10 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: `${core.tint}1f`, color: core.tint }}>{core.icon}</span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-white/90 leading-tight">{core.label}</p>
            <p className="text-[12px] text-white/50 mt-1 leading-snug">{message}</p>
          </div>
        </div>

        {/* Composition rows */}
        <div>
          <GroupLabel>Composição</GroupLabel>
          <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.04] overflow-hidden divide-y divide-white/[0.06]">
            <div className="flex items-center px-4 h-11"><span className="text-[14px] text-white/80">Filtros</span><span className="ml-auto text-[14px] tabular-nums text-white/45">{contract.eligibilityConditions.length}</span></div>
            <div className="flex items-center px-4 h-11"><span className="text-[14px] text-white/80">Sinais reais</span><span className={`ml-auto text-[14px] font-semibold tabular-nums ${contract.signalConditions.length > 0 ? 'text-[#30D158]' : 'text-[#FF9F0A]'}`}>{contract.signalConditions.length}</span></div>
          </div>
        </div>

        {/* Requirements OR engine-will */}
        {readiness.requirements.length > 0 ? (
          <div>
            <GroupLabel>Falta para ativar</GroupLabel>
            <ul className="space-y-2">
              {readiness.requirements.map((r, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[12.5px] text-white/65 leading-snug">
                  <span className="mt-[1px] h-4 w-4 rounded-full grid place-items-center shrink-0 text-[9px] font-semibold" style={{ backgroundColor: '#FF453A22', color: '#FF8A80' }}>{i + 1}</span>{r}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div>
            <GroupLabel>O motor vai</GroupLabel>
            <ul className="space-y-2">
              {[`avaliar quando ${contract.eligibilityConditions.length || 1} filtro(s) baterem`, `exigir ${contract.signalConditions.length} sinal(is) real(is)`, contract.resolutionMode === 'tracked' ? 'registrar alerta e acompanhar resolução' : 'sinalizar sem registrar alerta'].map((t, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[12.5px] text-white/70 leading-snug"><Check size={13} className="mt-0.5 text-[#30D158] shrink-0" />{t}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {readiness.warnings.length > 0 && (
          <div>
            <GroupLabel>Avisos</GroupLabel>
            <ul className="space-y-2">
              {readiness.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[12px] text-white/45 leading-snug"><span className="mt-[6px] h-1 w-1 rounded-full bg-[#FF9F0A]/70 shrink-0" />{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Dependencies */}
        {readiness.dataDependencies.length > 0 && (
          <div>
            <GroupLabel>Dependências de dados</GroupLabel>
            <div className="flex flex-wrap gap-1.5">
              {readiness.dataDependencies.map(d => (
                <span key={d} className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-white/60">{d}</span>
              ))}
            </div>
          </div>
        )}

        {/* Compatibility */}
        <div className="flex items-center gap-2 text-[12.5px]">
          {contract.backendCompatibility.compatible
            ? <><ShieldCheck size={14} className="text-[#30D158]" /><span className="text-white/60">Condições suportadas pelo motor</span></>
            : <><ShieldAlert size={14} className="text-[#FF453A]" /><span className="text-[#FF8A80]">Condição não suportada pelo motor</span></>}
        </div>
      </div>

      {/* Diagnostic */}
      <div className="shrink-0 px-6 py-4 border-t border-white/[0.07]">
        <button onClick={onDiagnose} disabled={!canDiagnose || diagLoading} type="button" className="w-full h-9 rounded-[10px] flex items-center justify-center gap-2 text-[13px] font-medium text-[#0A84FF] hover:bg-[#0A84FF]/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          {diagLoading ? <><Loader2 size={14} className="animate-spin" />Verificando…</> : <>Verificar com partidas atuais<ChevronRight size={14} className="opacity-60" /></>}
        </button>
        {lastDiagnostic && (
          <p className="text-[11px] text-white/40 mt-2 text-center">{lastDiagnostic.evaluatedFixtures} avaliadas · <span className={lastDiagnostic.wouldTrigger > 0 ? 'text-[#30D158]' : ''}>{lastDiagnostic.wouldTrigger} disparos</span></p>
        )}
        {!canDiagnose && <p className="text-[10.5px] text-white/25 mt-1.5 text-center">Complete a regra para diagnosticar</p>}
      </div>
    </div>
  )
}
