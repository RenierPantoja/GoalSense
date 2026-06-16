/**
 * ComposerNav — Radar Composer 2.0 compact lateral navigation
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the horizontal stepper. Vertical, clickable, with per-section status
 * indicators: active highlight, completion check, pending count, or error mark.
 * Any section is directly reachable (no forced back/next).
 */
export interface ComposerNavItem<K extends string> {
  key: K
  label: string
  /** Optional short summary shown under the label when not active. */
  summary?: string
  /** Numeric badge (e.g. number of conditions). */
  count?: number
  /** true → green check; false + required → amber dot. */
  complete?: boolean
  /** Hard error indicator (overrides complete). */
  error?: boolean
}

interface ComposerNavProps<K extends string> {
  items: ComposerNavItem<K>[]
  current: K
  onSelect: (k: K) => void
}

export function ComposerNav<K extends string>({ items, current, onSelect }: ComposerNavProps<K>) {
  return (
    <nav aria-label="Seções do radar" className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible sidebar-scroll">
      {items.map((it, i) => {
        const active = it.key === current
        return (
          <button
            key={it.key}
            onClick={() => onSelect(it.key)}
            type="button"
            aria-current={active ? 'true' : undefined}
            className={`group shrink-0 lg:w-full text-left rounded-xl border px-3 py-2.5 transition-colors duration-150 ${active
              ? 'border-white/[0.14] bg-white/[0.05]'
              : 'border-transparent hover:border-white/[0.08] hover:bg-white/[0.02]'}`}
          >
            <div className="flex items-center gap-2">
              <span className={`tabular-nums text-[10px] font-semibold ${active ? 'text-cyan-200/85' : 'text-white/30'}`}>{String(i + 1).padStart(2, '0')}</span>
              <span className={`text-[12.5px] font-medium leading-tight flex-1 truncate ${active ? 'text-white/95' : 'text-white/65 group-hover:text-white/85'}`}>{it.label}</span>
              {it.error ? (
                <span className="text-[11px] text-amber-300/80" aria-label="pendente">!</span>
              ) : typeof it.count === 'number' && it.count > 0 ? (
                <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md ${active ? 'bg-cyan-500/15 text-cyan-200' : 'bg-white/[0.05] text-white/45'}`}>{it.count}</span>
              ) : it.complete ? (
                <span className="text-[11px] text-emerald-400/75" aria-label="completo">✓</span>
              ) : null}
            </div>
            {!active && it.summary && (
              <p className="text-[10.5px] text-white/40 mt-0.5 leading-tight truncate pl-[22px]">{it.summary}</p>
            )}
          </button>
        )
      })}
    </nav>
  )
}
