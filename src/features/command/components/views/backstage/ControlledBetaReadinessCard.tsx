/**
 * ControlledBetaReadinessCard (B50).
 * ─────────────────────────────────────────────────────────────────────────────
 * Honest, conservative readiness toward a controlled beta. Technical, NOT a sales
 * guarantee. Without provider/Firebase/real validation it cannot be possible.
 */
import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { localValidationApi } from '@/services/localValidationApi'
import type { ControlledBetaReadinessReportDto } from '@/features/matchIntelligence/controlledBetaReadinessTypes'
import { CONTROLLED_BETA_LABEL } from '@/features/matchIntelligence/controlledBetaReadinessTypes'

function tone(s: string): string {
  return s === 'controlled_beta_possible' ? 'text-emerald-200/85 border-emerald-400/25'
    : s === 'blocked' ? 'text-rose-200/80 border-rose-400/25'
      : s === 'internal_alpha' ? 'text-amber-100/85 border-amber-400/25'
        : 'text-white/50 border-white/[0.1]'
}

export function ControlledBetaReadinessCard() {
  const [report, setReport] = useState<ControlledBetaReadinessReportDto | null>(null)
  const [disabled, setDisabled] = useState(false)

  useEffect(() => {
    let alive = true
    void localValidationApi.getControlledBetaReadiness().then(r => {
      if (!alive) return
      if (r.reason === 'env_gate' || r.status === 403) { setDisabled(true); return }
      if (r.ok && r.data) setReport(r.data)
    })
    return () => { alive = false }
  }, [])

  if (disabled || !report) return null

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert size={14} className="text-white/35" />
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">Prontidão p/ beta controlado (B50)</h4>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${tone(report.status)}`}>{CONTROLLED_BETA_LABEL[report.status] || report.status}</span>
      </div>
      {report.hardBlockers.map((b, i) => <p key={`h${i}`} className="text-[10.5px] text-rose-100/75">⛔ {b}</p>)}
      {report.softBlockers.map((b, i) => <p key={`s${i}`} className="text-[10.5px] text-amber-100/70">⚠ {b}</p>)}
      {[...report.providerRequirements, ...report.validationRequirements].slice(0, 4).map((r, i) => <p key={`r${i}`} className="text-[10px] text-white/50">· {r}</p>)}
      {report.nextActions.slice(0, 2).map((a, i) => <p key={`a${i}`} className="text-[10px] text-sky-200/60">→ {a}</p>)}
      <p className="text-[10px] text-white/30 mt-2">Readiness técnico — não é garantia comercial. controlled_beta_possible exige provider real + Firebase + validação acumulada.</p>
    </div>
  )
}
