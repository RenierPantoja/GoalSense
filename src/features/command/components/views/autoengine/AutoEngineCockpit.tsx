/**
 * AutoEngineCockpit — the Auto Engine ("Motor Automático") cockpit view. (B20→B21)
 * ─────────────────────────────────────────────────────────────────────────────
 * See the engine state/flags, run a manual scan, browse/inspect opportunities
 * (including blocked ones), and act on them (save / dismiss / feedback / notes /
 * promote-to-radar). Honest throughout: empty states, limitations visible, no odds,
 * no bet CTA, no Telegram, no "create alert". Opportunity ≠ alert; score ≠ probability.
 */
import { useCallback, useEffect, useState } from 'react'
import { Cpu, RefreshCw, LayoutGrid, ListChecks, ShieldAlert, PlugZap } from 'lucide-react'
import { autoEngineApi } from '@/services/autoEngineApi'
import type {
  AutoEngineStatusDto, AutoEngineRunDto, AutoOpportunityDto, AutoEngineScanRequest,
  AutoOpportunityUserStateLite, AutoOpportunityPromotionPlanDto,
} from '@/features/command/intelligence/autoEngineTypes'
import { CounterCell } from '../shared/CounterCell'
import { AutoEngineStatusPanel } from './AutoEngineStatusPanel'
import { AutoEngineScanPanel } from './AutoEngineScanPanel'
import { AutoEngineOverviewPanel } from './AutoEngineOverviewPanel'
import { AutoOpportunitiesList } from './AutoOpportunitiesList'
import { AutoOpportunityDrawer } from './AutoOpportunityDrawer'
import { AutoOpportunityPromotionPanel } from './AutoOpportunityPromotionPanel'

interface Props {
  backendOnline: boolean
  onGoToBacktest?: () => void
  onGoToAlerts?: () => void
  /** Open the radar editor pre-filled from a promotion plan (never auto-saves). */
  onPromoteToRadar?: (plan: AutoOpportunityPromotionPlanDto) => void
  /** Resolve + open a live fixture; returns whether it was resolved. */
  onOpenMatch?: (opp: AutoOpportunityDto) => boolean
}

type Segment = 'overview' | 'oportunidades' | 'bloqueadas'

const SEGMENTS: { id: Segment; label: string; icon: typeof Cpu }[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutGrid },
  { id: 'oportunidades', label: 'Oportunidades', icon: ListChecks },
  { id: 'bloqueadas', label: 'Bloqueadas', icon: ShieldAlert },
]

function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-8 text-center">
      <PlugZap size={22} className="mx-auto text-white/25 mb-3" />
      <p className="text-[14px] text-white/80 font-medium">{title}</p>
      <p className="text-[12px] text-white/45 mt-1.5 max-w-[460px] mx-auto leading-relaxed">{body}</p>
    </div>
  )
}

export function AutoEngineCockpit({ backendOnline, onGoToBacktest, onGoToAlerts, onPromoteToRadar, onOpenMatch }: Props) {
  const backendConfigured = autoEngineApi.isBackendConfigured()
  const [status, setStatus] = useState<AutoEngineStatusDto | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [runs, setRuns] = useState<AutoEngineRunDto[]>([])
  const [opportunities, setOpportunities] = useState<AutoOpportunityDto[]>([])
  const [userStates, setUserStates] = useState<Record<string, AutoOpportunityUserStateLite>>({})
  const [oppsLoading, setOppsLoading] = useState(true)
  const [segment, setSegment] = useState<Segment>('overview')
  const [drawer, setDrawer] = useState<AutoOpportunityDto | null>(null)
  const [promotion, setPromotion] = useState<AutoOpportunityPromotionPlanDto | null>(null)
  const [promotionMsg, setPromotionMsg] = useState<string | null>(null)

  const [scanRunning, setScanRunning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [lastScan, setLastScan] = useState<AutoEngineRunDto | null>(null)

  const refresh = useCallback(async () => {
    if (!backendConfigured) { setStatusLoading(false); setOppsLoading(false); return }
    setStatusLoading(true); setOppsLoading(true)
    const [s, r, search] = await Promise.all([
      autoEngineApi.getStatus(),
      autoEngineApi.listRuns(20),
      autoEngineApi.searchOpportunities({ limit: 300 }),
    ])
    if (s.ok) setStatus(s.data)
    if (r.ok && r.data) setRuns(r.data)
    if (search.ok && search.data) {
      setOpportunities(search.data.items)
      setUserStates(search.data.userStates || {})
    } else {
      // Fallback to the plain list endpoint (older backend / search unavailable).
      const o = await autoEngineApi.listOpportunities({}, 200)
      if (o.ok && o.data) setOpportunities(o.data)
    }
    setStatusLoading(false); setOppsLoading(false)
  }, [backendConfigured])

  useEffect(() => { void refresh() }, [refresh])

  const handleScan = useCallback(async (config: AutoEngineScanRequest) => {
    setScanRunning(true); setScanError(null)
    const res = await autoEngineApi.runScan(config)
    if (res.disabled) { setScanError(res.error || 'Motor desabilitado.'); setScanRunning(false); return }
    if (!res.ok || !res.data) { setScanError(res.error || 'Falha ao executar o scan.'); setScanRunning(false); return }
    setLastScan(res.data)
    if (res.data.opportunities && res.data.opportunities.length > 0) {
      setOpportunities(res.data.opportunities)
      setSegment('oportunidades')
    }
    setScanRunning(false)
    void refresh()
  }, [refresh])

  const onStateChange = useCallback((opportunityId: string, lite: AutoOpportunityUserStateLite) => {
    setUserStates(prev => ({ ...prev, [opportunityId]: lite }))
  }, [])

  const handleCreatePromotion = useCallback(async (opp: AutoOpportunityDto) => {
    setPromotionMsg(null)
    const res = await autoEngineApi.createPromotionPlan(opp.id)
    if (res.ok && res.data) {
      setPromotion(res.data)
      setDrawer(null)
      // Log the proposal as an auditable action (best-effort).
      const act = await autoEngineApi.createOpportunityAction(opp.id, { actionType: 'radar_proposal_created' })
      if (act.ok && act.data) onStateChange(opp.id, act.data.userState)
      if (!res.data.sufficient) setPromotionMsg('A oportunidade não possui evidência suficiente para gerar um radar executável.')
    } else {
      setPromotionMsg(res.error || 'Não foi possível gerar a proposta de radar.')
    }
  }, [onStateChange])

  const openEditorFromPlan = useCallback((plan: AutoOpportunityPromotionPlanDto) => {
    setPromotion(null)
    onPromoteToRadar?.(plan)
  }, [onPromoteToRadar])

  if (!backendConfigured) {
    return (
      <div className="space-y-5">
        <Header onRefresh={refresh} loading={statusLoading} />
        <EmptyNote title="Backend não conectado" body="O Motor Automático precisa do backend local do GoalSense. Configure a URL do backend para ver o estado do motor e as oportunidades. Nada é simulado aqui." />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Header onRefresh={refresh} loading={statusLoading} />

      {!backendOnline && (
        <div className="rounded-xl border border-amber-400/18 bg-amber-500/[0.05] px-4 py-3 text-[12px] text-amber-100/75">Backend offline no momento — exibindo o último estado conhecido. Reconecte para atualizar.</div>
      )}
      {status && !status.enabled && (
        <div className="rounded-xl border border-amber-400/18 bg-amber-500/[0.05] px-4 py-3 text-[12px] text-amber-100/75">Motor Automático desabilitado neste ambiente (ENABLE_AUTO_ENGINE=false). Você ainda pode ver e gerenciar oportunidades já registradas; novos scans ficam indisponíveis.</div>
      )}
      {promotionMsg && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-[12px] text-white/70">{promotionMsg}</div>
      )}

      {/* Counters strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px rounded-2xl overflow-hidden border border-white/[0.07]">
        <CounterCell label="Total" value={status?.opportunitiesTotal ?? 0} tone="white" />
        <CounterCell label="Fortes" value={status?.strong ?? 0} tone="emerald" />
        <CounterCell label="Observação" value={status?.watch ?? 0} tone="cyan" />
        <CounterCell label="Candidatas" value={status?.candidate ?? 0} tone="white" />
        <CounterCell label="Bloqueadas" value={status?.blocked ?? 0} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AutoEngineStatusPanel status={status} loading={statusLoading} />
        <AutoEngineScanPanel
          enabled={!!status?.enabled}
          writeEnabled={!!status?.writeEnabled}
          backendConfigured={backendConfigured}
          running={scanRunning}
          lastScan={lastScan}
          error={scanError}
          onScan={handleScan}
        />
      </div>

      {/* Segmented control */}
      <div className="flex gap-1.5">
        {SEGMENTS.map(s => (
          <button key={s.id} type="button" onClick={() => setSegment(s.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12.5px] font-medium transition-all ${segment === s.id ? 'text-white bg-white/[0.06] border border-white/[0.1]' : 'text-white/45 hover:text-white/70 border border-transparent hover:bg-white/[0.025]'}`}>
            <s.icon size={14} />{s.label}
            {s.id === 'bloqueadas' && (status?.blocked ?? 0) > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-200/80 font-bold">{status?.blocked}</span>}
          </button>
        ))}
      </div>

      {segment === 'overview' && <AutoEngineOverviewPanel status={status} runs={runs} onOpenOpportunity={setDrawer} />}
      {segment === 'oportunidades' && <AutoOpportunitiesList opportunities={opportunities} loading={oppsLoading} userStates={userStates} onOpen={setDrawer} />}
      {segment === 'bloqueadas' && (
        <>
          <p className="text-[12px] text-white/45 px-1">O que o motor recusou e por quê — bloqueio é evidência de inteligência conservadora, não erro.</p>
          <AutoOpportunitiesList opportunities={opportunities} loading={oppsLoading} userStates={userStates} blockedOnly onOpen={setDrawer} />
        </>
      )}

      {drawer && (
        <AutoOpportunityDrawer
          opportunity={drawer}
          onClose={() => setDrawer(null)}
          onGoToBacktest={onGoToBacktest}
          onGoToAlerts={onGoToAlerts}
          onCreatePromotion={handleCreatePromotion}
          onOpenMatch={onOpenMatch}
          onStateChange={onStateChange}
        />
      )}

      {promotion && (
        <AutoOpportunityPromotionPanel plan={promotion} onOpenEditor={openEditorFromPlan} onCancel={() => setPromotion(null)} />
      )}
    </div>
  )
}

function Header({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <header className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#13B8A6]/[0.06] via-white/[0.012] to-transparent p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl grid place-items-center bg-[#13B8A6]/[0.12] border border-[#2DD4BF]/22 shrink-0"><Cpu size={18} className="text-[#5EEAD4]" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-semibold text-white/95 tracking-tight">Motor Automático</h2>
          <p className="text-[13px] text-white/55 mt-0.5 max-w-[680px] leading-relaxed">O motor automático observa jogos ao vivo, identifica oportunidades e explica por que elas foram consideradas ou bloqueadas. Oportunidade é análise — não é alerta nem recomendação de aposta.</p>
        </div>
        <button onClick={onRefresh} type="button" disabled={loading} className="h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[12px] text-white/60 hover:text-white/90 inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 shrink-0">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />Atualizar
        </button>
      </div>
    </header>
  )
}
