/**
 * WizardProgressRail — minimalist segmented bar (Apple/Linear style)
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin segments fill from left as the user advances. Labels sit below each
 * segment. Forward navigation is gated: the user can click on past steps
 * freely, but cannot jump to a step that has unmet required prerequisites.
 *
 * Preserved API:
 * - generic K extends string for the step key
 * - WizardStep<K>: { key, label, valid, required }
 * - aria-current on the active step
 * - tooltip on locked steps explaining the gate
 */
export type WizardStep<K extends string> = {
  key: K
  label: string
  valid: boolean
  required: boolean
}

interface WizardProgressRailProps<K extends string> {
  steps: WizardStep<K>[]
  current: K
  onSelect: (k: K) => void
}

export function WizardProgressRail<K extends string>({ steps, current, onSelect }: WizardProgressRailProps<K>) {
  const currentIndex = Math.max(0, steps.findIndex(s => s.key === current))
  // A step is reachable if it's at or before the current step OR all required
  // steps between the current index and the target are valid.
  const isReachable = (targetIdx: number) => {
    if (targetIdx <= currentIndex) return true
    for (let i = 0; i < targetIdx; i++) {
      if (steps[i].required && !steps[i].valid) return false
    }
    return true
  }
  return (
    <nav aria-label="Etapas" className="select-none">
      {/* Segments */}
      <div className="flex items-center gap-1.5">
        {steps.map((s, i) => {
          const isActive = current === s.key
          const isComplete = i < currentIndex
          const reachable = isReachable(i)
          return (
            <button
              key={s.key}
              onClick={() => { if (reachable) onSelect(s.key) }}
              type="button"
              disabled={!reachable}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`Passo ${i + 1}: ${s.label}${reachable ? '' : ' — bloqueado'}`}
              className={`group relative flex-1 h-[3px] rounded-full transition-all duration-300 ease-out ${isActive
                ? 'bg-cyan-300/80'
                : isComplete
                  ? 'bg-white/35'
                  : reachable
                    ? 'bg-white/[0.06] hover:bg-white/[0.1]'
                    : 'bg-white/[0.04] cursor-not-allowed'}`}
            />
          )
        })}
      </div>
      {/* Labels */}
      <ol className="mt-3 flex items-start gap-1.5">
        {steps.map((s, i) => {
          const isActive = current === s.key
          const isComplete = i < currentIndex
          const reachable = isReachable(i)
          return (
            <li key={s.key} className="flex-1 min-w-0">
              <button
                onClick={() => { if (reachable) onSelect(s.key) }}
                type="button"
                disabled={!reachable}
                aria-disabled={!reachable}
                title={!reachable ? 'Conclua os passos obrigatórios para avançar' : undefined}
                className={`group block w-full text-left ${reachable ? '' : 'cursor-not-allowed'}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`tabular-nums text-[10px] font-semibold transition-colors ${isActive ? 'text-cyan-200/85' : isComplete ? 'text-white/55' : reachable ? 'text-white/30 group-hover:text-white/55' : 'text-white/20'}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {isComplete && <span className="text-[10px] text-white/45" aria-hidden>✓</span>}
                  {!reachable && !isActive && <span className="text-[10px] text-white/25" aria-hidden>·</span>}
                </div>
                <span className={`block text-[11px] mt-0.5 leading-tight truncate transition-colors ${isActive ? 'text-white/90 font-medium' : isComplete ? 'text-white/55' : reachable ? 'text-white/35 group-hover:text-white/55' : 'text-white/25'}`}>{s.label}</span>
                {s.required && !s.valid && !isActive && reachable && <span className="hidden sm:block text-[10px] text-amber-300/70 leading-tight font-medium mt-0.5">obrigatório</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
