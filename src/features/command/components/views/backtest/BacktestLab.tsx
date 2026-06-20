/**
 * BacktestLab — Command Center "Backtest" tab.
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates radars against the history recorded by the engine (B14). Read-only:
 * never creates alerts, never sends Telegram, never alters patterns/confidence.
 * Honest states everywhere (disabled API / no backend / no snapshots / empty).
 */
import { useCallback, useEffect, useState } from 'react'
import { FlaskConical, AlertCircle } from 'lucide-react'
import type { Pattern } from '../../../types/commandTypes'
import { backtestApi } from '@/services/backtestApi'
import type { BacktestRun, BacktestSignalResult, BacktestRunConfig } from '../../../backtest/backtestTypes'
import { BacktestConfigPanel, type BacktestFormState } from './BacktestConfigPanel'
import { BacktestSummaryPanel } from './BacktestSummaryPanel'
import { BacktestCoveragePanel } from './BacktestCoveragePanel'
import { BacktestResultsTable } from './BacktestResultsTable'
import { BacktestRunsHistory } from './BacktestRunsHistory'
import { ReplayViewer } from './ReplayViewer'

const MAX_FIXTURES_CAP = 300

interface Props {
  patterns: Pattern[]
  backendOnline: boolean
}

const initialForm: BacktestFormState = {
  patternId: '', dateFrom: '', dateTo: '', leagues: '', teams: '',
  maxFixtures: 80, includeUnknown: true, evaluationMode: 'diagnostic',
}

function csv(s: string): string[] | undefined {
  const arr = s.split(',').map(x => x.trim()).filter(Boolean)
  return arr.length > 0 ? arr : undefined
}

export function BacktestLab({ patterns, backendOnline }: Props) {
  const backendConfigured = backtestApi.isBackendConfigured()
  const [form, setForm] = useState<BacktestFormState>(initialForm)
  const [running, setRunning] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentRun, setCurrentRun] = useState<BacktestRun | null>(null)
  const [results, setResults] = useState<BacktestSignalResult[]>([])
  const [runs, setRuns] = useState<BacktestRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [replayTarget, setReplayTarget] = useState<{ patternId: string; fixtureId: string } | null>(null)

  const onChange = useCallback((patch: Partial<BacktestFormState>) => setForm(prev => ({ ...prev, ...patch })), [])

  const loadRuns = useCallback(() => {
    if (!backendConfigured) return
    setRunsLoading(true)
    backtestApi.listBacktestRuns().then(res => {
      setRunsLoading(false)
      if (res.disabled) { setDisabled(true); return }
      if (res.ok && res.data) setRuns(res.data)
    })
  }, [backendConfigured])

  useEffect(() => { loadRuns() }, [loadRuns])

  const openRun = useCallback(async (runId: string) => {
    const [runRes, resultsRes] = await Promise.all([
      backtestApi.getBacktestRun(runId),
      backtestApi.getBacktestResults(runId),
    ])
    if (runRes.ok && runRes.data) setCurrentRun(runRes.data)
    if (resultsRes.ok && resultsRes.data) setResults(resultsRes.data)
    else setResults([])
  }, [])

  const onRun = useCallback(async () => {
    const pattern = patterns.find(p => p.id === form.patternId)
    if (!pattern) return
    const backendPatternId = pattern.backendId || pattern.id
    const config: BacktestRunConfig = {
      patternId: backendPatternId,
      dateFrom: form.dateFrom || null,
      dateTo: form.dateTo || null,
      leagues: csv(form.leagues),
      teams: csv(form.teams),
      maxFixtures: form.maxFixtures,
      includeUnknown: form.includeUnknown,
      evaluationMode: form.evaluationMode,
      useExistingSnapshotsOnly: true,
    }
    setRunning(true); setError(null)
    const res = await backtestApi.runBacktest(config)
    setRunning(false)
    if (res.disabled) { setDisabled(true); return }
    if (!res.ok || !res.data) { setError(res.error || 'Falha ao rodar o backtest'); return }
    setCurrentRun(res.data)
    // Pull the persisted per-fixture results (run summary doesn't embed them).
    const rr = await backtestApi.getBacktestResults(res.data.id)
    setResults(rr.ok && rr.data ? rr.data : [])
    loadRuns()
  }, [patterns, form, loadRuns])

  // ── States ──
  if (!backendConfigured) {
    return (
      <Shell>
        <EmptyNote icon title="Conecte um backend para usar o Backtest Lab"
          body="O backtest roda no motor do GoalSense. Conecte a URL do backend no painel avançado do Command Center." />
      </Shell>
    )
  }

  return (
    <Shell>
      {/* Header */}
      <header className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#13B8A6]/[0.06] via-white/[0.012] to-transparent p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl grid place-items-center bg-[#13B8A6]/[0.12] border border-[#2DD4BF]/22"><FlaskConical size={18} className="text-[#5EEAD4]" /></div>
            <div>
              <h2 className="text-[20px] font-semibold text-white/95 tracking-tight">Backtest Lab</h2>
              <p className="text-[13px] text-white/55 mt-0.5 max-w-[560px] leading-relaxed">Valide radares contra partidas registradas pelo motor. O teste depende dos snapshots gravados — não é promessa de acerto.</p>
            </div>
          </div>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full border ${disabled ? 'text-amber-200/80 bg-amber-500/[0.08] border-amber-400/20' : backendOnline ? 'text-emerald-300/85 bg-emerald-500/[0.08] border-emerald-400/20' : 'text-white/50 bg-white/[0.03] border-white/[0.08]'}`}>
            {disabled ? 'API desabilitada' : backendOnline ? 'API habilitada' : 'Backend offline'}
          </span>
        </div>
      </header>

      {disabled && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-5 py-3.5 flex items-start gap-2.5">
          <AlertCircle size={15} className="text-amber-300/80 mt-0.5 shrink-0" />
          <p className="text-[12.5px] text-amber-100/85 leading-relaxed">Backtest desabilitado neste ambiente. Habilite <code className="text-amber-200/90">ENABLE_BACKTEST_API=true</code> no backend para rodar testes pela interface. O histórico e a leitura continuam disponíveis.</p>
        </div>
      )}

      {patterns.length === 0 ? (
        <EmptyNote title="Nenhum radar configurado" body="Crie um radar na aba Padrões antes de rodar um backtest." />
      ) : (
        <BacktestConfigPanel patterns={patterns} value={form} onChange={onChange} onRun={onRun} running={running} disabled={disabled} backendConfigured={backendConfigured} maxFixturesCap={MAX_FIXTURES_CAP} />
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/15 bg-rose-500/[0.04] px-5 py-3.5 text-[12.5px] text-rose-200/80 flex items-center gap-2.5">
          <AlertCircle size={15} />{error}
        </div>
      )}

      {currentRun && (
        <>
          {currentRun.status === 'failed' && (
            <div className="rounded-xl border border-rose-500/15 bg-rose-500/[0.04] px-5 py-3.5 text-[12.5px] text-rose-200/80">
              Backtest falhou: {currentRun.error || 'erro desconhecido'}{currentRun.error === 'Pattern not found' ? ' — sincronize o radar com o backend e tente novamente.' : ''}
            </div>
          )}
          {currentRun.summary && <BacktestSummaryPanel summary={currentRun.summary} />}
          {currentRun.dataCoverage && <BacktestCoveragePanel coverage={currentRun.dataCoverage} limitations={currentRun.limitations || []} evidenceCoverage={currentRun.summary?.evidenceCoverage} />}
          {results.length > 0
            ? <BacktestResultsTable results={results} onOpenReplay={(fixtureId) => setReplayTarget({ patternId: currentRun.patternId, fixtureId })} />
            : currentRun.status === 'completed' && (
                <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.005] p-8 text-center">
                  <p className="text-[13px] text-white/70 font-medium">Sem resultados por jogo</p>
                  <p className="text-[11.5px] text-white/45 mt-1 max-w-[440px] mx-auto">Provavelmente não há snapshots históricos suficientes no escopo. Isso não é falha do radar — é cobertura de dados.</p>
                </div>
              )}
        </>
      )}

      <BacktestRunsHistory runs={runs} activeRunId={currentRun?.id || null} loading={runsLoading} onOpen={openRun} />

      {replayTarget && (
        <ReplayViewer patternId={replayTarget.patternId} fixtureId={replayTarget.fixtureId} onClose={() => setReplayTarget(null)} />
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5">{children}</div>
}

function EmptyNote({ title, body, icon }: { title: string; body: string; icon?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-10 text-center">
      {icon && <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#13B8A6]/[0.1] border border-[#2DD4BF]/20 mb-4"><FlaskConical size={20} className="text-[#5EEAD4]" /></div>}
      <p className="text-[15px] text-white/90 font-semibold">{title}</p>
      <p className="text-[12.5px] text-white/55 mt-1.5 max-w-[460px] mx-auto leading-relaxed">{body}</p>
    </div>
  )
}
