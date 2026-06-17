/**
 * BlueprintNav — Radar Blueprint 3.0 maturity map (left column)
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces simple checks with honest operational maturity per section. Never
 * shows a green check for a default that the user has not actually shaped.
 */
export type SectionMaturity = 'empty' | 'padrao' | 'definido' | 'incompleto' | 'invalido' | 'pronto' | 'bloqueado'

export interface BlueprintNavItem<K extends string> {
  /** Unique id for the row (may differ from the step it navigates to). */
  key: string
  /** Section the item navigates to (multiple items may share a step). */
  step: K
  label: string
  summary?: string
  count?: number
  maturity: SectionMaturity
}

interface BlueprintNavProps<K extends string> {
  items: BlueprintNavItem<K>[]
  currentStep: K
  onSelect: (step: K) => void
}

const MATURITY: Record<SectionMaturity, { dot: string; tag: string; label: string }> = {
  empty: { dot: 'bg-white/20', tag: 'text-white/30', label: 'vazio' },
  padrao: { dot: 'bg-white/35', tag: 'text-white/40', label: 'padrão' },
  definido: { dot: 'bg-emerald-400/75', tag: 'text-emerald-300/70', label: 'definido' },
  incompleto: { dot: 'bg-amber-400/80', tag: 'text-amber-300/75', label: 'incompleto' },
  invalido: { dot: 'bg-rose-400/80', tag: 'text-rose-300/80', label: 'inválido' },
  pronto: { dot: 'bg-emerald-400/90', tag: 'text-emerald-300/85', label: 'pronto' },
  bloqueado: { dot: 'bg-rose-400/85', tag: 'text-rose-300/80', label: 'bloqueado' },
}

export function BlueprintNav<K extends string>({ items, currentStep, onSelect }: BlueprintNavProps<K>) {
  return (
    <nav aria-label="Maturidade do radar" className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible sidebar-scroll">
      {items.map(it => {
        const active = it.step === currentStep
        const m = MATURITY[it.maturity]
        return (
          <button
            key={it.key}
            onClick={() => onSelect(it.step)}
            type="button"
            aria-current={active ? 'true' : undefined}
            className={`group shrink-0 lg:w-full text-left rounded-xl border px-3 py-2.5 transition-colors duration-150 ${active ? 'border-white/[0.14] bg-white/[0.05]' : 'border-transparent hover:border-white/[0.08] hover:bg-white/[0.02]'}`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${m.dot}`} aria-hidden />
              <span className={`text-[12.5px] font-medium leading-tight flex-1 truncate ${active ? 'text-white/95' : 'text-white/65 group-hover:text-white/85'}`}>{it.label}</span>
              {typeof it.count === 'number' && (
                <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md ${it.count > 0 ? (active ? 'bg-cyan-500/15 text-cyan-200' : 'bg-white/[0.05] text-white/55') : 'bg-white/[0.03] text-white/30'}`}>{it.count}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 pl-[14px]">
              <span className={`text-[9.5px] font-semibold uppercase tracking-wider ${m.tag}`}>{m.label}</span>
              {it.summary && <span className="text-[10px] text-white/35 truncate">· {it.summary}</span>}
            </div>
          </button>
        )
      })}
    </nav>
  )
}
