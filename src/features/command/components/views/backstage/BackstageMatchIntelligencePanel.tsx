/**
 * BackstageMatchIntelligencePanel (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Operator view of the "match brain": today's games + readiness, the consolidated
 * intelligence package (context, memory, H2H, squad/lineup, tactical, live, post),
 * positive/negative/uncertain decision inputs, the operational recommendation
 * (precheck, observe-first), and post-match explanation. Honest empty states. No
 * invented prediction, no odds, no stake.
 */
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Brain, ListChecks, Gauge, AlertTriangle, Clock, ShieldQuestion, Microscope } from 'lucide-react'
import { matchIntelligenceApi } from '@/services/matchIntelligenceApi'
import { useAuth } from '@/auth/useAuth'
import type {
  MatchDayScopeDto, ScopedFixtureDto, MatchIntelligencePackageDto, AlertPrecheckDto, PostMatchExplanationDto,
} from '@/features/matchIntelligence/matchIntelligenceTypes'
import { PRECHECK_LABEL, READINESS_LABEL } from '@/features/matchIntelligence/matchIntelligenceTypes'

function Card({ title, icon, children, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4"><div className="flex items-center gap-2 mb-3"><span className="text-white/35">{icon}</span><h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">{title}</h4>{action}</div>{children}</div>
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-0.5"><span className="text-[11px] text-white/45">{k}</span><span className="text-[12px] text-white/85 text-right">{v}</span></div>
}
function dirTone(dir: string): string {
  return dir === 'positive' ? 'text-emerald-200/85' : dir === 'negative' ? 'text-rose-200/85' : dir === 'blocking' ? 'text-amber-200/90' : dir === 'uncertain' ? 'text-white/55' : 'text-sky-200/75'
}

export function BackstageMatchIntelligencePanel() {
  const { isAdmin } = useAuth()
  const [scope, setScope] = useState<MatchDayScopeDto | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [pkg, setPkg] = useState<MatchIntelligencePackageDto | null>(null)
  const [precheck, setPrecheck] = useState<AlertPrecheckDto | null>(null)
  const [postMatch, setPostMatch] = useState<PostMatchExplanationDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [disabled, setDisabled] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [onlyLive, setOnlyLive] = useState(false)

  const loadScope = useCallback(async () => {
    setLoading(true); setMsg(null)
    const r = await matchIntelligenceApi.getTodayMatchScope(onlyLive)
    if (r.reason === 'env_gate' || r.status === 403) { setDisabled(true); setLoading(false); return }
    if (r.ok && r.data) setScope(r.data)
    setLoading(false)
  }, [onlyLive])

  useEffect(() => { void loadScope() }, [loadScope])

  const openFixture = useCallback(async (id: string) => {
    setSelected(id); setPkg(null); setPrecheck(null); setPostMatch(null)
    const [p, pc, pm] = await Promise.all([
      matchIntelligenceApi.getMatchIntelligencePackage(id),
      matchIntelligenceApi.getAlertPrecheck(id),
      matchIntelligenceApi.getPostMatchExplanation(id),
    ])
    if (p.ok) setPkg(p.data)
    if (pc.ok) setPrecheck(pc.data)
    if (pm.ok) setPostMatch(pm.data)
  }, [])

  const refresh = async () => {
    if (!selected) return
    const r = await matchIntelligenceApi.refreshMatchIntelligence(selected)
    if (r.ok) { setMsg('Pacote atualizado (respeitando orçamento de provider).'); await openFixture(selected) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão para atualizar.' : r.error || 'Falha ao atualizar.')
  }

  if (loading) return <p className="text-[12px] text-white/40 px-1 py-8 text-center">Carregando Backstage…</p>
  if (disabled) return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-8 text-center">
      <Brain size={22} className="mx-auto text-white/25 mb-3" />
      <p className="text-[14px] text-white/80 font-medium">Match Intelligence desabilitado</p>
      <p className="text-[12px] text-white/45 mt-1.5">Defina ENABLE_MATCH_INTELLIGENCE=true no backend.</p>
    </div>
  )

  const fixtures = scope?.scopedFixtures ?? []

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-white/45">Backstage — cérebro fundamentalista dos jogos de hoje. Observacional: decide quando analisar, esperar ou ficar fora. Sem previsão inventada, sem odds, sem aposta.</p>
      {msg && <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-[12px] text-white/70">{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today list */}
        <Card title={`Jogos de hoje (${fixtures.length})`} icon={<Clock size={14} />} action={
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => setOnlyLive(v => !v)} className={`text-[10px] px-2 py-0.5 rounded-full border ${onlyLive ? 'border-[#2DD4BF]/30 text-[#7FE9DC]' : 'border-white/[0.1] text-white/45'}`}>ao vivo</button>
            <button type="button" onClick={loadScope} className="text-white/40 hover:text-white/70"><RefreshCw size={13} /></button>
          </span>
        }>
          {fixtures.length === 0 ? <p className="text-[11.5px] text-white/40">Nenhum jogo de hoje no backend (ingestão ESPN pode estar desligada).</p> : (
            <div className="space-y-1 max-h-[420px] overflow-y-auto sidebar-scroll">
              {fixtures.map(f => (
                <button key={f.fixtureId} type="button" onClick={() => openFixture(f.fixtureId)} className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${selected === f.fixtureId ? 'border-white/[0.14] bg-white/[0.04]' : 'border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.025]'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-white/85 font-medium flex-1 truncate">{f.homeTeam} vs {f.awayTeam}</span>
                    {f.isLive && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-emerald-400/25 text-emerald-200/85">AO VIVO</span>}
                    {f.isFinished && <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/45">FIM</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-white/40 truncate">{f.competition}</span>
                    <span className="text-[9.5px] text-white/35">· {f.importanceLabel}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {scope?.limitations.map((l, i) => <p key={i} className="text-[10px] text-white/30 mt-2">· {l}</p>)}
        </Card>

        {/* Match brain */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <Card title="Cérebro da partida" icon={<Brain size={14} />}><p className="text-[11.5px] text-white/40">Selecione um jogo para ver contexto, memória, escalação, tática e recomendação.</p></Card>
          ) : !pkg ? (
            <Card title="Cérebro da partida" icon={<Brain size={14} />}><p className="text-[11.5px] text-white/40">Carregando pacote de inteligência…</p></Card>
          ) : (
            <>
              {/* Recommendation */}
              <Card title="Recomendação operacional" icon={<ShieldQuestion size={14} />} action={isAdmin ? <button type="button" onClick={refresh} className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] text-white/70 inline-flex items-center gap-1"><RefreshCw size={11} />Atualizar</button> : undefined}>
                {precheck && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-white/90">{PRECHECK_LABEL[precheck.decision] || precheck.decision}</span>
                      <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full border ${precheck.mode === 'observe' ? 'border-sky-400/20 text-sky-200/80' : 'border-amber-400/25 text-amber-100/85'}`}>modo {precheck.mode}</span>
                      {!precheck.enabled && <span className="text-[9.5px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/45">precheck off (não bloqueia)</span>}
                    </div>
                    {precheck.reasons.map((r, i) => <p key={i} className="text-[11px] text-white/60">· {r}</p>)}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1">
                      {precheck.gates.map((g, i) => <span key={i} className={`text-[10px] px-2 py-1 rounded-lg border ${g.passed ? 'border-emerald-400/15 text-emerald-200/70' : 'border-amber-400/20 text-amber-100/75'}`}>{g.gate}: {g.passed ? 'ok' : 'x'}</span>)}
                    </div>
                  </div>
                )}
                {pkg.readiness && (
                  <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-white/55">
                    <Gauge size={12} /> <span>prontidão: {READINESS_LABEL[pkg.readiness.status] || pkg.readiness.status} ({pkg.readiness.score})</span>
                    {pkg.waitReasons.slice(0, 1).map((w, i) => <span key={i} className="text-amber-100/70">· {w}</span>)}
                  </div>
                )}
              </Card>

              {/* Context + sub-profiles */}
              <Card title={`Cérebro: ${pkg.fixture.homeTeam} vs ${pkg.fixture.awayTeam}`} icon={<Brain size={14} />}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <KV k="fase" v={pkg.phase} />
                  <KV k="importância" v={pkg.context?.importanceLevel ?? 'unknown'} />
                  <KV k="volatilidade" v={pkg.context?.volatilityRisk ?? 'unknown'} />
                  <KV k="clássico/rivalidade" v={pkg.context?.rivalryLevel ?? 'unknown'} />
                  <KV k="mata-mata" v={String(pkg.context?.competitionContext.isKnockout ?? 'unknown')} />
                  <KV k="escalação" v={pkg.squads?.lineupStatus ?? 'unknown'} />
                  <KV k="lesões" v={pkg.squads?.injuryImpact ?? 'unknown'} />
                  <KV k="suspensões" v={pkg.squads?.suspensionImpact ?? 'unknown'} />
                  <KV k="H2H" v={`${pkg.h2h?.relevantMatches ?? 0} rel. (${pkg.h2h?.h2hReliability ?? 'n/d'})`} />
                  <KV k="tático" v={pkg.tactical ? `${pkg.tactical.expectedTempo}/${pkg.tactical.cardRisk}` : 'unknown'} />
                  <KV k="memória casa" v={pkg.teams.home ? `${pkg.teams.home.sampleQuality}` : 'n/d'} />
                  <KV k="memória fora" v={pkg.teams.away ? `${pkg.teams.away.sampleQuality}` : 'n/d'} />
                </div>
                {pkg.live && <p className="text-[10.5px] text-white/45 mt-2">Ao vivo: {pkg.live.minute ?? '?'}' · {pkg.live.score?.home}-{pkg.live.score?.away} · stats {pkg.live.hasStats ? 'sim' : 'não'} ({pkg.live.dataQuality})</p>}
                <p className="text-[10px] text-white/30 mt-2">{pkg.squads?.waitForLineupRecommended ? 'Escalação ainda não disponível — recomendado esperar. ' : ''}Dados pré-jogo ausentes são marcados honestamente (unknown ≠ sem lesão/suspensão).</p>
              </Card>

              {/* Decision inputs */}
              <Card title="Fatores (positivo / negativo / incerto)" icon={<ListChecks size={14} />}>
                <div className="space-y-1 max-h-[260px] overflow-y-auto sidebar-scroll">
                  {pkg.decisionInputs.all.length === 0 ? <p className="text-[11px] text-white/40">Sem fatores registrados.</p> : pkg.decisionInputs.all.map(d => (
                    <div key={d.id} className="flex items-start gap-2 text-[11px] border-b border-white/[0.04] pb-1">
                      <span className={`shrink-0 w-16 ${dirTone(d.direction)}`}>{d.direction}</span>
                      <span className="text-white/70 flex-1">{d.variableName}: <span className="text-white/85">{d.value}</span></span>
                      <span className="text-white/30 shrink-0">{d.weightHint}/{d.dataQuality}</span>
                    </div>
                  ))}
                </div>
                {pkg.stayOutReasons.length > 0 && <p className="text-[10.5px] text-amber-100/70 mt-2 inline-flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5" />Ficar fora: {pkg.stayOutReasons.join('; ')}</p>}
              </Card>

              {/* Post-match */}
              {pkg.phase === 'post_match' && postMatch && (
                <Card title="Pós-jogo — por que funcionou / falhou" icon={<Microscope size={14} />}>
                  <KV k="outcome" v={postMatch.outcome} />
                  {postMatch.keyReasonsItWorked.map((r, i) => <p key={`w${i}`} className="text-[11px] text-emerald-200/75">+ {r}</p>)}
                  {postMatch.keyReasonsItFailed.map((r, i) => <p key={`f${i}`} className="text-[11px] text-rose-200/75">− {r}</p>)}
                  {postMatch.unexpectedEvents.length > 0 && <p className="text-[10.5px] text-white/55 mt-1">Eventos inesperados: {postMatch.unexpectedEvents.join(', ')}</p>}
                  <div className="flex items-center gap-2 flex-wrap mt-1 text-[10px] text-white/45">
                    <span>acaso c/ evidência: {postMatch.wasMostlyRandom ? 'sim' : 'não'}</span>
                    <span>· análise fraca: {postMatch.wasAnalysisWeak ? 'sim' : 'não'}</span>
                    <span>· limitado por dados: {postMatch.wasProviderLimited ? 'sim' : 'não'}</span>
                  </div>
                  {postMatch.learningNotes.map((n, i) => <p key={`n${i}`} className="text-[10px] text-white/40 mt-0.5">· {n}</p>)}
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
