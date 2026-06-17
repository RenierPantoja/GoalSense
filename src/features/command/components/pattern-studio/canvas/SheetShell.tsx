/**
 * SheetShell — Radar Blueprint 4.2 premium command sheet
 * ─────────────────────────────────────────────────────────────────────────────
 * A focused, luxurious overlay that fills the modal body: a hero header with a
 * gradient icon tile + accent glow, a generous content area and an optional
 * footer. ESC closes the sheet before the modal. Material matches the board.
 */
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface SheetShellProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  accentFrom?: string
  accentTo?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function SheetShell({ title, subtitle, icon, accentFrom = '#34E3CB', accentTo = '#0E9E8C', onClose, children, footer }: SheetShellProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-20 flex flex-col animate-fadeIn" style={{ backgroundColor: '#1c1c1f', backgroundImage: `radial-gradient(80% 50% at 0% 0%, ${accentFrom}14, transparent 60%)` }} role="dialog" aria-label={title}>
      <div className="px-7 sm:px-9 pt-6 pb-5 border-b border-white/[0.07] flex items-center gap-4 shrink-0">
        {icon && (
          <span className="relative h-11 w-11 rounded-[12px] grid place-items-center text-white shrink-0 ring-1 ring-inset ring-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_12px_-2px_rgba(0,0,0,0.5)]" style={{ backgroundImage: `linear-gradient(155deg, ${accentFrom}, ${accentTo})` }}>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h4 className="text-[18px] font-semibold tracking-[-0.015em] text-white/92 leading-tight">{title}</h4>
          {subtitle && <p className="text-[12.5px] text-white/45 mt-0.5 leading-snug">{subtitle}</p>}
        </div>
        <button onClick={onClose} type="button" aria-label="Fechar" className="ml-auto h-8 w-8 rounded-full grid place-items-center text-white/50 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white/90 transition-colors shrink-0"><X size={15} /></button>
      </div>
      <div className="flex-1 overflow-y-auto sidebar-scroll px-7 sm:px-9 py-7 min-h-0">{children}</div>
      {footer && <div className="px-7 sm:px-9 py-4 border-t border-white/[0.07] flex items-center gap-2.5 justify-end shrink-0 bg-black/15">{footer}</div>}
    </div>
  )
}
