/**
 * Inspector primitives
 * ─────────────────────────────────────────────────────────────────────────────
 * Tiny presentational helpers for the RadarInspectorPanel: a key/value row,
 * a quiet badge, and a compact list of excluded entities with mini avatars.
 * Kept together because they are tightly coupled to the inspector layout and
 * never used outside it.
 */
import type { ReactNode } from 'react'
import { EntityAvatar } from '../scope/EntityAvatar'

// ─── InspectorRow (renamed Row → InspectorRow on extraction) ────────────────
interface InspectorRowProps {
  label: string
  children: ReactNode
}

export function InspectorRow({ label, children }: InspectorRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11.5px]">
      <dt className="text-white/45">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

// ─── InspectorBadge ─────────────────────────────────────────────────────────
interface InspectorBadgeProps {
  children: ReactNode
  tone: 'emerald' | 'cyan' | 'neutral'
}

export function InspectorBadge({ children, tone }: InspectorBadgeProps) {
  const cls = tone === 'emerald' ? 'bg-emerald-500/8 text-emerald-200/85 border-emerald-400/15'
    : tone === 'cyan' ? 'bg-cyan-500/8 text-cyan-200/85 border-cyan-400/15'
    : 'bg-white/[0.04] text-white/65 border-white/[0.06]'
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${cls}`}>{children}</span>
}

// ─── ExclusionAvatarRow — list of excluded entities with mini avatars ───────
// `renderItem` resolves each item into a label + (optional) avatar/match pair
// so the inspector can show real escudos when the metadata is available.
export type ExclusionRenderResult =
  | { label: string; logo?: string | null; square?: boolean; manual?: boolean }
  | { label: string; matchPair: { home: { name: string; logo: string | null }; away: { name: string; logo: string | null } }; manual?: boolean }

interface ExclusionAvatarRowProps {
  label: string
  items: string[]
  renderItem: (raw: string) => ExclusionRenderResult
  truncatePerItem?: boolean
}

export function ExclusionAvatarRow({ label, items, renderItem, truncatePerItem }: ExclusionAvatarRowProps) {
  const visible = items.slice(0, 2)
  const extra = items.length - visible.length
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-rose-200/80 font-medium">{label}</p>
      <div className="flex flex-wrap gap-1">
        {visible.map((raw, i) => {
          const r = renderItem(raw)
          return (
            <span key={`${raw}-${i}`} className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-rose-500/[0.06] border-rose-300/20 text-rose-100/85 ${truncatePerItem ? 'max-w-[180px]' : ''}`}>
              <span className="text-rose-300/70 font-semibold">−</span>
              {'matchPair' in r ? (
                <span className="flex items-center -space-x-1">
                  <EntityAvatar src={r.matchPair.home.logo} name={r.matchPair.home.name} size={12} />
                  <EntityAvatar src={r.matchPair.away.logo} name={r.matchPair.away.name} size={12} />
                </span>
              ) : (
                <EntityAvatar src={r.logo} name={r.label} size={12} square={r.square} />
              )}
              <span className={truncatePerItem ? 'truncate' : ''}>{r.label}</span>
              {r.manual && <span className="text-[9px] uppercase tracking-wider text-amber-300/75 font-medium">manual</span>}
            </span>
          )
        })}
        {extra > 0 && <span className="text-[10px] text-white/45">+{extra}</span>}
      </div>
    </div>
  )
}
