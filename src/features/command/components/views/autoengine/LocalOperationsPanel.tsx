/**
 * LocalOperationsPanel — operate the GoalSense backend locally with safety. (B30)
 * ─────────────────────────────────────────────────────────────────────────────
 * Operational (not commercial) panel: runtime profile, provider/snapshot budgets,
 * coverage, workers (pause/resume), volume risk, and operational warnings. Honest
 * states; admin/owner controls; no secrets. Auto-create/Telegram flags surfaced.
 */
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Activity, Database, ShieldAlert, Gauge, Cpu, Pause, Play, RotateCcw, AlertTriangle } from 'lucide-react'
import { localOperationsApi } from '@/services/localOperationsApi'
import { useAuth } from '@/auth/useAuth'
import type {
  LocalOperationsStatusDto, ProviderUsageDto, SnapshotGuardDto, CoverageDto, WorkerDto,
} from '@/features/command/intelligence/localOperationsTypes'
import { RISK_LABEL, RISK_TONE } from '@/features/command/intelligence/localOperationsTypes'

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4"><div className="flex items-center gap-2 mb-3"><span className="text-white/35">{icon}</span><h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{title}</h4></div>{children}</div>
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-0.5"><span className="text-[11px] text-white/45">{k}</span><span className="text-[12px] text-white/85 text-right tabular-nums">{v}</span></div>
}

export function LocalOperationsPanel() {
  const { isAdmin } = useAuth()
  const [status, setStatus] = useState<LocalOperationsStatusDto | null>(null)
  const [usage, setUsage] = useState<ProviderUsageDto | null>(null)
  const [snap, setSnap] = useState<SnapshotGuardDto | null>(null)
  const [coverage, setCoverage] = useState<CoverageDto | null>(null)
  const [workers, setWorkers] = useState<WorkerDto[]>([])
  const [loading, setLoading] = useState(true)
  const [disabled, setDisabled] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setMsg(null)
    const s = await localOperationsApi.getStatus()
    if (s.reason === 'env_gate' || s.status === 403) { setDisabled(true); setLoading(false); return }
    if (s.ok) setStatus(s.data)
    const [u, g, c, w] = await Promise.all([
      localOperationsApi.getProviderUsage(), localOperationsApi.getSnapshotGuard(),
      localOperationsApi.getCoverage(), localOperationsApi.getWorkers(),
    ])
    if (u.ok) setUsage(u.data)
    if (g.ok) setSnap(g.data)
    if (c.ok) setCoverage(c.data)
    if (w.ok && w.data) setWorkers(w.data)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const act = async (fn: () => Promise<{ ok: boolean; error: string | null; reason: any }>, okMsg: string) => {
    const r = await fn()
    setMsg(r.ok ? okMsg : (r.reason === 'forbidden' ? 'Sem permissão para esta ação.' : r.error || 'Falha.'))
    if (r.ok) await load()
  }

  if (loading) return <p className="text-[12px] text-white/40 px-1 py-8 text-center">Carregando operação local…</p>
  if (disabled) return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-8 text-center">
      <Activity size={22} className="mx-auto text-white/25 mb-3" />
      <p className="text-[14px] text-white/80 font-medium">Painel de operação local desabilitado</p>
      <p className="text-[12px] text-white/45 mt-1.5">Defina ENABLE_LOCAL_OPERATIONS_PANEL=true no backend para habilitar.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-[12px] text-white/45 flex-1 min-w-[200px]">Operação local segura: perfil, orçamentos de provider/snapshot, cobertura e workers. Sem Telegram, sem odds, sem auto-aposta.</p>
        {status && <span className={`text-[10.5px] font-semibold px-2 py-1 rounded-full border ${RISK_TONE[status.riskLevel]}`}>Risco: {RISK_LABEL[status.riskLevel]}</span>}
        <button type="button" onClick={load} className="h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[12px] text-white/60 hover:text-white/90 inline-flex items-center gap-1.5 transition-colors shrink-0"><RefreshCw size={13} />Atualizar</button>
        {isAdmin && <button type="button" onClick={() => act(localOperationsApi.resetGuardCounters, 'Contadores zerados (nenhum dado apagado).')} className="h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[12px] text-white/60 hover:text-white/90 inline-flex items-center gap-1.5 transition-colors shrink-0"><RotateCcw size={13} />Zerar contadores</button>}
      </div>
      {msg && <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-[12px] text-white/70">{msg}</div>}

      {status && status.warnings.length > 0 && (
        <Card title="Avisos operacionais" icon={<AlertTriangle size={14} />}>
          <div className="space-y-1.5">
            {status.warnings.map((w, i) => (
              <div key={i} className={`text-[11.5px] px-2.5 py-1.5 rounded-lg border ${w.severity === 'critical' ? 'bg-rose-500/8 border-rose-400/20 text-rose-200/85' : 'bg-amber-500/8 border-amber-400/15 text-amber-100/75'}`}>{w.message}</div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {status && (
          <Card title={`Perfil: ${status.profile}`} icon={<Gauge size={14} />}>
            <p className="text-[11.5px] text-white/60 mb-2">{status.profileRecommendation.description}</p>
            {status.flagMismatches.length > 0
              ? <p className="text-[11px] text-amber-100/75">Flags perigosas ON contra o perfil: {status.flagMismatches.join(', ')}</p>
              : <p className="text-[11px] text-[#7FE9DC]/75">Flags coerentes com o perfil seguro.</p>}
            <div className="mt-2"><KV k="Provider calls/h (estimado)" v={status.estimate.providerCallsPerHour} /><KV k="Escritas/h (projetado)" v={status.estimate.projectedWritesPerHour} /><KV k="Escritas/dia (projetado)" v={status.estimate.projectedDailyWrites} /></div>
            {status.estimate.notes.map((n, i) => <p key={i} className="text-[10.5px] text-white/40 mt-1">{n}</p>)}
          </Card>
        )}
        {usage && (
          <Card title="Uso de provider" icon={<Activity size={14} />}>
            <KV k="Limite/min · /h" v={`${usage.limits.perMinute} · ${usage.limits.perHour}`} />
            {usage.records.length === 0 ? <p className="text-[11px] text-white/35 mt-1">Nenhuma chamada registrada nesta sessão.</p>
              : usage.records.map((r, i) => <KV key={i} k={`${r.provider}/${r.operation}`} v={`${r.minuteCount}/min · ${r.hourCount}/h · ${r.blockedCount} bloq`} />)}
            {usage.nearLimit && <p className="text-[11px] text-amber-100/75 mt-1">Próximo do limite por hora.</p>}
          </Card>
        )}
        {snap && (
          <Card title="Guarda de snapshot" icon={<Database size={14} />}>
            <KV k="Intervalo mín · máx/partida" v={`${snap.limits.minIntervalSeconds}s · ${snap.limits.maxPerFixturePerMatch}`} />
            <KV k="Escritos · pulados" v={`${snap.totalWrites} · ${snap.totalSkips}`} />
            <KV k="Fixtures rastreadas" v={snap.trackedFixtures} />
            {Object.keys(snap.skipReasons).length > 0 && <p className="text-[10.5px] text-white/40 mt-1">Pulos: {Object.entries(snap.skipReasons).map(([k, v]) => `${k}=${v}`).join(' · ')}</p>}
          </Card>
        )}
        {coverage && (
          <Card title="Cobertura de dados" icon={<ShieldAlert size={14} />}>
            <KV k="Ao vivo · com snapshot" v={`${coverage.fixturesLive} · ${coverage.fixturesWithSnapshot}`} />
            <KV k="Qualidade (r/p/p/u)" v={`${coverage.quality.rich}/${coverage.quality.partial}/${coverage.quality.poor}/${coverage.quality.unknown}`} />
            <KV k="Snapshots stale" v={coverage.staleSnapshots} />
            {coverage.lowCoverageLeagues.length > 0 && <p className="text-[10.5px] text-white/40 mt-1">Baixa cobertura: {coverage.lowCoverageLeagues.slice(0, 3).map(l => `${l.league} (${l.withSnapshot}/${l.live})`).join(' · ')}</p>}
            <p className="text-[10px] text-white/35 mt-1">unknown/ausente é explícito e nunca é falha.</p>
          </Card>
        )}
      </div>

      <Card title="Workers" icon={<Cpu size={14} />}>
        {workers.length === 0 ? <p className="text-[11px] text-white/35">Nenhum worker registrado.</p> : (
          <div className="space-y-1.5">
            {workers.map(w => (
              <div key={w.name} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-2 flex-wrap">
                <span className="text-[12px] text-white/85 font-medium">{w.name}</span>
                {w.dangerous && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-400/20 text-rose-200/80">perigoso</span>}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${w.running ? 'bg-[#13B8A6]/12 border-[#2DD4BF]/25 text-[#7FE9DC]' : 'bg-white/[0.05] border-white/[0.1] text-white/45'}`}>{w.running ? 'rodando' : w.paused ? 'pausado' : 'parado'}</span>
                <span className="text-[10px] text-white/40">env: {w.enabledByEnv ? 'on' : 'off'} · rec: {w.recommendedLocalState}</span>
                {w.lastErrorSafeMessage && <span className="text-[10px] text-amber-100/65 truncate max-w-[200px]">erro: {w.lastErrorSafeMessage}</span>}
                {isAdmin && w.pausable && (
                  <span className="ml-auto flex items-center gap-1">
                    {w.running
                      ? <button type="button" onClick={() => act(() => localOperationsApi.pauseWorker(w.name), `${w.name} pausado.`)} className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] text-white/65 inline-flex items-center gap-1"><Pause size={11} />Pausar</button>
                      : <button type="button" disabled={!w.enabledByEnv} title={w.enabledByEnv ? '' : 'Desabilitado por env'} onClick={() => act(() => localOperationsApi.resumeWorker(w.name), `${w.name} retomado.`)} className="h-7 px-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] text-white/65 inline-flex items-center gap-1 disabled:opacity-40"><Play size={11} />Retomar</button>}
                  </span>
                )}
                {!w.pausable && <span className="ml-auto text-[10px] text-white/35">controle por env</span>}
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-white/35 mt-2">Pausar/retomar é runtime — não altera o env permanente.</p>
      </Card>
    </div>
  )
}
