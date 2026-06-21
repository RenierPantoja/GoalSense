/**
 * LocalValidationPanel (B49 / Bloco 6).
 * ─────────────────────────────────────────────────────────────────────────────
 * The final operational console: today's validation plan (selected/skipped + cost +
 * risks), run controls, reliability/coverage/cost metrics, provider coverage, and the
 * go/no-go + backend health verdict. Never shows "guaranteed accuracy"; no betting
 * language; not_evaluable and provider-limitation are shown separately from failure.
 */
import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, PlayCircle, RefreshCw, Activity, ShieldCheck, Wrench } from 'lucide-react'
import { localValidationApi } from '@/services/localValidationApi'
import type {
  LocalValidationPlanDto, LocalValidationRunDto, LocalValidationReliabilityMetricsDto,
  LocalValidationGoNoGoReportDto, BackendHealthReportDto, ProviderCoverageReportDto,
} from '@/features/matchIntelligence/localValidationTypes'
import { BACKEND_STATUS_LABEL, COMMERCIAL_READINESS_LABEL, BACKEND_HEALTH_LABEL } from '@/features/matchIntelligence/localValidationTypes'

function statusTone(s: string): string {
  return s === 'go' || s === 'excellent' || s === 'good' ? 'text-emerald-200/85 border-emerald-400/25'
    : s === 'no_go' || s === 'blocked' ? 'text-rose-200/80 border-rose-400/25'
      : s === 'go_with_warnings' || s === 'warning' ? 'text-amber-100/85 border-amber-400/25'
        : 'text-white/50 border-white/[0.1]'
}

export function LocalValidationPanel({ isAdmin }: { isAdmin: boolean }) {
  const [plan, setPlan] = useState<LocalValidationPlanDto | null>(null)
  const [runs, setRuns] = useState<LocalValidationRunDto[]>([])
  const [latestRun, setLatestRun] = useState<LocalValidationRunDto | null>(null)
  const [reliability, setReliability] = useState<LocalValidationReliabilityMetricsDto | null>(null)
  const [goNoGo, setGoNoGo] = useState<LocalValidationGoNoGoReportDto | null>(null)
  const [health, setHealth] = useState<BackendHealthReportDto | null>(null)
  const [coverage, setCoverage] = useState<ProviderCoverageReportDto | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadVerdict = useCallback(async () => {
    const [h, c, rs] = await Promise.all([localValidationApi.getBackendHealth(), localValidationApi.getProviderCoverage(), localValidationApi.listValidationRuns()])
    if (h.reason === 'env_gate' || h.status === 403) { setDisabled(true); return }
    if (h.ok && h.data) setHealth(h.data)
    if (c.ok && c.data) setCoverage(c.data)
    if (rs.ok && rs.data) { setRuns(rs.data); if (rs.data[0]) await loadRun(rs.data[0].id) }
  }, [])

  const loadRun = async (runId: string) => {
    const [r, rel, g] = await Promise.all([localValidationApi.getValidationRun(runId), localValidationApi.getReliabilityMetrics(runId), localValidationApi.getGoNoGoReport(runId)])
    if (r.ok) setLatestRun(r.data)
    if (rel.ok) setReliability(rel.data)
    if (g.ok) setGoNoGo(g.data)
  }

  useEffect(() => { void loadVerdict() }, [loadVerdict])

  if (disabled) return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-4 text-[12px] text-white/45">
      Validação local desabilitada (ENABLE_LOCAL_LONG_RUN_VALIDATION=false).
    </div>
  )

  const loadPlan = async () => { const r = await localValidationApi.getTodayValidationPlan(); if (r.ok && r.data) setPlan(r.data) }
  const runToday = async () => {
    setBusy(true)
    const r = await localValidationApi.runTodayValidation()
    setBusy(false)
    if (r.ok) { setMsg(`Validação rodada: ${r.data?.selectedFixtures ?? 0} fixtures (${r.data?.status}).`); await loadVerdict() }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha.')
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardCheck size={14} className="text-white/35" />
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">Validação local & saúde do backend (B49)</h4>
        {isAdmin && <button type="button" onClick={loadPlan} className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] text-white/70 inline-flex items-center gap-1"><RefreshCw size={11} />Plano</button>}
        {isAdmin && <button type="button" onClick={runToday} disabled={busy} className="h-7 px-2 rounded-lg border border-[#2DD4BF]/25 bg-[#13B8A6]/[0.08] hover:bg-[#13B8A6]/[0.15] text-[11px] text-[#7FE9DC] inline-flex items-center gap-1 disabled:opacity-50"><PlayCircle size={11} />{busy ? 'Rodando…' : 'Rodar hoje'}</button>}
      </div>
      {msg && <p className="text-[11px] text-white/65 mb-2">{msg}</p>}

      {/* Backend health + go/no-go verdict */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {health && <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${statusTone(health.backendHealth)}`}><ShieldCheck size={11} className="inline mr-1" />saúde: {BACKEND_HEALTH_LABEL[health.backendHealth] || health.backendHealth}</span>}
        {goNoGo && <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${statusTone(goNoGo.localBackendStatus)}`}>local: {BACKEND_STATUS_LABEL[goNoGo.localBackendStatus] || goNoGo.localBackendStatus}</span>}
        {health && <span className="text-[11px] text-white/55">comercial: {COMMERCIAL_READINESS_LABEL[health.commercialReadiness] || health.commercialReadiness}</span>}
        {health && !health.firebaseConfigured && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-400/20 text-amber-100/75">Firebase off</span>}
        {health && !health.providerConfigured && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-400/20 text-amber-100/75">provider off</span>}
      </div>

      {/* Plan */}
      {plan && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-2 mb-3">
          <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1">Plano de hoje</p>
          <p className="text-[11px] text-white/65">{plan.selectedCount} selecionadas / {plan.skippedCount} puladas · custo estimado: {plan.estimatedFirebaseReads} reads, {plan.estimatedFirebaseWrites} writes, {plan.estimatedProviderCalls} chamadas provider</p>
          {plan.risks.map((r, i) => <p key={i} className="text-[10px] text-amber-100/70 mt-0.5">⚠ {r}</p>)}
        </div>
      )}

      {/* Reliability */}
      {reliability && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1 inline-flex items-center gap-1"><Activity size={11} />Confiabilidade (run mais recente)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10.5px] text-white/60">
            <span>fixtures: {reliability.fixturesAnalyzed}</span>
            <span>c/ dados: {reliability.fixturesWithSufficientData}</span>
            <span>provider-limited: {reliability.fixturesProviderLimited}</span>
            <span>governança: {reliability.governanceEvaluations}</span>
            <span>would_wait: {reliability.wouldWait}</span>
            <span>would_block: {reliability.wouldBlock}</span>
            <span>causal avaliável: {reliability.causalCasesEvaluable}</span>
            <span>não avaliável: {reliability.causalCasesNotEvaluable}</span>
            <span>holds: {reliability.holdsCreated}</span>
          </div>
        </div>
      )}

      {/* Provider coverage */}
      {coverage && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1">Cobertura de dados</p>
          <p className="text-[10.5px] text-emerald-200/70">cobertos: {coverage.domainsCovered.join(', ') || '—'}</p>
          {coverage.domainsBlockedByEnv.length > 0 && <p className="text-[10.5px] text-amber-100/70">sem provider/env: {coverage.domainsBlockedByEnv.join(', ')}</p>}
          {coverage.domainsBlockedByDocs.length > 0 && <p className="text-[10.5px] text-white/45">sem docs: {coverage.domainsBlockedByDocs.join(', ')}</p>}
        </div>
      )}

      {/* Go/No-Go fixes */}
      {goNoGo && (goNoGo.requiredFixes.length > 0 || goNoGo.warnings.length > 0) && (
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1 inline-flex items-center gap-1"><Wrench size={11} />Antes de comercializar</p>
          {goNoGo.warnings.map((w, i) => <p key={`w${i}`} className="text-[10.5px] text-amber-100/70">⚠ {w}</p>)}
          {goNoGo.requiredFixes.map((f, i) => <p key={`f${i}`} className="text-[10.5px] text-white/55">· {f}</p>)}
          {goNoGo.recommendedNextSteps.slice(0, 3).map((s, i) => <p key={`s${i}`} className="text-[10px] text-sky-200/60">→ {s}</p>)}
        </div>
      )}

      <p className="text-[10px] text-white/30 mt-2">Validação local observacional — métrica NÃO é promessa de acerto; go/no-go é técnico, não garantia comercial. unknown/not_evaluable e limitação de provider são mostrados separados de falha real. Sem enforce, sem Telegram, sem aposta.</p>
    </div>
  )
}
