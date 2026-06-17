/**
 * BlueprintSummary — Radar Blueprint 3.0 living rule (center header)
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the radar as an operational sentence with clickable blocks, so the
 * user reads the whole rule at a glance and jumps straight to any part.
 */
import { formatConditionHuman } from '../../../utils/commandFormatters'
import type { PatternCondition } from '../../../types/commandTypes'

type Step = 'identity' | 'scope' | 'conditions' | 'action' | 'confidence' | 'review'

interface BlueprintSummaryProps {
  name: string
  scopeLabel: string
  eligibility: PatternCondition[]
  signal: PatternCondition[]
  actionLabel: string
  confidence: number
  currentStep: Step
  onNavigate: (s: Step) => void
}

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'signal' | 'muted' }) {
  const cls = tone === 'signal'
    ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-100'
    : tone === 'muted'
      ? 'bg-white/[0.03] border-white/[0.07] text-white/45'
      : 'bg-white/[0.05] border-white/[0.1] text-white/85'
  return <span className={`inline-flex items-center text-[11.5px] font-medium px-2 py-0.5 rounded-md border ${cls}`}>{children}</span>
}

export function BlueprintSummary({ name, scopeLabel, eligibility, signal, actionLabel, confidence, currentStep, onNavigate }: BlueprintSummaryProps) {
  const row = (step: Step, kicker: string, content: React.ReactNode) => (
    <button
      onClick={() => onNavigate(step)}
      type="button"
      className={`w-full text-left rounded-xl px-3 py-2 transition-colors ${currentStep === step ? 'bg-white/[0.05] border border-white/[0.1]' : 'border border-transparent hover:bg-white/[0.025]'}`}
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 w-[92px] shrink-0">{kicker}</span>
        <span className="flex items-center gap-1.5 flex-wrap">{content}</span>
      </div>
    </button>
  )

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.02] to-transparent p-2 mb-5">
      {row('identity', 'Radar', <span className="text-[14px] font-semibold text-white/95">{name || <span className="text-white/35 font-normal">Sem nome</span>}</span>)}
      {row('scope', 'Monitorar', <Chip>{scopeLabel}</Chip>)}
      {row('conditions', 'Avaliar quando', eligibility.length > 0
        ? eligibility.map((c, i) => <Chip key={i}>{formatConditionHuman(c)}</Chip>)
        : <Chip tone="muted">ao vivo</Chip>)}
      {row('conditions', 'Disparar se', signal.length > 0
        ? signal.map((c, i) => <Chip key={i} tone="signal">{formatConditionHuman(c)}</Chip>)
        : <Chip tone="muted">defina um sinal real</Chip>)}
      {row('action', 'Então', <Chip>{actionLabel}</Chip>)}
      {row('confidence', 'Com rigor', <Chip>≥ {confidence}%</Chip>)}
    </div>
  )
}
