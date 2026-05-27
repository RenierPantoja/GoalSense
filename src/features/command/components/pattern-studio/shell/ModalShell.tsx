/**
 * ModalShell — Pattern Studio modal wrapper
 * ─────────────────────────────────────────────────────────────────────────────
 * Apple-like dark glass surface rendered through a portal so it escapes any
 * stacking context (the navbar uses sticky+backdrop-blur, which would otherwise
 * trap the modal behind it). z-[1000] keeps it above the navbar (z-50) and any
 * sidebar overlay.
 *
 * Behavior preserved from the in-page version (V3.18):
 * - portal target: document.body
 * - scroll lock on body while open
 * - Escape key closes
 * - backdrop click closes
 * - role="dialog" + aria-modal + aria-labelledby
 * - responsive paddings and corner radius
 */
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalShellProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  headerExtra?: ReactNode
  children: ReactNode
  footer?: ReactNode
  maxWidth?: string
}

export function ModalShell({ open, onClose, title, subtitle, headerExtra, children, footer, maxWidth = 'max-w-3xl' }: ModalShellProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  if (typeof document === 'undefined') return null

  const titleId = `modal-title-${title.replace(/\s+/g, '-').toLowerCase()}`
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 animate-fadeIn" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" onClick={onClose} aria-hidden="true" />
      <div className={`relative w-full ${maxWidth} max-h-[calc(100vh-24px)] sm:max-h-[calc(100vh-48px)] flex flex-col rounded-[18px] sm:rounded-[20px] border border-white/[0.07] bg-[#0b0d12] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.02)_inset] overflow-hidden animate-scaleIn`}>
        <div className="px-6 sm:px-7 pt-5 pb-4 sm:pt-6 sm:pb-5 border-b border-white/[0.05] flex items-start gap-4 shrink-0">
          <div className="flex-1 min-w-0">
            <h3 id={titleId} className="text-[17px] sm:text-[19px] font-semibold text-white/95 tracking-tight">{title}</h3>
            {subtitle && <p className="text-[12px] text-white/50 mt-1 leading-relaxed">{subtitle}</p>}
            {headerExtra && <div className="mt-3">{headerExtra}</div>}
          </div>
          <button onClick={onClose} type="button" className="h-9 w-9 rounded-lg flex items-center justify-center text-white/45 hover:text-white/90 hover:bg-white/[0.04] transition-all shrink-0" aria-label="Fechar"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 sm:px-7 py-6 sidebar-scroll min-h-0">{children}</div>
        {footer && <div className="px-6 sm:px-7 py-3.5 border-t border-white/[0.05] bg-white/[0.008] flex items-center gap-2 justify-end flex-wrap shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
