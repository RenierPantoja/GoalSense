/**
 * CausalLearningPanel (B48 / Bloco 5).
 * ─────────────────────────────────────────────────────────────────────────────
 * Operator view of post-match causal learning: run analysis, see cases (classification
 * + link strength), why it worked/failed, and conservative calibration suggestions
 * (governance/influence) with human review (review/reject/accept-for-future). Nothing
 * auto-applies; never shown as probability; no betting language. Honest empty states.
 */
import { useCallback, useEffect, useState } from 'react'
import { GraduationCap, RefreshCw, PlayCircle, CheckCircle2, XCircle, Clock3 } from 'lucide-react'
import { causalLearningApi } from '@/services/causalLearningApi'
import type {
  CausalLearningCaseDto, CausalLearningInsightDto, GovernanceCalibrationSuggestionDto, VariableInfluenceCalibrationSuggestionDto,
} from '@/features/matchIntelligence/causalLearningTypes'
import { CAUSAL_CLASSIFICATION_LABEL, LINK_STRENGTH_LABEL } from '@/features/matchIntelligence/causalLearningTypes'

function classTone(c: string): string {
  return c.includes('good') || c === 'right_to_wait' || c === 'right_to_stay_out' ? 'text-emerald-200/85 border-emerald-400/25'
    : c.includes('should_have') || c.includes('bad') || c === 'too_loose' ? 'text-rose-200/80 border-rose-400/25'
      : c === 'overconservative' || c === 'too_early' || c === 'variance_or_shock' ? 'text-amber-100/85 border-amber-400/25'
        : 'text-white/45 border-white/[0.1]'
}

export function CausalLearningPanel({ fixtureId, isAdmin }: { fixtureId: string | null; isAdmin: boolean }) {
  const [cases, setCases] = useState<CausalLearningCaseDto[]>([])
  const [insights, setInsights] = useState<CausalLearningInsightDto[]>([])
  const [govSugg, setGovSugg] = useState<GovernanceCalibrationSuggestionDto[]>([])
  const [infSugg, setInfSugg] = useState<VariableInfluenceCalibrationSuggestionDto[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [disabled, setDisabled] = useState(false)

  const load = useCallback(async (id: string) => {
    const [c, i, gs, is] = await Promise.all([
      causalLearningApi.listFixtureCausalCases(id),
      causalLearningApi.listFixtureCausalInsights(id),
      causalLearningApi.listGovernanceCalibrationSuggestions(),
      causalLearningApi.listInfluenceCalibrationSuggestions(),
    ])
    if (c.reason === 'env_gate' || c.status === 403) { setDisabled(true); return }
    if (c.ok && c.data) setCases(c.data)
    if (i.ok && i.data) setInsights(i.data)
    if (gs.ok && gs.data) setGovSugg(gs.data)
    if (is.ok && is.data) setInfSugg(is.data)
  }, [])

  useEffect(() => { setCases([]); setInsights([]); setGovSugg([]); setInfSugg([]); setMsg(null); setDisabled(false); if (fixtureId) void load(fixtureId) }, [fixtureId, load])

  if (!fixtureId) return null
  if (disabled) return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-4 text-[12px] text-white/45">
      Aprendizado causal desabilitado (ENABLE_CAUSAL_LEARNING=false).
    </div>
  )

  const run = async () => {
    const r = await causalLearningApi.runFixtureCausalLearning(fixtureId)
    if (r.ok) { setMsg(`Análise causal: ${r.data?.casesAnalyzed ?? 0} casos, ${r.data?.insightsCreated ?? 0} insights, ${r.data?.notEvaluableCount ?? 0} não avaliáveis.`); await load(fixtureId) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha.')
  }
  const review = async (id: string, kind: 'review' | 'reject' | 'accept') => {
    const fn = kind === 'review' ? causalLearningApi.reviewCalibrationSuggestion : kind === 'reject' ? causalLearningApi.rejectCalibrationSuggestion : causalLearningApi.acceptCalibrationSuggestionForFuture
    const r = await fn(id)
    if (r.ok) { setMsg(kind === 'accept' ? 'Aceito para implementação futura (não aplicado agora).' : `Sugestão ${kind}.`); await load(fixtureId) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha.')
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-3">
        <GraduationCap size={14} className="text-white/35" />
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">Aprendizado causal (B48)</h4>
        {isAdmin && <button type="button" onClick={run} className="h-7 px-2 rounded-lg border border-[#2DD4BF]/25 bg-[#13B8A6]/[0.08] hover:bg-[#13B8A6]/[0.15] text-[11px] text-[#7FE9DC] inline-flex items-center gap-1"><PlayCircle size={11} />Rodar análise</button>}
      </div>
      {msg && <p className="text-[11px] text-white/65 mb-2">{msg}</p>}

      {/* Cases */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1">Casos analisados ({cases.length})</p>
        {cases.length === 0 ? <p className="text-[11px] text-white/40">Nenhum caso. {isAdmin ? 'Rode a análise após o jogo.' : 'Aguardando análise.'}</p> : (
          <div className="space-y-1 max-h-44 overflow-y-auto sidebar-scroll">
            {cases.map(c => (
              <div key={c.id} className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${classTone(c.classification)}`}>{CAUSAL_CLASSIFICATION_LABEL[c.classification] || c.classification}</span>
                  <span className="text-[9.5px] text-white/40">link: {LINK_STRENGTH_LABEL[c.linkStrength] || c.linkStrength}</span>
                  {c.outcomeResult && <span className="text-[9.5px] text-white/45">outcome: {c.outcomeResult}</span>}
                  {!c.evaluable && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/40">não avaliável</span>}
                </div>
                {[...c.failureCategories.map(f => `− ${f}`), ...c.successCategories.map(s => `+ ${s}`)].slice(0, 4).map((t, i) => <p key={i} className="text-[10px] text-white/50 mt-0.5">{t}</p>)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1">Por que funcionou / falhou ({insights.length})</p>
          <div className="space-y-0.5 max-h-40 overflow-y-auto sidebar-scroll">
            {insights.map(i => (
              <div key={i.id} className="text-[10.5px] border-b border-white/[0.04] pb-0.5">
                <span className="text-white/75">{i.title}</span> <span className="text-white/45">— {i.explanation}</span>
                {i.suggestedRefinement && <span className="text-sky-200/65"> · sugestão: {i.suggestedRefinement}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calibration suggestions */}
      {(govSugg.length > 0 || infSugg.length > 0) && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1">Sugestões de calibração (revisão humana)</p>
          <div className="space-y-1 max-h-48 overflow-y-auto sidebar-scroll">
            {[...govSugg.map(s => ({ ...s, _kind: 'gov' as const })), ...infSugg.map(s => ({ ...s, _kind: 'inf' as const, suggestedChange: (s as any).suggestedMagnitudeChange, policyArea: (s as any).variableKey, observedIssue: (s as any).issue }))].map((s: any) => (
              <div key={s.id} className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-white/75">{s.policyArea}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/45">{s.confidenceOfSuggestion} · {s.evidenceCount} casos</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${s.reviewStatus === 'accepted_for_future' ? 'border-emerald-400/25 text-emerald-200/80' : s.reviewStatus === 'rejected' ? 'border-rose-400/20 text-rose-200/70' : 'border-white/10 text-white/45'}`}>{s.reviewStatus}</span>
                </div>
                <p className="text-[10px] text-white/55 mt-0.5">{s.observedIssue} → {s.suggestedChange}</p>
                {isAdmin && s.reviewStatus === 'pending' && (
                  <div className="flex items-center gap-2 mt-1">
                    <button type="button" onClick={() => review(s.id, 'review')} className="text-[10px] text-white/50 hover:text-white/80 inline-flex items-center gap-1"><Clock3 size={10} />revisar</button>
                    <button type="button" onClick={() => review(s.id, 'accept')} className="text-[10px] text-emerald-200/70 hover:text-emerald-200 inline-flex items-center gap-1"><CheckCircle2 size={10} />aceitar p/ futuro</button>
                    <button type="button" onClick={() => review(s.id, 'reject')} className="text-[10px] text-rose-200/70 hover:text-rose-200 inline-flex items-center gap-1"><XCircle size={10} />rejeitar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-white/30 mt-2">Aprendizado causal observacional — NÃO é probabilidade nem promessa de acerto. Erro não é acaso por padrão; variância só com evidência; vínculo fraco não vira causalidade forte. Sugestões NUNCA se aplicam sozinhas (aceitar = marcar para futuro). Não altera score/alertas/enforce.</p>
    </div>
  )
}
