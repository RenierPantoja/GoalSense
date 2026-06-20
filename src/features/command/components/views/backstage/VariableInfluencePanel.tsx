/**
 * VariableInfluencePanel (B46 / Bloco 3).
 * ─────────────────────────────────────────────────────────────────────────────
 * Operator view of WHY the system supports, contradicts or waits: net influence band,
 * internal influence score, assessment confidence, positive/negative factors,
 * blockers, wait reasons (lineup/domain/live/manual review) and conflicts. Influence
 * is never shown as a probability and never as betting language. Honest empty states.
 */
import { useCallback, useEffect, useState } from 'react'
import { Scale, RefreshCw, ArrowUpCircle, ArrowDownCircle, Ban, Clock, GitMerge, HelpCircle } from 'lucide-react'
import { variableInfluenceApi } from '@/services/variableInfluenceApi'
import type { ComposedInfluenceDto, VariableInfluenceAssessmentDto } from '@/features/matchIntelligence/variableInfluenceTypes'
import { NET_BAND_LABEL } from '@/features/matchIntelligence/variableInfluenceTypes'

function bandTone(b: string): string {
  return b === 'strongly_supportive' || b === 'supportive' ? 'text-emerald-200/85 border-emerald-400/25'
    : b === 'blocked' || b === 'contradictory' ? 'text-rose-200/80 border-rose-400/25'
      : b === 'mixed' || b === 'weak' ? 'text-amber-100/80 border-amber-400/20'
        : 'text-white/45 border-white/[0.1]'
}

function magTone(m: string): string {
  return m === 'critical' ? 'text-rose-200/85' : m === 'high' ? 'text-amber-100/85' : m === 'medium' ? 'text-white/70' : 'text-white/45'
}

function AssessmentRow({ a }: { a: VariableInfluenceAssessmentDto }) {
  return (
    <div className="flex items-start gap-2 text-[10.5px] border-b border-white/[0.04] pb-0.5">
      <span className="text-white/70 flex-1 truncate" title={a.reason}>{a.label}</span>
      <span className={`${magTone(a.magnitude)} shrink-0`}>{a.magnitude}</span>
      <span className="text-white/35 shrink-0">{a.reliability}</span>
      <span className="text-white/30 shrink-0 text-[9px]">{a.source}</span>
    </div>
  )
}

export function VariableInfluencePanel({ fixtureId, isAdmin }: { fixtureId: string | null; isAdmin: boolean }) {
  const [data, setData] = useState<ComposedInfluenceDto | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    const r = await variableInfluenceApi.getFixtureInfluence(id)
    if (r.reason === 'env_gate' || r.status === 403) { setDisabled(true); setLoading(false); return }
    if (r.ok && r.data) setData(r.data)
    setLoading(false)
  }, [])

  useEffect(() => { setData(null); setMsg(null); setDisabled(false); if (fixtureId) void load(fixtureId) }, [fixtureId, load])

  if (!fixtureId) return null
  if (disabled) return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-4 text-[12px] text-white/45">
      Motor de influência desabilitado (ENABLE_VARIABLE_INFLUENCE_ENGINE=false).
    </div>
  )

  const build = async () => {
    const r = await variableInfluenceApi.buildFixtureInfluence(fixtureId)
    if (r.ok) { setMsg(`Influência reconstruída (${r.data?.run?.status ?? 'ok'}).`); await load(fixtureId) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão para reconstruir.' : r.error || 'Falha.')
  }

  const agg = data?.aggregate

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Scale size={14} className="text-white/35" />
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">Pesos & influência (B46)</h4>
        {isAdmin && <button type="button" onClick={build} className="h-7 px-2 rounded-lg border border-[#2DD4BF]/25 bg-[#13B8A6]/[0.08] hover:bg-[#13B8A6]/[0.15] text-[11px] text-[#7FE9DC] inline-flex items-center gap-1"><RefreshCw size={11} />Reconstruir</button>}
      </div>
      {msg && <p className="text-[11px] text-white/65 mb-2">{msg}</p>}
      {loading && <p className="text-[11px] text-white/40 mb-2">Calculando influência…</p>}

      {agg && (
        <>
          {/* Summary */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${bandTone(agg.netInfluenceBand)}`}>{NET_BAND_LABEL[agg.netInfluenceBand] || agg.netInfluenceBand}</span>
            <span className="text-[11px] text-white/55">score interno {agg.influenceScore}</span>
            <span className="text-[11px] text-white/45">· confiança da avaliação {agg.confidenceOfAssessment}</span>
            <span className="text-[10px] text-white/35">· completude {agg.dataCompleteness}%</span>
          </div>
          {data?.sensitivity && <p className="text-[10px] text-white/35 mb-2">Padrão (família {data.sensitivity.patternFamily}): {data.sensitivity.notes[0] ?? 'perfil conservador'}</p>}

          {/* Positive */}
          {agg.positiveInfluences.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wide text-emerald-200/60 mb-1 inline-flex items-center gap-1"><ArrowUpCircle size={11} />Fatores positivos ({agg.positiveInfluences.length})</p>
              <div className="space-y-0.5">{agg.positiveInfluences.map(a => <AssessmentRow key={a.id} a={a} />)}</div>
            </div>
          )}
          {/* Negative */}
          {agg.negativeInfluences.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wide text-rose-200/60 mb-1 inline-flex items-center gap-1"><ArrowDownCircle size={11} />Fatores negativos ({agg.negativeInfluences.length})</p>
              <div className="space-y-0.5">{agg.negativeInfluences.map(a => <AssessmentRow key={a.id} a={a} />)}</div>
            </div>
          )}
          {/* Blockers */}
          {agg.blockingInfluences.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wide text-rose-200/70 mb-1 inline-flex items-center gap-1"><Ban size={11} />Bloqueadores ({agg.blockingInfluences.length})</p>
              {agg.blockingInfluences.map(a => <p key={a.id} className="text-[10.5px] text-rose-100/70">· {a.label}: {a.reason}</p>)}
            </div>
          )}
          {/* Wait + live confirmation */}
          {(agg.waitInfluences.length > 0 || agg.liveConfirmationInfluences.length > 0) && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wide text-amber-100/70 mb-1 inline-flex items-center gap-1"><Clock size={11} />Esperar ({agg.waitInfluences.length + agg.liveConfirmationInfluences.length})</p>
              {[...agg.waitInfluences, ...agg.liveConfirmationInfluences].map(a => <p key={a.id} className="text-[10.5px] text-amber-100/70">· {a.label}: {a.waitReason || a.liveConfirmationReason || a.reason}</p>)}
            </div>
          )}
          {/* Conflicts */}
          {(data?.conflicts.length ?? 0) > 0 && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wide text-amber-200/70 mb-1 inline-flex items-center gap-1"><GitMerge size={11} />Conflitos ({data!.conflicts.length})</p>
              {data!.conflicts.map(c => <p key={c.id} className="text-[10.5px] text-amber-100/75">· {c.conflictType} → {c.recommendedAction}: {c.reason}</p>)}
            </div>
          )}
          {/* Uncertainty */}
          {agg.uncertaintyInfluences.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1 inline-flex items-center gap-1"><HelpCircle size={11} />Incertezas ({agg.uncertaintyInfluences.length})</p>
              <div className="space-y-0.5">{agg.uncertaintyInfluences.slice(0, 6).map(a => <AssessmentRow key={a.id} a={a} />)}</div>
            </div>
          )}

          {agg.netInfluenceBand === 'insufficient_data' && <p className="text-[11px] text-white/40">Dados insuficientes para pesar variáveis (não é negativo).</p>}
        </>
      )}
      {!agg && !loading && <p className="text-[11px] text-white/40">Sem influência calculada.</p>}

      <p className="text-[10px] text-white/30 mt-2">Influência é peso operacional + confiança da avaliação — NÃO é probabilidade de acerto. Variável ausente não vira negativa; amostra fraca não vira forte; manual nunca finge provider; conflito é sempre explícito. Não altera score/alertas.</p>
    </div>
  )
}
