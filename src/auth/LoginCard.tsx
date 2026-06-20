/**
 * LoginCard / LoginPage (Phase B27).
 * ─────────────────────────────────────────────────────────────────────────────
 * Email/password + Google (only when Firebase Auth is configured). Honest states
 * for "not configured" and "local mode". No admin/claims set client-side.
 */
import { useState } from 'react'
import { LogIn, Loader2, Lock } from 'lucide-react'
import { useAuth } from './useAuth'
import { isFirebaseAuthConfigured } from './firebaseClient'

export function LoginCard({ onDone }: { onDone?: () => void }) {
  const { loginWithEmail, loginWithGoogle, session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configured = isFirebaseAuthConfigured()

  if (!configured) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.012] p-6 max-w-[420px] mx-auto text-center">
        <Lock size={22} className="mx-auto text-white/35 mb-3" />
        <p className="text-[14px] text-white/85 font-medium">Firebase Auth não configurado neste ambiente</p>
        <p className="text-[12px] text-white/50 mt-1.5 leading-relaxed">Defina as variáveis VITE_FIREBASE_* para habilitar o login. {session.authMode === 'local' ? 'O backend está em modo local (owner).' : ''}</p>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    const r = await loginWithEmail(email, password)
    setBusy(false)
    if (r.ok) onDone?.(); else setError(r.error)
  }
  const google = async () => {
    setBusy(true); setError(null)
    const r = await loginWithGoogle()
    setBusy(false)
    if (r.ok) onDone?.(); else setError(r.error)
  }

  return (
    <div className="rounded-2xl border border-white/[0.1] bg-[#0b0f16] p-6 max-w-[420px] mx-auto">
      <div className="flex items-center gap-2 mb-4"><LogIn size={18} className="text-[#5EEAD4]" /><h2 className="text-[16px] font-semibold text-white/95">Entrar no GoalSense</h2></div>
      <form onSubmit={submit} className="space-y-3">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail" autoComplete="username" className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white/90 outline-none focus:border-[#2DD4BF]/40" />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Senha" autoComplete="current-password" className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white/90 outline-none focus:border-[#2DD4BF]/40" />
        {error && <p className="text-[12px] text-rose-200/80">{error}</p>}
        <button type="submit" disabled={busy || !email || !password} className="w-full h-10 rounded-lg text-[13px] font-semibold text-white bg-[#13B8A6] hover:bg-[#0FA594] transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2">
          {busy && <Loader2 size={14} className="animate-spin" />}Entrar
        </button>
      </form>
      <div className="flex items-center gap-2 my-3"><div className="h-px flex-1 bg-white/[0.08]" /><span className="text-[10px] text-white/35 uppercase tracking-wider">ou</span><div className="h-px flex-1 bg-white/[0.08]" /></div>
      <button type="button" onClick={google} disabled={busy} className="w-full h-10 rounded-lg text-[13px] font-medium text-white/80 border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] transition-colors disabled:opacity-40">Entrar com Google</button>
      <p className="text-[10.5px] text-white/35 mt-3 text-center">Funções (owner/admin/…) são definidas pelo dono via Firebase custom claims.</p>
    </div>
  )
}

export function LoginPage() {
  return (
    <div className="min-h-[60vh] grid place-items-center p-6">
      <LoginCard />
    </div>
  )
}
