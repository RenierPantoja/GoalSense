/**
 * LiveValidationLab (Phase B37) — organize controlled local live-validation sessions.
 * ─────────────────────────────────────────────────────────────────────────────
 * Observational: pick fixtures/leagues, start/pause/complete a session, and read an
 * honest summary/report (coverage, snapshots, signals, alerts, opportunities,
 * outcomes, evidence, operational risk). Never starts workers, never changes guard
 * mode, never promises hit-rate/profit. Zero odds/Telegram/auto-bet.
 */
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Plus, Play, Pause, CheckCircle2, XCircle, FlaskConical, Activity, AlertTriangle } from 'lucide-react'
import { liveValidationApi } from '@/services/liveValidationApi'
import { useAuth } from '@/auth/useAuth'
import type {
  LiveValidationSessionDto, LiveValidationSessionFixtureDto, LiveValidationSessionEventDto,
  LiveValidationSessionReportDto, LiveValidationLinkedRecordsDto,
} from '@/features/validation/liveValidationTypes'
import { STATUS_TONE, STATUS_LABEL, GONOGO_LABEL } from '@/features/validation/liveValidationTypes'

function Card({ title, icon, children, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4"><div className="flex items-center gap-2 mb-3"><span className="text-white/35">{icon}</span><h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">{title}</h4>{action}</div>{children}</div>
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-0.5"><span className="text-[11px] text-white/45">{k}</span><span className="text-[12px] text-white/85 text-right tabular-nums">{v}</span></div>
}

export function LiveValidationLab() {
  const { isAdmin } = useAuth()
  const [sessions, setSessions] = useState<LiveValidationSessionDto[]>([])
  const [selected, setSelected] = useState<LiveValidationSessionDto | null>(null)
  const [fixtures, setFixtures] = useState<LiveValidationSessionFixtureDto[]>([])
  const [events, setEvents] = useState<LiveValidationSessionEventDto[]>([])
  const [report, setReport] = useState<LiveValidationSessionReportDto | null>(null)
  const [linked, setLinked] = useState<LiveValidationLinkedRecordsDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [disabled, setDisabled] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // create form
  const [name, setName] = useState('')
  const [leagues, setLeagues] = useState('')
  const [maxFixtures, setMaxFixtures] = useState('10')

  const loadSessions = useCallback(async () => {
    setLoading(true); setMsg(null)
    const r = await liveValidationApi.list()
    if (r.reason === 'env_gate' || r.status === 403) { setDisabled(true); setLoading(false); return }
    if (r.ok && r.data) setSessions(r.data)
    setLoading(false)
  }, [])

  useEffect(() => { void loadSessions() }, [loadSessions])

  const openSession = useCallback(async (id: string) => {
    const [s, f, e, rep, lr] = await Promise.all([
      liveValidationApi.get(id), liveValidationApi.fixtures(id), liveValidationApi.events(id), liveValidationApi.getReport(id), liveValidationApi.linkedRecords(id),
    ])
    if (s.ok) setSelected(s.data)
    if (f.ok && f.data) setFixtures(f.data)
    if (e.ok && e.data) setEvents(e.data)
    setReport(rep.ok ? rep.data : null)
    setLinked(lr.ok ? lr.data : null)
  }, [])

  const create = async () => {
    if (!name.trim()) { setMsg('Informe um nome para a sessão.'); return }
    const scope = {
      leagueNames: leagues.split(',').map(s => s.trim()).filter(Boolean),
      maxFixtures: Math.max(1, parseInt(maxFixtures) || 10),
    }
    const r = await liveValidationApi.create({ name: name.trim(), fixtureScope: scope, goals: ['validateProviderCoverage', 'validateSnapshots'] })
    if (r.ok && r.data) { setName(''); setLeagues(''); await loadSessions(); await openSession(r.data.id); setMsg('Sessão criada (rascunho).') }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha ao criar.')
  }

  const act = async (fn: () => Promise<{ ok: boolean; error: string | null; reason: any; data: any }>, okMsg: string) => {
    const r = await fn()
    if (r.ok) { setMsg(okMsg); await loadSessions(); if (selected) await openSession(selected.id) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão para esta ação.' : r.error || 'Falha.')
  }

  if (loading) return <p className="text-[12px] text-white/40 px-1 py-8 text-center">Carregando validação ao vivo…</p>
  if (disabled) return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-8 text-center">
      <FlaskConical size={22} className="mx-auto text-white/25 mb-3" />
      <p className="text-[14px] text-white/80 font-medium">Sessões de validação desabilitadas</p>
      <p className="text-[12px] text-white/45 mt-1.5">Defina ENABLE_LIVE_VALIDATION_SESSIONS=true no backend.</p>
    </div>
  )

  const sel = selected
  const sum = report?.summary ?? sel?.summary ?? null

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-white/45">Organize a validação local de jogos reais. Observacional: não liga workers, não muda guard mode, não promete acerto. Sem odds, sem Telegram, sem aposta.</p>
      {msg && <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-[12px] text-white/70">{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Create */}
        <Card title="Nova sessão" icon={<Plus size={14} />}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome (ex.: Brasileirão domingo)" className="w-full h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[12px] text-white/90 placeholder:text-white/30 outline-none focus:border-[#2DD4BF]/40 mb-2" />
          <input value={leagues} onChange={e => setLeagues(e.target.value)} placeholder="Ligas (separadas por vírgula, opcional)" className="w-full h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[12px] text-white/90 placeholder:text-white/30 outline-none focus:border-[#2DD4BF]/40 mb-2" />
          <div className="flex items-center gap-2">
            <input value={maxFixtures} onChange={e => setMaxFixtures(e.target.value)} type="number" min={1} className="h-9 w-24 px-3 rounded-lg border border-white/[0.08] bg-white/[0.025] text-[12px] text-white/90 outline-none focus:border-[#2DD4BF]/40" />
            <span className="text-[11px] text-white/40 flex-1">máx. jogos (respeita o cap local)</span>
            <button type="button" onClick={create} className="h-9 px-3 rounded-lg border border-[#2DD4BF]/25 bg-[#13B8A6]/[0.08] hover:bg-[#13B8A6]/[0.15] text-[12px] text-[#7FE9DC] inline-flex items-center gap-1.5"><Plus size={13} />Criar</button>
          </div>
        </Card>

        {/* Sessions list */}
        <Card title="Sessões" icon={<FlaskConical size={14} />} action={<button type="button" onClick={loadSessions} className="text-white/40 hover:text-white/70"><RefreshCw size={13} /></button>}>
          {sessions.length === 0 ? <p className="text-[11.5px] text-white/40">Nenhuma sessão ainda.</p> : (
            <div className="space-y-1">
              {sessions.slice(0, 8).map(s => (
                <button key={s.id} type="button" onClick={() => openSession(s.id)} className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${sel?.id === s.id ? 'border-white/[0.14] bg-white/[0.04]' : 'border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.025]'}`}>
                  <span className="text-[12px] text-white/85 font-medium flex-1 truncate">{s.name}</span>
                  <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full border ${STATUS_TONE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {sel && (
        <Card title={`Sessão: ${sel.name}`} icon={<Activity size={14} />} action={
          isAdmin ? (
            <span className="flex items-center gap-1">
              {(sel.status === 'draft' || sel.status === 'ready') && <button type="button" onClick={() => act(() => liveValidationApi.start(sel.id), 'Sessão iniciada.')} className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] text-white/70 inline-flex items-center gap-1"><Play size={11} />Iniciar</button>}
              {sel.status === 'running' && <button type="button" onClick={() => act(() => liveValidationApi.pause(sel.id), 'Pausada.')} className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] text-white/70 inline-flex items-center gap-1"><Pause size={11} />Pausar</button>}
              {sel.status === 'paused' && <button type="button" onClick={() => act(() => liveValidationApi.resume(sel.id), 'Retomada.')} className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] text-white/70 inline-flex items-center gap-1"><Play size={11} />Retomar</button>}
              {(sel.status === 'running' || sel.status === 'paused') && <button type="button" onClick={() => act(() => liveValidationApi.complete(sel.id), 'Concluída — relatório gerado.')} className="h-7 px-2 rounded-lg border border-emerald-400/20 bg-emerald-500/8 hover:bg-emerald-500/15 text-[11px] text-emerald-200/85 inline-flex items-center gap-1"><CheckCircle2 size={11} />Concluir</button>}
              {sel.status !== 'completed' && sel.status !== 'cancelled' && <button type="button" onClick={() => act(() => liveValidationApi.cancel(sel.id), 'Cancelada.')} className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] text-white/55 inline-flex items-center gap-1"><XCircle size={11} />Cancelar</button>}
              <button type="button" onClick={() => act(() => liveValidationApi.generateReport(sel.id), 'Relatório gerado.')} className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] text-white/70 inline-flex items-center gap-1">Relatório</button>
            </span>
          ) : undefined
        }>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${STATUS_TONE[sel.status]}`}>{STATUS_LABEL[sel.status]}</span>
            <span className="text-[10px] text-white/40">perfil {sel.localRuntimeProfile} · guard {sel.guardMode} · {sel.appEnv}</span>
            {report && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/[0.1] text-white/60">go/no-go: {GONOGO_LABEL[report.goNoGo] || report.goNoGo}</span>}
          </div>
          {sel.limitations.length > 0 && <p className="text-[10.5px] text-amber-100/70 mb-2 inline-flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5" />{sel.limitations[0]}</p>}

          {sum && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <KV k="jogos obs." v={`${sum.fixturesObserved}/${sum.fixturesPlanned}`} />
              <KV k="snapshots" v={sum.snapshotsWritten} />
              <KV k="sinais" v={sum.signalsCreated} />
              <KV k="alertas" v={sum.alertsCreated} />
              <KV k="oportunidades" v={sum.opportunitiesCreated} />
              <KV k="outcomes" v={sum.outcomesResolved} />
              <KV k="evid. exato/inf." v={`${sum.exactEvidenceLinks}/${sum.inferredEvidenceLinks}`} />
              <KV k="prov. bloq." v={sum.providerCallsBlocked} />
            </div>
          )}

          {/* Fixtures */}
          {fixtures.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1">Fixtures ({fixtures.length})</p>
              <div className="space-y-1">
                {fixtures.slice(0, 12).map(f => (
                  <div key={f.id} className="flex items-center gap-2 text-[11px] border-b border-white/[0.04] pb-1 flex-wrap">
                    <span className="text-white/75 flex-1 truncate">{f.homeTeam} vs {f.awayTeam}</span>
                    <span className="text-white/40">{f.competition}</span>
                    <span className={`px-1.5 py-0.5 rounded-full border text-[9.5px] ${f.coverageStatus === 'covered' ? 'border-emerald-400/20 text-emerald-200/80' : f.coverageStatus === 'absent' ? 'border-white/10 text-white/40' : 'border-sky-400/20 text-sky-200/80'}`}>{f.coverageStatus}</span>
                    <span className="text-white/45 tabular-nums">snap {f.snapshotCount} · sin {f.signalCount} · al {f.alertCount} · op {f.opportunityCount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* B38: linked records (exact vs inferred) + outcome breakdown + attribution coverage */}
          {linked && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-3 mb-3">
              <p className="text-[10px] uppercase tracking-wide text-white/35 mb-2">Registros vinculados (atribuição)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                <KV k="alertas" v={linked.alerts.length} />
                <KV k="oportunidades" v={linked.opportunities.length} />
                <KV k="evidências" v={linked.evidence.length} />
                <KV k="outcomes" v={linked.outcomes.length} />
              </div>
              {sum && (
                <div className="flex items-center gap-3 flex-wrap text-[10.5px] text-white/55 mb-1">
                  <span>exato {sum.exactSessionAttributionCount ?? 0}</span>
                  <span>· inferido {sum.inferredSessionGroupingCount ?? 0}</span>
                  <span>· cobertura {sum.attributionCoverageRate == null ? '—' : `${Math.round(sum.attributionCoverageRate * 100)}%`}</span>
                </div>
              )}
              {sum?.outcomeBreakdown && (
                <div className="flex items-center gap-2 flex-wrap text-[10px] text-white/50">
                  <span className="text-emerald-200/75">conf {sum.outcomeBreakdown.confirmed}</span>
                  <span className="text-emerald-200/60">parcial {sum.outcomeBreakdown.confirmed_partial}</span>
                  <span className="text-rose-200/70">falha {sum.outcomeBreakdown.failed}</span>
                  <span className="text-amber-100/70">unknown {sum.outcomeBreakdown.unknown}</span>
                  <span className="text-white/40">n/aval {sum.outcomeBreakdown.not_evaluable}</span>
                  <span className="text-white/40">pendente {sum.outcomeBreakdown.pending}</span>
                </div>
              )}
              <p className="text-[10px] text-white/30 mt-1.5">Exato = registro carimbado com sessionId; inferido = agrupado por fixture/janela. unknown/not_evaluable/pendente nunca são falha.</p>
            </div>
          )}

          {/* Recommendations */}
          {sum && sum.recommendations.length > 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-3 mb-3">
              <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1">Recomendações (cautelosas)</p>
              {sum.recommendations.map((r, i) => <p key={i} className="text-[11px] text-white/65 leading-relaxed">· {r}</p>)}
            </div>
          )}

          {/* Timeline */}
          {events.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1">Timeline ({events.length})</p>
              <div className="space-y-0.5 max-h-48 overflow-y-auto sidebar-scroll">
                {events.slice(0, 30).map(e => (
                  <div key={e.id} className="flex items-center gap-2 text-[10.5px] text-white/55">
                    <span className="text-white/35 tabular-nums shrink-0">{new Date(e.createdAt).toLocaleTimeString()}</span>
                    <span className={`shrink-0 ${e.severity === 'critical' ? 'text-rose-300/80' : e.severity === 'warning' ? 'text-amber-200/75' : 'text-white/45'}`}>{e.type}</span>
                    <span className="truncate">{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-[10px] text-white/30 mt-2">Resumo observacional: agrupa dados por fixture/janela. unknown/not_evaluable nunca é falha; cobertura ausente não é falha.</p>
        </Card>
      )}
    </div>
  )
}
