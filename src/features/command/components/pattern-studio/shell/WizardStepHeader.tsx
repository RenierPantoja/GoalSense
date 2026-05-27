/**
 * WizardStepHeader — editorial title block (Apple Settings vibe)
 * ─────────────────────────────────────────────────────────────────────────────
 * Small uppercase kicker, generous title, soft description. Accepts a custom
 * `kicker` to override the default "Passo X de Y" copy.
 */
interface WizardStepHeaderProps {
  index: number
  total: number
  title: string
  description?: string
  kicker?: string
}

export function WizardStepHeader({ index, total, title, description, kicker }: WizardStepHeaderProps) {
  return (
    <header className="mb-7">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40 block mb-2">
        {kicker || `Passo ${index} de ${total}`}
      </span>
      <h3 className="text-[22px] sm:text-[24px] font-semibold text-white/95 tracking-tight leading-[1.15]">{title}</h3>
      {description && <p className="text-[13px] text-white/55 leading-relaxed mt-2 max-w-[600px]">{description}</p>}
    </header>
  )
}
