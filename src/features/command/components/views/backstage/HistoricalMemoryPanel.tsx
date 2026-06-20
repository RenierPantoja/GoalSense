/**
 * HistoricalMemoryPanel (B45 / Bloco 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-fixture historical memory: team fundamental memory (home/away + sample
 * quality), matchup memory, contextual pattern memory, taboo candidates (mostly NOT
 * usable), and similar scenarios (retrieval, not prediction). Honest empty states:
 * insufficient_history is shown as-is, never as a negative finding. Advisory only —
 * never changes score/confidence/patterns/alerts.
 */
import { useCallback, useEffect, useState } from 'react'
import { History, RefreshCw, Brain, ShieldAlert, GitCompare, Layers, Search } from 'lucide-react'
import { historicalMemoryApi } from '@/services/historicalMemoryApi'
import type {
  FixtureMemoryDto, ReadinessV6Dto, TeamFundamentalMemoryDto,
} from '@/features/matchIntelligence/historicalMemoryTypes'
import {
  MEMORY_STATE_LABEL, SAMPLE_QUALITY_LABEL, TABOO_STATUS_LABEL, READINESS_V6_LABEL,
} from '@/features/matchIntelligence/historicalMemoryTypes'

function qualTone(q: string): string {
  return q === 'strong' ? 'text-emerald-200/85 border-emerald-400/25'
    : q === 'usable' ? 'text-sky-200/80 border-sky-400/20'
      : q === 'misleading_risk' ? 'text-amber-100/85 border-amber-400/25'
        : 'text-white/45 border-white/[0.1]'
}

function recTone(r: string): string {
  return r === 'use_with_confidence' ? 'text-emerald-200/85'
    : r === 'stay_out' ? 'text-rose-200/80'
      : r === 'use_with_caution' ? 'text-amber-100/80'
        : 'text-white/45'
}

function TeamMemoryBlock({ side, mem }: { side: string; mem: TeamFundamentalMemoryDto | null }) {
  if (!mem) return <div className="text-[11px] text-white/40">{side}: sem dados.</div>
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="text-[12px] text-white/85 font-medium truncate">{mem.teamName}</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/50">{MEMORY_STATE_LABEL[mem.memoryState] || mem.memoryState}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${qualTone(mem.overallSample.quality)}`}>amostra {SAMPLE_QUALITY_LABEL[mem.overallSample.quality] || mem.overallSample.quality}</span>
      </div>
      <p className="text-[10.5px] text-white/50">casos {mem.overallSample.sampleSize} (recentes {mem.overallSample.recentSampleSize}) · casa {mem.homeAway.homeSample} / fora {mem.homeAway.awaySample}</p>
      {mem.contextBehaviors.slice(0, 3).map((c, i) => (
        <p key={i} className="text-[10px] text-white/45 mt-0.5">· {c.contextLabel}: {c.confirmed}c/{c.failed}f ({SAMPLE_QUALITY_LABEL[c.quality] || c.quality})</p>
      ))}
      {mem.memoryState === 'insufficient_history' && <p className="text-[10px] text-white/30 mt-0.5">insufficient_history — não é achado negativo.</p>}
    </div>
  )
}

export function HistoricalMemoryPanel({ fixtureId, isAdmin }: { fixtureId: string | null; isAdmin: boolean }) {
  const [mem, setMem] = useState<FixtureMemoryDto | null>(null)
  const [readiness, setReadiness] = useState<ReadinessV6Dto | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    const [m, r] = await Promise.all([historicalMemoryApi.getFixtureMemory(id), historicalMemoryApi.getReadinessV6(id)])
    if (m.ok && m.data) setMem(m.data)
    if (r.ok) setReadiness(r.data)
    setLoading(false)
  }, [])

  useEffect(() => { setMem(null); setReadiness(null); setMsg(null); if (fixtureId) void load(fixtureId) }, [fixtureId, load])

  if (!fixtureId) return null

  const build = async () => {
    const r = await historicalMemoryApi.buildFixtureMemory(fixtureId)
    if (r.ok) { setMsg(`Memória construída (${r.data?.status ?? 'ok'}): ${r.data?.teamsBuilt ?? 0} clubes, ${r.data?.matchupsBuilt ?? 0} confrontos.`); await load(fixtureId) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão para construir memória.' : r.error || 'Falha ao construir.')
  }

  const taboos = mem?.taboos ?? []
  const usableTaboos = taboos.filter(t => t.isUsableConstraint)
  const pattern = mem?.patternContextMemory ?? []

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-3">
        <History size={14} className="text-white/35" />
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">Memória histórica (B45)</h4>
        {isAdmin && <button type="button" onClick={build} className="h-7 px-2 rounded-lg border border-[#2DD4BF]/25 bg-[#13B8A6]/[0.08] hover:bg-[#13B8A6]/[0.15] text-[11px] text-[#7FE9DC] inline-flex items-center gap-1"><RefreshCw size={11} />Construir memória</button>}
      </div>
      {msg && <p className="text-[11px] text-white/65 mb-2">{msg}</p>}
      {loading && <p className="text-[11px] text-white/40 mb-2">Carregando memória…</p>}

      {readiness && (
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-white/60 mb-3">
          <Brain size={12} className="text-white/35" />
          <span className="text-white/85 font-medium">{READINESS_V6_LABEL[readiness.status] || readiness.status}</span>
          <span>· memória {readiness.memoryReadinessScore} ({readiness.memoryReliability})</span>
          {readiness.memorySupportsPattern && <span className="text-emerald-200/75">· apoio de contexto</span>}
          {readiness.memoryContradictsPattern && <span className="text-rose-200/75">· contexto contrário</span>}
          {readiness.misleadingContexts.length > 0 && <span className="text-amber-100/75">· contexto enganoso</span>}
        </div>
      )}

      {/* Team memory */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <TeamMemoryBlock side="casa" mem={mem?.homeMemory ?? null} />
        <TeamMemoryBlock side="fora" mem={mem?.awayMemory ?? null} />
      </div>

      {/* Matchup memory */}
      {mem?.matchupMemory && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <GitCompare size={12} className="text-white/40" />
            <span className="text-white/80 font-medium">Confronto direto</span>
            <span className="text-white/50">· {mem.matchupMemory.matchesFound} jogo(s) ({mem.matchupMemory.relevantMatches} rel.)</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/50">{MEMORY_STATE_LABEL[mem.matchupMemory.matchupState] || mem.matchupMemory.matchupState}</span>
          </div>
          {mem.matchupMemory.matchupState === 'insufficient_data' && <p className="text-[10px] text-white/30 mt-0.5">insufficient_data — não é tabu.</p>}
        </div>
      )}

      {/* Contextual pattern memory */}
      {pattern.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1 inline-flex items-center gap-1"><Layers size={11} />Padrão × contexto ({pattern.length})</p>
          <div className="space-y-0.5 max-h-40 overflow-y-auto sidebar-scroll">
            {pattern.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-[10.5px] border-b border-white/[0.04] pb-0.5 flex-wrap">
                <span className="text-white/70 truncate flex-1">{p.patternName} · {p.contextLabel}</span>
                <span className="text-white/40">{p.confirmed}c/{p.confirmedPartial}cp/{p.failed}f</span>
                <span className={`${recTone(p.recommendation)} text-[9.5px]`}>{p.recommendation}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Taboos */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1 inline-flex items-center gap-1"><ShieldAlert size={11} />Restrições históricas ({usableTaboos.length} usável / {taboos.length})</p>
        {taboos.length === 0 ? <p className="text-[11px] text-white/40">Nenhuma restrição detectada (amostra pequena nunca vira tabu).</p> : (
          <div className="space-y-0.5 max-h-32 overflow-y-auto sidebar-scroll">
            {taboos.map((t, i) => (
              <div key={i} className="flex items-start gap-2 text-[10.5px] border-b border-white/[0.04] pb-0.5">
                <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border ${t.isUsableConstraint ? 'border-rose-400/25 text-rose-200/80' : 'border-white/10 text-white/40'}`}>{TABOO_STATUS_LABEL[t.status] || t.status}</span>
                <span className="text-white/60 flex-1">{t.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Similar scenarios */}
      {mem?.similarScenarios && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1 inline-flex items-center gap-1"><Search size={11} />Cenários similares ({mem.similarScenarios.usableScenarios} úteis / {mem.similarScenarios.scenarios.length})</p>
          {mem.similarScenarios.scenarios.length === 0 ? <p className="text-[11px] text-white/40">Sem cenários similares suficientes (insufficient_history).</p> : (
            <div className="space-y-0.5 max-h-32 overflow-y-auto sidebar-scroll">
              {mem.similarScenarios.scenarios.slice(0, 8).map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[10.5px] border-b border-white/[0.04] pb-0.5 flex-wrap">
                  <span className="text-white/40">{s.similarityScore.toFixed(2)}</span>
                  <span className="text-white/60 truncate flex-1">{s.contextSummary}</span>
                  <span className="text-white/45 text-[9.5px]">{s.observedOutcome}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-white/30 mt-1">Recuperação de cenários ≠ previsão; similaridade é distância, não probabilidade.</p>
        </div>
      )}

      <p className="text-[10px] text-white/30 mt-2">Memória é apoio observacional: confiança de dado, não probabilidade de acerto. Amostra pequena nunca conclui; H2H insuficiente nunca é tabu; histórico antigo pesa menos. Não altera score/alertas.</p>
    </div>
  )
}
