/**
 * TemplateCard — single template tile in the Pattern Studio templates grid.
 * Behaviour preserved byte-for-byte from CommandCenterPage.tsx (V3.18E).
 */
import type { Pattern, PatternTemplate } from '../../../types/commandTypes'
import { CATEGORY_LABELS, categorizeTemplate, formatConditionHuman } from '../../../utils/commandFormatters'
import { HEALTH_TONE, type PatternHealth } from '../../../intelligence/patternHealthEngine'
import { PremiumToggle } from '../../pattern-studio/shell/PremiumToggle'

interface TemplateCardProps {
  template: PatternTemplate
  existing: Pattern | null
  isActive: boolean
  health?: PatternHealth
  onToggle: () => void
  onConfigure: () => void
  /**
   * Optional: fired on hover/focus of the card or the configure button so the
   * caller can prefetch the TemplateConfigModal chunk (V4.4). Pure side-effect,
   * safe to be a no-op when not provided.
   */
  onPrefetch?: () => void
}

export function TemplateCard({ template, existing, isActive, health, onToggle, onConfigure, onPrefetch }: TemplateCardProps) {
  const cat = categorizeTemplate(template)
  const sevDot = template.severity === 'critical' ? 'bg-rose-300/85' : template.severity === 'attention' ? 'bg-amber-300/85' : 'bg-cyan-300/85'
  const sevLabel = template.severity === 'critical' ? 'Crítico' : template.severity === 'attention' ? 'Atenção' : 'Info'
  const healthTone = health ? HEALTH_TONE[health.status] : null
  // Border tone: rosé/amber for issues, soft emerald for healthy, neutral otherwise
  const borderTone = health
    ? (health.status === 'noisy' || health.status === 'underperforming' || health.status === 'needs_review' ? 'border-amber-300/25'
      : health.status === 'healthy' ? 'border-emerald-300/25'
      : 'border-white/[0.07]')
    : 'border-white/[0.07]'
  return (
    <div onMouseEnter={onPrefetch} className={`group rounded-2xl border bg-white/[0.012] p-4 transition-colors duration-200 hover:border-white/[0.14] ${borderTone}`}>
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5 text-[10px]">
            <span className="flex items-center gap-1.5 text-white/55">
              <span className={`h-1.5 w-1.5 rounded-full ${sevDot}`} />
              <span className="font-medium">{sevLabel}</span>
            </span>
            <span className="text-white/20">·</span>
            <span className="text-white/45 font-medium">{CATEGORY_LABELS[cat]}</span>
            {health && healthTone ? (
              <span className={`ml-auto inline-flex items-center gap-1 text-[9.5px] font-medium ${healthTone.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${healthTone.dot}`} />
                {health.label}
              </span>
            ) : isActive ? (
              <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-emerald-300/80">Ativo</span>
            ) : existing && existing.status === 'paused' ? (
              <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-white/45">Pausado</span>
            ) : null}
          </div>
          <h4 className="text-[13.5px] font-semibold text-white/95 leading-tight tracking-tight">{template.name}</h4>
        </div>
        <PremiumToggle checked={isActive} onChange={onToggle} ariaLabel={`Ativar template ${template.name}`} size="sm" />
      </div>
      <p className="text-[11.5px] text-white/55 leading-snug mb-3 line-clamp-2">{template.description}</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {template.conditions.slice(0, 3).map((c, i) => (
          <span key={i} className="text-[10px] text-white/65 bg-white/[0.025] px-2 py-0.5 rounded border border-white/[0.06]">{formatConditionHuman(c)}</span>
        ))}
        {template.conditions.length > 3 && <span className="text-[10px] text-white/35">+{template.conditions.length - 3}</span>}
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.04]">
        <span className="text-[10.5px] text-white/45">Confiança sugerida: <span className="text-white/75 font-semibold">{template.defaultConfidence}</span></span>
        <button onClick={onConfigure} onFocus={onPrefetch} type="button" className="text-[11px] font-medium text-white/85 hover:text-white transition-colors">Configurar →</button>
      </div>
    </div>
  )
}
