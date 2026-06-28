/**
 * DailyValidationReportPanel (B50).
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows / generates the consolidated daily validation report. Separates provider
 * limitation and not_evaluable from failure; never shows a metric as a probability.
 */
import { useCallback, useEffect, useState } from 'react'
import { CalendarCheck, PlayCircle } from 'lucide-react'
import { localValidationApi } from '@/services/localValidationApi'
import type { DailyValidationReportDto } from '@/features/matchIntelligence/dailyValidationReportTypes'

export function DailyValidationReportPanel({ isAdmin }: { isAdmin: boolean }) {
  const [report, setReport] = useState<DailyValidationReportDto | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await localValidationApi.getDailyValidationReport()
    if (r.reason === 'env_gate' || r.status === 403) { setDisabled(true); return }
    if (r.ok && r.data) setReport(r.data)
  }, [])
  useEffect(() => { void load() }, [load])

  if (disabled) return null

  const generate = async () => {
    setBusy(true); const r = await localValidationApi.generateDailyValidationReport(); setBusy(false)
    if (r.ok && r.data) { setReport(r.data); setMsg(`Relatório do dia gerado: ${r.data.fixturesAnalyzed} fixtures analisadas.`) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha.')
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarCheck size={14} className="text-white/35" />
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">Relatório diário de validação (B50)</h4>
        {isAdmin && <button type="button" onClick={generate} disabled={busy} className="h-7 px-2 rounded-lg border border-[#2DD4BF]/25 bg-[#13B8A6]/[0.08] hover:bg-[#13B8A6]/[0.15] text-[11px] text-[#7FE9DC] inline-flex items-center gap-1 disabled:opacity-50"><PlayCircle size={11} />{busy ? 'Gerando…' : 'Gerar hoje'}</button>}
      </div>
      {msg && <p className="text-[11px] text-white/65 mb-2">{msg}</p>}
      {!report ? <p className="text-[11px] text-white/40">Sem relatório do dia. {isAdmin ? 'Gere após rodar a validação.' : 'Aguardando geração.'}</p> : (
        <div className="space-y-1 text-[10.5px] text-white/60">
          <p className="text-[11px] text-white/80 font-medium">{report.date} · saúde {report.backendHealth} · go/no-go {report.goNoGo}</p>
          {(report.controlPlaneEnvironment || report.workerRuntimeEnvironment) && (
            <p className="text-[10.5px] text-cyan-100/65">
              control plane: {report.controlPlaneEnvironment || 'unknown'} · worker runtime: {report.workerRuntimeEnvironment || 'unknown'} · read-only: {report.readOnlyControlPlane ? 'sim' : 'não'}
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            <span>planejadas: {report.fixturesPlanned}</span>
            <span>analisadas: {report.fixturesAnalyzed}</span>
            <span>puladas: {report.fixturesSkipped}</span>
            <span>governança: {report.governanceSummary.evaluations}</span>
            <span>would_wait: {report.governanceSummary.wouldWait}</span>
            <span>would_block: {report.governanceSummary.wouldBlock}</span>
            <span>causal aval.: {report.causalSummary.evaluable}</span>
            <span>não avaliável: {report.causalSummary.notEvaluable}</span>
            <span>manual intake: {report.manualIntakeUsed}</span>
            <span>worker runs: {report.workerRuns}</span>
            <span>sessões longas: {report.workerSessionsCompleted}</span>
            <span>FT live-first: {report.liveFirstCompletedFixtures}</span>
            <span>post-match pend.: {report.liveFirstPendingPostMatch}</span>
            <span>órfãs recup.: {report.orphanSessionsRecovered}</span>
            <span>snap/FT: {report.averageSnapshotsPerCompletedFixture}</span>
            <span>worker visível: {report.latestWorkerRunVisibleFromControlPlane ? 'sim' : 'não'}</span>
            <span>cases visíveis: {report.latestCausalCasesVisibleFromControlPlane ? 'sim' : 'não'}</span>
          </div>
          {report.providerLimitations.length > 0 && <p className="text-amber-100/70">limitação provider (≠ falha): {report.providerLimitations.join(', ')}</p>}
          {report.recommendedActions.slice(0, 3).map((a, i) => <p key={i} className="text-sky-200/60">→ {a}</p>)}
        </div>
      )}
      <p className="text-[10px] text-white/30 mt-2">Relatório observacional — métrica não é promessa de acerto; limitação de provider e not_evaluable são separados de falha real.</p>
    </div>
  )
}
