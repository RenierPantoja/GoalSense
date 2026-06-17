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
    <div className="absolute inset-0 z-20 -m-1 rounded-[18px] border border-white/[0.09] flex flex-col animate-fadeIn shadow-[0_24px_70px_-24px_rgba(0,0,0,0.8)]" style={{ backgroundColor: '#202022' }} role="dialog" aria-label={title}>
      <div className="px-5 pt-4 pb-3 border-b border-white/[0.07] flex items-center gap-3 shrink-0">
        <div className="min-w-0">
          <h4 className="text-[14px] font-semibold tracking-[-0.01em] text-white/90 leading-tight">{title}</h4>
          {subtitle && <p className="text-[11.5px] text-white/45 mt-0.5 leading-snug">{subtitle}</p>}
        </div>
        <button onClick={onClose} type="button" aria-label="Fechar" className="ml-auto h-7 w-7 rounded-full grid place-items-center text-white/50 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white/90 transition-colors shrink-0"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto sidebar-scroll px-5 py-4 min-h-0">{children}</div>
      {footer && <div className="px-5 py-3 border-t border-white/[0.07] flex items-center gap-2 justify-end shrink-0 bg-black/15">{footer}</div>}
    </div>
  )
}
