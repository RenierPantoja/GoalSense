/**
 * LiveContractPreview — Radar Blueprint 3.6 right-zone live contract
 * ─────────────────────────────────────────────────────────────────────────────
 * Fills the right side of the wide modal with a living, plain-language preview
 * of the rule the engine will execute — readiness on top, the contract in the
 * middle and a secondary read-only diagnostic at the bottom. Updates as the user
 * composes on the left. Driven by getRadarReadiness + compileRadarContract.
 */
import { Timer, Crosshair, BellRing, Gauge, ShieldCheck, ShieldAlert, ChevronRight, Loader2 } from 'lucide-react'
import type { PatternCondition } from '../../../types/commandTypes'
import { formatConditionHuman } from '../../../utils/commandFormatters'
import type { RadarContract, RadarReadiness } from '../../../intelligence/radarReadiness'
import type { BackendDiagnostic } from '../dryrun/EngineDiagnosticPanel'

interface LiveContractPreviewProps {
  name: string
  contract: RadarContract
  readiness: RadarReadiness
  actionLabel: string
  reviewed: boolean
  canDiagnose: boolean
  diagLoading: boolean
  lastDiagnostic: BackendDiagnostic | null
  onDiagnose: () => void
}

function Clause({ icon, kicker, children, accent }: { icon: React.ReactNode; kicker: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 h-7 w-7 rounded-[9px] grid place-items-center shrink-0 text-white/55 bg-white/[0.05] border border-white/[0.07]" style={accent ? { color: accent } : undefined}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/35 mb-1">{kicker}</p>
        <div className="text-[13px] text-white/85 leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

function condList(items: PatternCondition[], empty: string) {
  if (items.length === 0) return <span className="text-white/40">{empty}</span>
  return (
    <ul className="space-y-1">
      {items.map((c, i) => <li key={i} className="flex items-start gap-2"><span className="mt-[7px] h-1 w-1 rounded-full bg-white/30 shrink-0" />{formatConditionHuman(c)}</li>)}
    </ul>
  )
}

export function LiveContractPreview({ name, contract, readiness, actionLabel, reviewed, canDiagnose, diagLoading, lastDiagnostic, onDiagnose }: LiveContractPreviewProps) {
  const blocked = readiness.requirements.length > 0 || readiness.status === 'blocked'
  const ready = readiness.canSavePaused && readiness.requirements.length === 0
  const dot = blocked ? 'bg-[#FF5A52]' : ready ? 'bg-[#34D399]' : 'bg-[#FFB02E]'
  const headline = reviewed && readiness.canActivate ? 'Contrato confirmado · pronto para ativar'
    : ready ? 'Regra executável · revise para ativar'
    : readiness.primaryMessage

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/40">Contrato do radar</h3>
      </div>
      <p className="text-[11.5px] text-white/35 mb-4">Pré-visualização do que o motor vai executar.</p>

      {/* Readiness banner */}
      <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.03] px-4 py-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
          <p className="text-[13px] font-medium text-white/88 leading-snug">{headline}</p>
        </div>
        {readiness.requirements.length > 0 && (
          <ul className="mt-2 space-y-1 pl-[18px]">
            {readiness.requirements.map((r, i) => <li key={i} className="flex items-start gap-2 text-[11.5px] text-white/55 leading-snug"><span className="mt-[6px] h-1 w-1 rounded-full bg-[#FF5A52]/70 shrink-0" />{r}</li>)}
          </ul>
        )}
        {readiness.warnings.length > 0 && readiness.requirements.length === 0 && (
          <p className="mt-2 pl-[18px] text-[11px] text-white/40 leading-snug">{readiness.warnings.join(' · ')}</p>
        )}
      </div>

      {/* Contract document */}
      <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.02] px-5 py-5 space-y-4">
        <div>
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-white/92 leading-tight">{name.trim() || 'Radar sem nome'}</p>
          <p className="text-[12px] text-white/45 mt-0.5">Monitora <span className="text-white/70">{contract.scopeLabel}</span>.</p>
        </div>
        <div className="h-px bg-white/[0.06]" />
        <Clause icon={<Timer size={15} />} kicker="Avaliar quando">{condList(contract.eligibilityConditions, 'estiver ao vivo (sem filtro de tempo)')}</Clause>
        <Clause icon={<Crosshair size={15} />} kicker="Disparar se" accent="#34D399">{condList(contract.signalConditions, 'defina ao menos 1 sinal real')}</Clause>
        <Clause icon={<BellRing size={15} />} kicker="Ao disparar">
          {actionLabel}{contract.resolutionMode === 'tracked' ? ' em /app/alerts' : ''}
          {contract.resolutionMode === 'tracked' && <div className="text-white/55 text-[12px] mt-0.5">acompanha a resolução automaticamente</div>}
        </Clause>
        <Clause icon={<Gauge size={15} />} kicker="Rigor">confiança mínima ≥ {contract.confidence}%</Clause>
      </div>

      {/* Footer of preview: dependencies + compatibility */}
      <div className="mt-4 space-y-3">
        {readiness.dataDependencies.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] text-white/30">Depende de</span>
            {readiness.dataDependencies.map(d => <span key={d} className="text-[10.5px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-white/55">{d}</span>)}
          </div>
        )}
        <div className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium border ${contract.backendCompatibility.compatible ? 'border-[#34D399]/25 bg-[#34D399]/10 text-[#7FE7B5]' : 'border-[#FF5A52]/25 bg-[#FF5A52]/10 text-[#FF9D96]'}`}>
          {contract.backendCompatibility.compatible ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
          {contract.backendCompatibility.compatible ? 'Condições suportadas pelo motor' : 'Condição não suportada pelo motor'}
        </div>
      </div>

      {/* Secondary diagnostic */}
      <div className="mt-auto pt-4">
        <button onClick={onDiagnose} disabled={!canDiagnose || diagLoading} type="button" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#2DD4BF] hover:text-[#5CE6D4] disabled:opacity-35 disabled:cursor-not-allowed transition-colors">
          {diagLoading ? <><Loader2 size={13} className="animate-spin" />Verificando…</> : <>Verificar com partidas atuais<ChevronRight size={13} className="opacity-60" /></>}
        </button>
        {lastDiagnostic && <p className="text-[11px] text-white/40 mt-1.5">{lastDiagnostic.evaluatedFixtures} avaliadas · <span className={lastDiagnostic.wouldTrigger > 0 ? 'text-[#34D399]' : ''}>{lastDiagnostic.wouldTrigger} disparos potenciais</span></p>}
      </div>
    </div>
  )
}
