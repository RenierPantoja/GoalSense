/**
 * RoleBadge + UserSessionMenu (Phase B27).
 * ─────────────────────────────────────────────────────────────────────────────
 * Show the operating identity (role, email, auth mode) and logout. Local mode is
 * explicit. No token is ever shown.
 */
import { useState } from 'react'
import { UserCircle2, LogOut, ChevronDown, ShieldCheck } from 'lucide-react'
import { useAuth } from './useAuth'
import { ROLE_LABEL } from '@/features/command/intelligence/authTypes'

const ROLE_TONE: Record<string, string> = {
  owner: 'bg-[#13B8A6]/12 border-[#2DD4BF]/25 text-[#7FE9DC]',
  admin: 'bg-sky-500/10 border-sky-400/20 text-sky-200/85',
  operator: 'bg-white/[0.05] border-white/[0.12] text-white/80',
  analyst: 'bg-white/[0.04] border-white/[0.1] text-white/65',
  viewer: 'bg-white/[0.04] border-white/[0.08] text-white/55',
}

export function RoleBadge() {
  const { session } = useAuth()
  const tone = ROLE_TONE[session.role] || ROLE_TONE.viewer
  return <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${tone}`}><ShieldCheck size={10} />{ROLE_LABEL[session.role]}</span>
}

export function UserSessionMenu() {
  const { session, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const localMode = session.authMode === 'local' || session.authMode === 'disabled'
  const label = session.firebaseUser?.email || session.backendUser?.email || (localMode ? 'Modo local' : 'Anônimo')

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[12px] text-white/75 transition-colors">
        <UserCircle2 size={15} className="text-white/50" />
        <span className="max-w-[160px] truncate">{label}</span>
        <RoleBadge />
        <ChevronDown size={12} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[260px] rounded-xl border border-white/[0.1] bg-[#0b0f16] shadow-2xl p-3 z-[120]">
          <p className="text-[12px] text-white/85 font-medium truncate">{session.firebaseUser?.displayName || label}</p>
          <p className="text-[11px] text-white/45 truncate">{label}</p>
          <div className="flex items-center gap-2 mt-2 text-[11px] text-white/55">
            <RoleBadge />
            <span className="text-white/35">·</span>
            <span>modo: {session.authMode}</span>
          </div>
          {localMode && <p className="text-[10.5px] text-amber-100/70 mt-2 leading-relaxed">Auth desabilitado neste ambiente. Operando como owner local.</p>}
          {session.authMode === 'anonymous' && <p className="text-[10.5px] text-amber-100/70 mt-2 leading-relaxed">Sessão anônima — faça login para ações sensíveis.</p>}
          {session.firebaseUser && (
            <button type="button" onClick={() => { setOpen(false); void logout() }} className="mt-3 w-full inline-flex items-center justify-center gap-2 h-9 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[12px] text-white/70 hover:text-white/90 transition-colors">
              <LogOut size={13} />Sair
            </button>
          )}
        </div>
      )}
    </div>
  )
}
