/**
 * Section — Pattern Studio modal sub-block
 * ─────────────────────────────────────────────────────────────────────────────
 * Tiny wrapper used inside modals to introduce a labelled block with optional
 * hint copy. Kept as a pure presentational component.
 */
import type { ReactNode } from 'react'

interface SectionProps {
  title: string
  hint?: string
  children: ReactNode
}

export function Section({ title, hint, children }: SectionProps) {
  return (
    <section className="mb-6 last:mb-0">
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2.5">{title}</h4>
      {hint && <p className="text-[11px] text-white/45 mb-3 leading-snug">{hint}</p>}
      {children}
    </section>
  )
}
