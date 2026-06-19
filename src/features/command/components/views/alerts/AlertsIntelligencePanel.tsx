/**
 * AlertsIntelligencePanel — Alertas 2.0 shell (B16 + B17 + B18).
 * ─────────────────────────────────────────────────────────────────────────────
 * Segmented control: Sinais · Qualidade dos padrões · Aprendizados.
 * Sinais uses the server-side ServerAlertList as the primary source (when a
 * backend is configured), with the preserved local AlertsView as an honest
 * fallback / "Sinais locais" view. Owns the Signal Ledger drawer and the
 * cross-link that opens a filtered list from related alerts / learning events.
 * Read-only: no alerts created, no Telegram, no pattern/confidence changes.
 */
import { useCallback, useState } from 'react'
import { Zap, BarChart3, GraduationCap, Server, HardDrive } from 'lucide-react'
import { AlertsView, type AlertsViewProps } from './AlertsView'
import { AlertSignalDrawer } from './intelligence/AlertSignalDrawer'
import { AlertOverviewStrip } from './intelligence/AlertOverviewStrip'
import { PatternSignalQualityView } from './intelligence/PatternSignalQualityView'
import { AlertLearningFeed } from './intelligence/AlertLearningFeed'
import { ServerAlertList } from './intelligence/ServerAlertList'
import { isAlertIntelligenceConfigured } from '@/services/alertIntelligenceApi'
import type { AlertIntelFilters } from '../../../intelligence/alertIntelligenceTypes'

type Segment = 'sinais' | 'qualidade' | 'aprendizados'
type ListMode = 'server' | 'local'

export interface AlertsIntelligencePanelProps extends AlertsViewProps {
  onGoToBacktest?: () => void
}

export interface DrawerTarget {
  alertId: string | null
  patternName: string
  matchLabel: string
  minute: number | null
  score: { home: number; away: number }
  confidence: number
  status: string
}

const SEGMENTS: { id: Segment; label: string; icon: typeof Zap }[] = [
  { id: 'sinais', label: 'Sinais', icon: Zap },
  { id: 'qualidade', label: 'Qualidade dos padrões', icon: BarChart3 },
  { id: 'aprendizados', label: 'Aprendizados', icon: GraduationCap },
]

export function AlertsIntelligencePanel(props: AlertsIntelligencePanelProps) {
  const { onGoToBacktest, ...alertsViewProps } = props
  const backendConfigured = isAlertIntelligenceConfigured()
  const [segment, setSegment] = useState<Segment>('sinais')
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null)
  const [listMode, setListMode] = useState<ListMode>(backendConfigured ? 'server' : 'local')
  const [filters, setFilters] = useState<AlertIntelFilters>({})

  const openDrawer = useCallback((alertId: string | null, headline: Omit<DrawerTarget, 'alertId'>) => setDrawer({ alertId, ...headline }), [])
  const changeFilters = useCallback((patch: Partial<AlertIntelFilters>) => setFilters(prev => ({ ...prev, ...patch })), [])
  const clearFilters = useCallback(() => setFilters({}), [])

  /** Cross-link: open the server list pre-filtered (from related alerts / learning). */
  const openFilteredList = useCallback((next: AlertIntelFilters) => {
    setFilters(next); setListMode('server'); setSegment('sinais'); setDrawer(null)
  }, [])

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#13B8A6]/[0.05] via-white/[0.012] to-transparent p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl grid place-items-center bg-[#13B8A6]/[0.12] border border-[#2DD4BF]/22"><Zap size={18} className="text-[#5EEAD4]" /></div>
          <div>
            <h2 className="text-[20px] font-semibold text-white/95 tracking-tight">Alertas</h2>
            <p className="text-[13px] text-white/55 mt-0.5 max-w-[640px] leading-relaxed">Acompanhe sinais emitidos, resultados, falhas e aprendizados do motor. Abra qualquer alerta para ver o Signal Ledger completo.</p>
          </div>
        </div>
        <div className="flex items-center gap-1 mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1 w-fit">
          {SEGMENTS.map(s => (
            <button key={s.id} onClick={() => setSegment(s.id)} type="button" className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium transition-colors ${segment === s.id ? 'bg-white/[0.08] text-white/95' : 'text-white/50 hover:text-white/80'}`}>
              <s.icon size={13} />{s.label}
            </button>
          ))}
        </div>
      </header>

      {segment === 'sinais' && (
        <>
          <AlertOverviewStrip />
          {backendConfigured && (
            <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1 w-fit">
              <button onClick={() => setListMode('server')} type="button" className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium transition-colors ${listMode === 'server' ? 'bg-white/[0.08] text-white/95' : 'text-white/50 hover:text-white/80'}`}><Server size={12} />Server-side</button>
              <button onClick={() => setListMode('local')} type="button" className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium transition-colors ${listMode === 'local' ? 'bg-white/[0.08] text-white/95' : 'text-white/50 hover:text-white/80'}`}><HardDrive size={12} />Sinais locais</button>
            </div>
          )}
          {backendConfigured && listMode === 'server' ? (
            <ServerAlertList filters={filters} onFiltersChange={changeFilters} onClearFilters={clearFilters} onOpenAnalysis={(alertId, headline) => openDrawer(alertId, headline)} />
          ) : (
            <>
              {backendConfigured && <p className="text-[11px] text-white/45">Exibindo filtros locais com base nos alertas carregados.</p>}
              <AlertsView {...alertsViewProps} onOpenAnalysis={(alertId, headline) => openDrawer(alertId, headline)} />
            </>
          )}
        </>
      )}
      {segment === 'qualidade' && <PatternSignalQualityView onOpenInList={(patternId) => openFilteredList({ patternId })} />}
      {segment === 'aprendizados' && <AlertLearningFeed onGoToBacktest={onGoToBacktest} onOpenFilteredList={openFilteredList} />}

      {drawer && (
        <AlertSignalDrawer
          alertId={drawer.alertId}
          headline={{ patternName: drawer.patternName, matchLabel: drawer.matchLabel, minute: drawer.minute, score: drawer.score, confidence: drawer.confidence, status: drawer.status }}
          onClose={() => setDrawer(null)}
          onGoToBacktest={onGoToBacktest ? () => { setDrawer(null); onGoToBacktest() } : undefined}
          onOpenFilteredList={openFilteredList}
        />
      )}
    </div>
  )
}
