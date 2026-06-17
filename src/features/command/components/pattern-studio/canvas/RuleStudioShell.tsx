/**
 * RuleStudioShell — Radar Blueprint 3.6 (Apple-native modal chrome)
 * ─────────────────────────────────────────────────────────────────────────────
 * Calm, refined macOS/iOS-settings surface: a soft material panel, generous
 * spacing, hairline separators and a quiet header — no grid, no glow, no neon.
 * Replicates ModalShell's behavior: portal, scroll lock, Escape, backdrop click.
 */
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface RuleStudioShellProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  statusNode?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

export function RuleStudioShell({ open, onClose, title, subtitle, statusNode, children, footer }: RuleStudioShellProps) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 animate-fadeIn" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-full max-w-[1460px] h-[min(91vh,900px)] flex flex-col rounded-[22px] overflow-hidden animate-scaleIn border border-white/[0.09] shadow-[0_40px_110px_-28px_rgba(0,0,0,0.85)]"
        style={{ backgroundColor: '#1b1b1d', backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0) 160px)' }}
      >
        {/* Header */}
        <header className="shrink-0 px-7 pt-6 pb-5 border-b border-white/[0.07]">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-white/92 leading-none">{title}</h2>
              {subtitle && <p className="text-[13px] text-white/45 mt-1.5 leading-snug">{subtitle}</p>}
              {statusNode && <div className="mt-3">{statusNode}</div>}
            </div>
            <button onClick={onClose} type="button" aria-label="Fechar" className="h-8 w-8 rounded-full grid place-items-center text-white/55 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white/90 transition-colors shrink-0">
              <X size={15} />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>

        {/* Footer */}
        {footer && (
          <footer className="shrink-0 px-7 py-4 border-t border-white/[0.07] bg-black/15 flex items-center gap-2.5 flex-wrap">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
