/**
 * RuleStudioShell — Radar Blueprint 3.5 premium HUD modal chrome
 * ─────────────────────────────────────────────────────────────────────────────
 * A bespoke, futuristic console surface (not the shared ModalShell) so the
 * Rule Studio can feel like a high-end cockpit: layered radial glow, a subtle
 * tech grid, glass edges and a signature header. Replicates ModalShell's
 * behavior contract: portal to body, scroll lock, Escape to close, backdrop
 * click to close, role=dialog + aria-modal.
 */
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Radar, X } from 'lucide-react'

interface RuleStudioShellProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  statusNode?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

const SURFACE: React.CSSProperties = {
  backgroundColor: '#070a11',
  backgroundImage: [
    'radial-gradient(110% 70% at 0% 0%, rgba(34,211,238,0.10), transparent 55%)',
    'radial-gradient(90% 60% at 100% 0%, rgba(99,102,241,0.07), transparent 55%)',
    'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
  ].join(','),
  backgroundSize: '100% 100%, 100% 100%, 34px 34px, 34px 34px',
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
    // Modal-level ESC. Sheets stop propagation on capture so they close first.
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-5 animate-fadeIn" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-xl" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-full max-w-[1400px] h-[min(90vh,860px)] flex flex-col rounded-[26px] overflow-hidden animate-scaleIn border border-white/[0.08] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.85),0_0_0_1px_rgba(34,211,238,0.04)_inset]"
        style={SURFACE}
      >
        {/* Top hairline accent */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/35 to-transparent" />

        {/* Header */}
        <header className="relative shrink-0 px-7 pt-6 pb-5 border-b border-white/[0.06]">
          <div className="flex items-start gap-4">
            <div className="relative h-12 w-12 rounded-2xl grid place-items-center shrink-0 border border-cyan-400/25 bg-gradient-to-br from-cyan-500/15 to-transparent shadow-[0_0_24px_-4px_rgba(34,211,238,0.45)]">
              <Radar size={22} className="text-cyan-300" />
              <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.06]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[22px] font-semibold tracking-tight text-white/95 leading-none">{title}</h2>
                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-300/70 mt-1">Rule Studio</span>
              </div>
              {subtitle && <p className="text-[12.5px] text-white/45 mt-1.5 leading-snug">{subtitle}</p>}
              {statusNode && <div className="mt-2.5">{statusNode}</div>}
            </div>
            <button onClick={onClose} type="button" aria-label="Fechar" className="h-10 w-10 rounded-xl grid place-items-center text-white/45 border border-white/[0.07] hover:text-white/95 hover:border-white/[0.16] hover:bg-white/[0.04] transition-all shrink-0">
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>

        {/* Footer */}
        {footer && (
          <footer className="relative shrink-0 px-7 py-4 border-t border-white/[0.06] bg-[#070a11]/60 flex items-center gap-2.5 flex-wrap">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
