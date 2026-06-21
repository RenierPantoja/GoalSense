/**
 * AlertGovernancePanel (B47 / Bloco 4).
 * ─────────────────────────────────────────────────────────────────────────────
 * Operator view of the decision brain: current governance mode (observe/shadow/
 * enforce), the latest decision for the fixture (allow/monitor/wait/block/stay-out),
 * its reasons, active holds (with next re-check) and recent decisions. Observe/shadow
 * is clearly labeled "não bloqueia". No betting language, no probability.
 */
import { useCallback, useEffect, useState } from 'react'
import { Gavel, RefreshCw, Clock, Ban, ArrowUpCircle, Eye, PlayCircle } from 'lucide-react'
import { alertGovernanceApi } from '@/services/alertGovernanceApi'
import type { FixtureGovernanceDto, GovernanceModeDto, AlertDecisionGovernanceResultDto } from '@/features/matchIntelligence/alertGovernanceTypes'
import { GOV_ACTION_LABEL, GOV_MODE_LABEL } from '@/features/matchIntelligence/alertGovernanceTypes'

function actionTone(a: string): string {
  return a === 'allow_alert' ? 'text-emerald-200/85 border-emerald-400/25'
    : a === 'block_alert' || a === 'stay_out' ? 'text-rose-200/80 border-rose-400/25'
      : a.startsWith('wait_') ? 'text-amber-100/85 border-amber-400/25'
        : 'text-white/55 border-white/[0.1]'
}

function DecisionCard({ r }: { r: AlertDecisionGovernanceResultDto }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${actionTone(r.action)}`}>{GOV_ACTION_LABEL[r.action] || r.action}</span>
        <span className="text-[10px] text-white/40">{r.source}</span>
        {r.wouldHaveBlocked && !r.actuallyBlocked && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/45">would_block (não bloqueou)</span>}
        {r.influenceBand && <span className="text-[10px] text-white/45">infl: {r.influenceBand}</span>}
      </div>
      {r.blockers.map((b, i) => <p key={`b${i}`} className="text-[10.5px] text-rose-100/70">· bloqueador: {b}</p>)}
      {r.waitReasons.map((w, i) => <p key={`w${i}`} className="text-[10.5px] text-amber-100/70">· esperar: {w}</p>)}
      {r.stayOutReasons.map((s, i) => <p key={`s${i}`} className="text-[10.5px] text-rose-100/65">· ficar fora: {s}</p>)}
      {r.allowReasons.map((a, i) => <p key={`a${i}`} className="text-[10.5px] text-emerald-200/70">· permitir: {a}</p>)}
      {r.conflicts.map((c, i) => <p key={`c${i}`} className="text-[10.5px] text-amber-100/70">· conflito: {c}</p>)}
    </div>
  )
}

export function AlertGovernancePanel({ fixtureId, isAdmin }: { fixtureId: string | null; isAdmin: boolean }) {
  const [mode, setMode] = useState<GovernanceModeDto | null>(null)
  const [data, setData] = useState<FixtureGovernanceDto | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [disabled, setDisabled] = useState(false)

  const load = useCallback(async (id: string) => {
    const [m, g] = await Promise.all([alertGovernanceApi.getGovernanceMode(), alertGovernanceApi.getFixtureGovernance(id)])
    if (m.ok && m.data) setMode(m.data)
    if (g.reason === 'env_gate' || g.status === 403) { setDisabled(true); return }
    if (g.ok && g.data) setData(g.data)
  }, [])

  useEffect(() => { setData(null); setMsg(null); setDisabled(false); if (fixtureId) void load(fixtureId) }, [fixtureId, load])

  if (!fixtureId) return null
  if (disabled) return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-4 text-[12px] text-white/45">
      Governança de alertas desabilitada (ENABLE_ALERT_DECISION_GOVERNANCE=false).
    </div>
  )

  const evaluate = async () => {
    const r = await alertGovernanceApi.evaluateFixtureGovernance(fixtureId, { source: 'manual_review' })
    if (r.ok) { setMsg(`Decisão: ${GOV_ACTION_LABEL[r.data?.action ?? ''] || r.data?.action}.`); await load(fixtureId) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha.')
  }
  const liveTrigger = async (trigger: string) => {
    const r = await alertGovernanceApi.sendGovernanceLiveTrigger(fixtureId, trigger)
    if (r.ok) { setMsg(`Reavaliação (${trigger}): ${r.data?.results.length ?? 0} resultados, ${r.data?.wouldNowAlert.length ?? 0} would_now_alert.`); await load(fixtureId) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha.')
  }
  const resolveHold = async (holdId: string) => {
    const r = await alertGovernanceApi.resolveGovernanceHold(holdId)
    if (r.ok) { setMsg('Hold resolvido.'); await load(fixtureId) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha.')
  }

  const latest = data?.results?.[0] ?? null
  const holds = data?.holds ?? []

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Gavel size={14} className="text-white/35" />
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">Governança de decisão (B47)</h4>
        {isAdmin && <button type="button" onClick={evaluate} className="h-7 px-2 rounded-lg border border-[#2DD4BF]/25 bg-[#13B8A6]/[0.08] hover:bg-[#13B8A6]/[0.15] text-[11px] text-[#7FE9DC] inline-flex items-center gap-1"><RefreshCw size={11} />Reavaliar</button>}
      </div>
      {msg && <p className="text-[11px] text-white/65 mb-2">{msg}</p>}

      {/* Mode */}
      <div className="flex items-center gap-2 flex-wrap mb-3 text-[11px]">
        <Eye size={12} className="text-white/40" />
        <span className="text-white/80 font-medium">{GOV_MODE_LABEL[mode?.mode ?? 'observe'] || mode?.mode}</span>
        {(mode?.mode === 'observe' || mode?.mode === 'shadow' || mode?.mode === 'shadow_block') && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-sky-400/20 text-sky-200/75">advisory — não bloqueia alerta real</span>}
        {mode?.mode === 'enforce' && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-400/25 text-amber-100/85">enforce ativo</span>}
      </div>

      {/* Latest decision */}
      {latest ? <div className="mb-3"><p className="text-[10px] uppercase tracking-wide text-white/35 mb-1">Decisão atual</p><DecisionCard r={latest} /></div>
        : <p className="text-[11px] text-white/40 mb-3">Sem decisão registrada para esta partida (em observe, decisões nascem em sombra ao criar alerta/oportunidade).</p>}

      {/* Holds */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wide text-amber-100/60 mb-1 inline-flex items-center gap-1"><Clock size={11} />Holds ativos ({holds.length})</p>
        {holds.length === 0 ? <p className="text-[11px] text-white/40">Nenhum hold ativo.</p> : holds.map(h => (
          <div key={h.id} className="flex items-center gap-2 text-[10.5px] border-b border-white/[0.04] pb-0.5">
            <span className="text-amber-100/75 flex-1">{h.reason} · próxima checagem {h.nextRecommendedCheckAt ? new Date(h.nextRecommendedCheckAt).toLocaleTimeString() : 'n/d'}</span>
            {isAdmin && <button type="button" onClick={() => resolveHold(h.id)} className="text-white/40 hover:text-emerald-300/80 shrink-0 inline-flex items-center gap-1"><ArrowUpCircle size={11} />resolver</button>}
          </div>
        ))}
      </div>

      {/* Live triggers */}
      {isAdmin && (
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1 inline-flex items-center gap-1"><PlayCircle size={11} />Reavaliar ao vivo</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['lineup_confirmed', 'red_card', 'goal', 'substitution', 'half_time', 'minute_threshold'].map(t => (
              <button key={t} type="button" onClick={() => liveTrigger(t)} className="text-[10px] px-2 py-0.5 rounded-full border border-white/[0.1] text-white/55 hover:bg-white/[0.04]">{t}</button>
            ))}
          </div>
        </div>
      )}

      {/* Recent decisions */}
      {(data?.results.length ?? 0) > 1 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1">Histórico recente ({data!.results.length})</p>
          <div className="space-y-0.5 max-h-40 overflow-y-auto sidebar-scroll">
            {data!.results.slice(0, 10).map(r => (
              <div key={r.id} className="flex items-center gap-2 text-[10px] border-b border-white/[0.04] pb-0.5">
                <span className={`px-1.5 py-0.5 rounded-full border ${actionTone(r.action)}`}>{GOV_ACTION_LABEL[r.action] || r.action}</span>
                <span className="text-white/40">{r.source}</span>
                <span className="text-white/30 ml-auto">{new Date(r.generatedAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-white/30 mt-2">Governança é juízo de decisão observacional — NÃO é probabilidade nem promessa de acerto. Em observe/shadow nunca bloqueia alerta real; holds esperam e reavaliam; conflitos nunca são resolvidos em silêncio; override humano é auditado.</p>
    </div>
  )
}
