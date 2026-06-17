/**
 * EngineConsole — Radar Blueprint 3.5 right-side HUD console
 * ─────────────────────────────────────────────────────────────────────────────
 * A futuristic engine-status console (not a table). Answers "can the engine run
 * this?" with a glowing status core, filter/signal gauges, requirements, data
 * dependencies, backend compatibility and a contextual read-only diagnostic.
 * Driven entirely by getRadarReadiness + compileRadarContract.
 */
import { Activity, AlertTriangle, ShieldCheck, ShieldAlert, Filter, Crosshair, Check, Database, ChevronRight, Loader2, Cpu } from 'lucide-react'
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

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      <span className="text-white/30">{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{children}</span>
    </div>
  )
}

function Gauge({ icon, label, value, max, tone }: { icon: React.ReactNode; label: string; value: number; max: number; tone: 'neutral' | 'good' | 'warn' }) {
  const pct = Math.min(100, (value / Math.max(1, max)) * 100)
  const bar = tone === 'good' ? 'bg-emerald-400/80' : tone === 'warn' ? 'bg-amber-400/80' : 'bg-cyan-400/70'
  const txt = tone === 'good' ? 'text-emerald-200' : tone === 'warn' ? 'text-amber-200' : 'text-white/85'
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-white/40">{icon}</span>
        <span className="text-[11px] text-white/55 flex-1">{label}</span>
        <span className={`text-[16px] font-bold tabular-nums leading-none ${txt}`}>{value}</span>
      </div>
      <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full ${bar} transition-all duration-500`} style={{ width: `${value === 0 ? 8 : pct}%`, opacity: value === 0 ? 0.4 : 1 }} />
      </div>
    </div>
  )
}

export function EngineConsole({ readiness, contract, canDiagnose, diagLoading, lastDiagnostic, onDiagnose }: EngineConsoleProps) {
  const blocked = readiness.requirements.length > 0 || readiness.status === 'blocked'
  const ready = readiness.canSavePaused && readiness.requirements.length === 0
  const state: 'blocked' | 'ready' | 'progress' = blocked ? 'blocked' : ready ? 'ready' : 'progress'

  const core = {
    blocked: { ring: 'border-rose-400/30 shadow-[0_0_30px_-6px_rgba(244,63,94,0.5)]', glow: 'from-rose-500/20', icon: <ShieldAlert size={26} className="text-rose-300" />, label: 'Bloqueado', text: 'text-rose-200' },
    progress: { ring: 'border-amber-400/30 shadow-[0_0_30px_-6px_rgba(251,191,36,0.45)]', glow: 'from-amber-500/15', icon: <Activity size={26} className="text-amber-300" />, label: readiness.maturityLabel, text: 'text-amber-200' },
    ready: { ring: 'border-emerald-400/30 shadow-[0_0_30px_-6px_rgba(52,211,153,0.5)]', glow: 'from-emerald-500/20', icon: <ShieldCheck size={26} className="text-emerald-300" />, label: readiness.status === 'ready_to_activate' ? 'Pronto p/ ativar' : 'Pronto p/ revisão', text: 'text-emerald-200' },
  }[state]

  const message = readiness.status === 'ready_to_activate' ? 'Contrato confirmado. Pode ativar.'
    : ready ? 'Regra executável. Revise para ativar.'
    : readiness.primaryMessage

  return (
    <div className="h-full flex flex-col bg-[#080b12]/40 border-l border-white/[0.06]">
      {/* Console header */}
      <div className="px-5 pt-5 pb-3 border-b border-white/[0.05] flex items-center gap-2">
        <Cpu size={14} className="text-cyan-300/70" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">Motor</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${state === 'ready' ? 'bg-emerald-400' : state === 'blocked' ? 'bg-rose-400' : 'bg-amber-400'} animate-pulse`} />
          <span className="text-[10px] text-white/40">live</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll px-5 py-5 space-y-5">
        {/* Status core */}
        <div className="relative rounded-2xl border border-white/[0.06] bg-white/[0.01] p-4 overflow-hidden">
          <div className={`absolute -top-10 -right-10 h-32 w-32 rounded-full bg-gradient-to-br ${core.glow} to-transparent blur-2xl`} />
          <div className="relative flex items-center gap-4">
            <div className={`relative h-16 w-16 rounded-2xl grid place-items-center border ${core.ring} bg-white/[0.02] shrink-0`}>
              {core.icon}
            </div>
            <div className="min-w-0">
              <p className={`text-[15px] font-semibold ${core.text} leading-tight`}>{core.label}</p>
              <p className="text-[11.5px] text-white/50 mt-1 leading-snug">{message}</p>
            </div>
          </div>
        </div>

        {/* Gauges */}
        <div>
          <SectionLabel icon={<Activity size={12} />}>Composição</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <Gauge icon={<Filter size={13} />} label="Filtros" value={contract.eligibilityConditions.length} max={4} tone="neutral" />
            <Gauge icon={<Crosshair size={13} />} label="Sinais reais" value={contract.signalConditions.length} max={4} tone={contract.signalConditions.length > 0 ? 'good' : 'warn'} />
          </div>
        </div>

        {/* Requirements OR engine-will */}
        {readiness.requirements.length > 0 ? (
          <div>
            <SectionLabel icon={<AlertTriangle size={12} />}>Falta para ativar</SectionLabel>
            <ul className="space-y-1.5">
              {readiness.requirements.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[11.5px] text-white/70 leading-snug">
                  <span className="mt-[3px] h-3.5 w-3.5 rounded-full grid place-items-center bg-rose-500/15 text-rose-300 shrink-0 text-[8px] font-bold">{i + 1}</span>{r}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div>
            <SectionLabel icon={<Check size={12} />}>O motor vai</SectionLabel>
            <ul className="space-y-1.5">
              {[`avaliar quando ${contract.eligibilityConditions.length || 1} filtro(s) baterem`, `exigir ${contract.signalConditions.length} sinal(is) real(is)`, contract.resolutionMode === 'tracked' ? 'registrar alerta + acompanhar resolução' : 'sinalizar sem registrar alerta'].map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-[11.5px] text-white/75 leading-snug"><Check size={12} className="mt-0.5 text-emerald-400/80 shrink-0" />{t}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {readiness.warnings.length > 0 && (
          <div>
            <SectionLabel icon={<AlertTriangle size={12} />}>Avisos</SectionLabel>
            <ul className="space-y-1.5">
              {readiness.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-white/45 leading-snug"><span className="mt-[5px] h-1 w-1 rounded-full bg-amber-400/55 shrink-0" />{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Dependencies */}
        {readiness.dataDependencies.length > 0 && (
          <div>
            <SectionLabel icon={<Database size={12} />}>Dependências de dados</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {readiness.dataDependencies.map(d => (
                <span key={d} className="text-[10px] px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.07] text-white/60">{d}</span>
              ))}
            </div>
          </div>
        )}

        {/* Compatibility */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] px-3 py-2.5 flex items-center gap-2">
          {contract.backendCompatibility.compatible
            ? <><ShieldCheck size={14} className="text-emerald-400/80" /><span className="text-[11.5px] text-white/65">Condições suportadas pelo motor</span></>
            : <><ShieldAlert size={14} className="text-rose-400/80" /><span className="text-[11.5px] text-rose-200">Condição não suportada pelo motor</span></>}
        </div>
      </div>

      {/* Diagnostic dock */}
      <div className="shrink-0 px-5 py-4 border-t border-white/[0.06]">
        <button onClick={onDiagnose} disabled={!canDiagnose || diagLoading} type="button" className="w-full h-10 rounded-xl flex items-center justify-center gap-2 text-[12px] font-semibold text-cyan-200 border border-cyan-400/20 bg-cyan-500/[0.06] hover:bg-cyan-500/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          {diagLoading ? <><Loader2 size={14} className="animate-spin" />Verificando…</> : <><Activity size={14} />Verificar com partidas atuais<ChevronRight size={14} className="opacity-60" /></>}
        </button>
        {!canDiagnose && <p className="text-[10px] text-white/30 mt-1.5 text-center">Complete a regra para diagnosticar</p>}
        {lastDiagnostic && (
          <div className="mt-2.5 text-[10.5px] text-white/45 flex items-center justify-center gap-2">
            <span>{lastDiagnostic.evaluatedFixtures} avaliadas</span><span className="text-white/20">·</span>
            <span className={lastDiagnostic.wouldTrigger > 0 ? 'text-emerald-300/80' : ''}>{lastDiagnostic.wouldTrigger} disparos</span>
          </div>
        )}
        <p className="text-[9px] text-white/25 mt-1.5 text-center">read-only · não cria alerta · não salva</p>
      </div>
    </div>
  )
}
