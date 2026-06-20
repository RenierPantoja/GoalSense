/**
 * Standardized auth/error states (Phase B27).
 * ─────────────────────────────────────────────────────────────────────────────
 * Honest, professional 401/403/429/env states. No stack traces, no internal leaks.
 */
import { ShieldAlert, Lock, Clock, LogIn, ServerCrash } from 'lucide-react'
import type { ApiErrorReason } from '@/services/apiClient'

function Shell({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.012] p-6 text-center max-w-[460px] mx-auto">
      <div className="mx-auto mb-3 text-white/35">{icon}</div>
      <p className="text-[14px] text-white/85 font-medium">{title}</p>
      <p className="text-[12px] text-white/50 mt-1.5 leading-relaxed">{body}</p>
    </div>
  )
}

export function PermissionDeniedState({ role }: { role?: string }) {
  return <Shell icon={<ShieldAlert size={22} className="mx-auto" />} title="Sua função atual não permite esta ação" body={`Função atual: ${role || '—'}. Peça a um admin/owner o acesso necessário.`} />
}
export function ApiAccessError({ reason, message }: { reason: ApiErrorReason; message?: string | null }) {
  if (reason === 'unauthorized') return <Shell icon={<LogIn size={22} className="mx-auto" />} title="Faça login para executar esta ação" body="Sua sessão não está autenticada. Entre com sua conta para continuar." />
  if (reason === 'forbidden') return <PermissionDeniedState />
  if (reason === 'env_gate') return <Shell icon={<Lock size={22} className="mx-auto" />} title="Recurso protegido por flag de ambiente" body={message || 'Este recurso está desabilitado pela configuração do backend.'} />
  if (reason === 'rate_limited') return <RateLimitState />
  if (reason === 'no_backend') return <Shell icon={<ServerCrash size={22} className="mx-auto" />} title="Backend não conectado" body="Configure a URL do backend para usar este recurso." />
  return <Shell icon={<ServerCrash size={22} className="mx-auto" />} title="Não foi possível concluir" body={message || 'Tente novamente em instantes.'} />
}
export function RateLimitState() {
  return <Shell icon={<Clock size={22} className="mx-auto" />} title="Muitas solicitações" body="Você atingiu o limite temporário. Aguarde alguns segundos e tente novamente." />
}

/** Inline (non-card) denial note for buttons/toolbars. */
export function InlineDenied({ message }: { message: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-amber-100/75 bg-amber-500/[0.05] border border-amber-400/15 rounded-lg px-2.5 py-1.5">
      <ShieldAlert size={13} className="text-amber-300/80" />{message}
    </span>
  )
}
