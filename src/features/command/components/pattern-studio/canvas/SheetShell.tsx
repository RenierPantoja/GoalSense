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
    <div className="absolute inset-0 z-20 -m-1 rounded-2xl border border-white/[0.1] bg-[#0c0f15]/97 backdrop-blur-md flex flex-col animate-fadeIn shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]" role="dialog" aria-label={title}>
      <div className="px-5 pt-4 pb-3 border-b border-white/[0.06] flex items-center gap-3 shrink-0">
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold text-white/95 leading-tight">{title}</h4>
          {subtitle && <p className="text-[11px] text-white/45 mt-0.5 leading-snug">{subtitle}</p>}
        </div>
        <button onClick={onClose} type="button" aria-label="Fechar" className="ml-auto h-7 w-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/90 hover:bg-white/[0.05] transition-colors shrink-0"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto sidebar-scroll px-5 py-4 min-h-0">{children}</div>
      {footer && <div className="px-5 py-3 border-t border-white/[0.06] flex items-center gap-2 justify-end shrink-0 bg-white/[0.008]">{footer}</div>}
    </div>
  )
}
