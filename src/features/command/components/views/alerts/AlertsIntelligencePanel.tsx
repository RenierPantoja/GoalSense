/**
 * AlertsIntelligencePanel — Alertas 2.0 shell.
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps the (preserved) AlertsView with a premium segmented control:
 *   Sinais · Qualidade dos padrões · Aprendizados
 * and owns the Signal Ledger drawer. Read-only intelligence: no alerts created,
 * no Telegram, no pattern/confidence changes.
 */
import { useState } from 'react'
import { Zap, BarChart3, GraduationCap } from 'lucide-react'
import { AlertsView, type AlertsViewProps } from './AlertsView'
import { AlertSignalDrawer } from './intelligence/AlertSignalDrawer'
import { PatternSignalQualityView } from './intelligence/PatternSignalQualityView'
import { AlertLearningFeed } from './intelligence/AlertLearningFeed'

type Segment = 'sinais' | 'qualidade' | 'aprendizados'

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
  const [segment, setSegment] = useState<Segment>('sinais')
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null)

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#13B8A6]/[0.05] via-white/[0.012] to-transparent p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl grid place-items-center bg-[#13B8A6]/[0.12] border border-[#2DD4BF]/22"><Zap size={18} className="text-[#5EEAD4]" /></div>
          <div>
            <h2 className="text-[20px] font-semibold text-white/95 tracking-tight">Alertas</h2>
            <p className="text-[13px] text-white/55 mt-0.5 max-w-[640px] leading-relaxed">Acompanhe sinais emitidos, resultados, falhas e aprendizados do motor. Abra qualquer alerta para ver o Signal Ledger completo.</p>
          </div>
        </div>
        {/* Segmented control */}
        <div className="flex items-center gap-1 mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1 w-fit">
          {SEGMENTS.map(s => (
            <button key={s.id} onClick={() => setSegment(s.id)} type="button" className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium transition-colors ${segment === s.id ? 'bg-white/[0.08] text-white/95' : 'text-white/50 hover:text-white/80'}`}>
              <s.icon size={13} />{s.label}
            </button>
          ))}
        </div>
      </header>

      {segment === 'sinais' && (
        <AlertsView {...alertsViewProps} onOpenAnalysis={(alertId, headline) => setDrawer({ alertId, ...headline })} />
      )}
      {segment === 'qualidade' && <PatternSignalQualityView />}
      {segment === 'aprendizados' && <AlertLearningFeed />}

      {drawer && (
        <AlertSignalDrawer
          alertId={drawer.alertId}
          headline={{ patternName: drawer.patternName, matchLabel: drawer.matchLabel, minute: drawer.minute, score: drawer.score, confidence: drawer.confidence, status: drawer.status }}
          onClose={() => setDrawer(null)}
          onGoToBacktest={onGoToBacktest ? () => { setDrawer(null); onGoToBacktest() } : undefined}
        />
      )}
    </div>
  )
}
