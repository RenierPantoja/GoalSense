import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Play, RefreshCw, RotateCcw, SearchCheck, Square, TimerReset } from 'lucide-react'
import { localValidationApi } from '@/services/localValidationApi'
import type { EspnLiveFirstWorkerStatusDto, EspnLiveFirstWorkerRunDto } from '@/features/matchIntelligence/espnLiveFirstWorkerTypes'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.12em] text-white/30">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-semibold text-white/75">{value}</p>
    </div>
  )
}

function latestRunnableRun(runs: EspnLiveFirstWorkerRunDto[]): EspnLiveFirstWorkerRunDto | null {
  return runs.find(run => run.status === 'running' || run.status === 'paused' || run.status === 'recovered') ?? runs[0] ?? null
}

async function fetchControlPlaneStatus(): Promise<EspnLiveFirstWorkerStatusDto | null> {
  const response = await fetch('/api/worker-control-plane/status', { cache: 'no-store' }).catch(() => null)
  if (!response?.ok) return null
  const body = await response.json().catch(() => null)
  return body?.data ?? null
}

export function EspnLiveFirstWorkerPanel({ isAdmin }: { isAdmin: boolean }) {
  const [status, setStatus] = useState<EspnLiveFirstWorkerStatusDto | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [disabled, setDisabled] = useState(false)

  const load = useCallback(async () => {
    const response = await localValidationApi.getEspnLiveFirstWorkerStatus()
    if (response.reason === 'env_gate' || response.status === 403) { setDisabled(true); return }
    if (response.ok && response.data) setStatus(response.data)
    else if (response.reason === 'no_backend' || response.reason === 'network') {
      const controlPlaneStatus = await fetchControlPlaneStatus()
      if (controlPlaneStatus) setStatus(controlPlaneStatus)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const selectedRun = useMemo(() => latestRunnableRun(status?.runs ?? []), [status])
  const readOnlyControlPlane = !!(status?.readOnly || status?.runtime?.readOnlyControlPlane)
  const freshnessStatus = status?.freshness?.freshnessStatus ?? 'unknown'
  const dataState = status?.controlPlaneDataState ?? freshnessStatus
  const stateMessage = dataState === 'missing_firebase_env'
    ? `Configuração Firebase pública ausente no Vercel: ${(status?.firebaseEnv?.requiredMissing ?? []).join(', ') || 'VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_API_KEY'}.`
    : dataState === 'firebase_permission_denied'
      ? 'Firebase respondeu permission-denied. Verifique rules do control plane.'
      : dataState === 'empty_firestore'
        ? 'Firebase conectado, mas nenhuma sessão/report foi encontrado.'
        : dataState === 'stale' || dataState === 'slightly_stale'
          ? (status?.freshness?.staleReasons[0] ?? 'Último worker/report está antigo.')
          : dataState === 'fresh'
            ? 'Control Plane atualizado.'
            : status?.freshness?.staleReasons[0] ?? null
  const runtimeLabel = status?.runtime?.environment === 'vercel_production'
    ? 'Vercel Control Plane'
    : status?.runtime?.environment === 'vercel_preview'
      ? 'Vercel Preview'
      : status?.runtime?.environment === 'local_worker'
        ? 'Local Worker'
        : status?.runtime?.environment === 'local_dev'
          ? 'Local Dev'
          : 'Unknown'

  const runAction = async (name: string, action: () => Promise<{ ok?: boolean; data?: unknown; error?: string | null } | void>) => {
    setBusy(name)
    const result = await action()
    setBusy(null)
    setMsg(!result || result.ok ? `${name} concluído.` : result.error || `${name} falhou.`)
    await load()
  }

  if (disabled) return null

  const buttonClass = 'h-8 px-2 rounded-lg border border-white/[0.09] bg-white/[0.03] hover:bg-white/[0.06] text-[11px] text-white/70 inline-flex items-center gap-1 disabled:opacity-45 disabled:cursor-not-allowed'

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity size={14} className="text-[#7FE9DC]" />
        <h4 className="flex-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">ESPN Live-First worker persistente</h4>
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${readOnlyControlPlane ? 'border-cyan-400/20 bg-cyan-500/10 text-cyan-200/80' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200/80'}`}>
          {runtimeLabel}
        </span>
        <button type="button" onClick={() => void runAction('refresh', load)} disabled={busy !== null} className={buttonClass} title="Refresh status">
          <RefreshCw size={12} />Refresh
        </button>
      </div>

      {msg && <p className="mb-2 text-[11px] text-white/60">{msg}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="status" value={selectedRun?.status ?? 'stopped'} />
        <Stat label="sessões" value={status?.sessionsRunning ?? 0} />
        <Stat label="fixtures" value={status?.fixturesActive ?? 0} />
        <Stat label="snapshots" value={selectedRun?.snapshotsCaptured ?? 0} />
        <Stat label="heartbeat" value={selectedRun?.heartbeatAt ? new Date(selectedRun.heartbeatAt).toLocaleTimeString() : 'n/a'} />
        <Stat label="freshness" value={freshnessStatus} />
        <Stat label="rechecks" value={selectedRun?.rechecksTriggered ?? 0} />
        <Stat label="órfãs" value={status?.orphanSessions ?? 0} />
        <Stat label="post-match pend." value={status?.postMatchPending ?? 0} />
      </div>

      {stateMessage && dataState !== 'fresh' && (
        <p className="mt-3 rounded-lg border border-amber-400/15 bg-amber-500/[0.04] px-3 py-2 text-[10.5px] text-amber-100/70">
          {dataState}: {stateMessage}
        </p>
      )}

      {isAdmin && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled={busy !== null || readOnlyControlPlane} onClick={() => void runAction('start', () => localValidationApi.startEspnLiveFirstWorker({ maxDurationMinutes: 180, maxFixtures: 5, pollIntervalSeconds: 45 }))}>
            <Play size={12} />Start
          </button>
          <button type="button" className={buttonClass} disabled={busy !== null || !selectedRun || readOnlyControlPlane} onClick={() => selectedRun && void runAction('stop', () => localValidationApi.stopEspnLiveFirstWorker(selectedRun.id))}>
            <Square size={12} />Stop
          </button>
          <button type="button" className={buttonClass} disabled={busy !== null || !selectedRun || readOnlyControlPlane} onClick={() => selectedRun && void runAction('resume', () => localValidationApi.resumeEspnLiveFirstWorker(selectedRun.id))}>
            <RotateCcw size={12} />Resume
          </button>
          <button type="button" className={buttonClass} disabled={busy !== null || readOnlyControlPlane} onClick={() => void runAction('recovery', localValidationApi.runEspnLiveFirstRecoverySweep)}>
            <TimerReset size={12} />Recovery
          </button>
          <button type="button" className={buttonClass} disabled={busy !== null || readOnlyControlPlane} onClick={() => void runAction('post-match', localValidationApi.runEspnLiveFirstPostMatchSweeper)}>
            <SearchCheck size={12} />Post-match
          </button>
        </div>
      )}

      {readOnlyControlPlane && (
        <p className="mt-3 rounded-lg border border-cyan-400/15 bg-cyan-500/[0.04] px-3 py-2 text-[10.5px] text-cyan-100/70">
          Control plane hospedado: comandos longos ficam bloqueados aqui. Use o CLI local/dedicado para start, recovery e post-match sweeper.
        </p>
      )}

      {selectedRun && (
        <div className="mt-3 space-y-1 text-[10.5px] text-white/50">
          <p>run {selectedRun.id} · fixtures {selectedRun.fixtureIds.length} · leases {status?.leases.length ?? 0} · completed {status?.completedFixtures ?? 0}</p>
          {selectedRun.limitations.slice(0, 2).map((item, index) => <p key={index} className="text-amber-100/65">{item}</p>)}
        </div>
      )}
      <p className="mt-2 text-[10px] text-white/30">Local-only · ESPN live data · sem odds · sem Telegram · sem auto-bet · enforce off · unknown/not_evaluable não é falha.</p>
    </div>
  )
}
