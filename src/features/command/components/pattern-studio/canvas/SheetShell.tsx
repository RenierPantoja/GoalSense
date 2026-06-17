/**
 * SheetShell — contained command-sheet overlay used inside the Rule Studio.
 * ─────────────────────────────────────────────────────────────────────────────
 * A focused panel that covers the canvas area (not a portal) so focus stays in
 * the modal. ESC closes the sheet (handled by the parent). Premium native vibe.
 */
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function SheetShell({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  // ESC closes the sheet before the modal. Capture phase + stopPropagation so the
  // modal's own ESC handler doesn't also fire.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-20 flex flex-col animate-fadeIn" style={{ backgroundColor: '#1d1d1f' }} role="dialog" aria-label={title}>
      <div className="px-6 sm:px-8 pt-5 pb-4 border-b border-white/[0.07] flex items-center gap-3 shrink-0">
        <div className="min-w-0">
          <h4 className="text-[16px] font-semibold tracking-[-0.01em] text-white/90 leading-tight">{title}</h4>
          {subtitle && <p className="text-[12px] text-white/45 mt-0.5 leading-snug">{subtitle}</p>}
        </div>
        <button onClick={onClose} type="button" aria-label="Fechar" className="ml-auto h-8 w-8 rounded-full grid place-items-center text-white/50 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white/90 transition-colors shrink-0"><X size={15} /></button>
      </div>
      <div className="flex-1 overflow-y-auto sidebar-scroll px-6 sm:px-8 py-6 min-h-0">{children}</div>
      {footer && <div className="px-6 sm:px-8 py-3.5 border-t border-white/[0.07] flex items-center gap-2 justify-end shrink-0 bg-black/15">{footer}</div>}
    </div>
  )
}
