/**
 * PermissionGate / DangerousActionGuard / AdminOnlyBadge (Phase B26).
 * ─────────────────────────────────────────────────────────────────────────────
 * Honest UI guardrails. They explain WHY something is blocked (permission, admin,
 * env flag, or local mode) without hiding the feature entirely. They never grant
 * access — the backend is the authority.
 */
import { ShieldAlert, Lock } from 'lucide-react'
import type { AuthContextDto, AuthPermission, AuthRole } from '@/features/command/intelligence/authTypes'

const ROLE_RANK: Record<AuthRole, number> = { viewer: 0, analyst: 1, operator: 2, admin: 3, owner: 4 }

export function hasPermission(ctx: AuthContextDto | null, perm: AuthPermission): boolean {
  return !!ctx?.permissions.includes(perm)
}
export function isAdminRole(ctx: AuthContextDto | null): boolean {
  return ctx?.role === 'admin' || ctx?.role === 'owner'
}

interface GateProps {
  ctx: AuthContextDto | null
  permission: AuthPermission
  /** When false, render children read-only (disabled) instead of replacing them. */
  hideWhenDenied?: boolean
  children: React.ReactNode
  fallback?: React.ReactNode
}

/** Renders children only when the user has the permission; otherwise an honest note. */
export function PermissionGate({ ctx, permission, hideWhenDenied, children, fallback }: GateProps) {
  if (hasPermission(ctx, permission)) return <>{children}</>
  if (hideWhenDenied) return null
  return <>{fallback ?? <DeniedNote message="Você não tem permissão para esta ação." />}</>
}

interface DangerousProps {
  ctx: AuthContextDto | null
  permission: AuthPermission
  /** Extra env-flag requirement (e.g. ENABLE_AUTO_ALERT_CREATE). */
  envEnabled?: boolean
  envName?: string
  requireAdmin?: boolean
  children: (allowed: boolean, reason: string | null) => React.ReactNode
}

/** Computes whether a dangerous action is allowed and passes the reason to children. */
export function DangerousActionGuard({ ctx, permission, envEnabled = true, envName, requireAdmin, children }: DangerousProps) {
  let allowed = true
  let reason: string | null = null
  if (!envEnabled) { allowed = false; reason = `Recurso protegido por flag de ambiente${envName ? ` (${envName})` : ''}.` }
  else if (!hasPermission(ctx, permission)) { allowed = false; reason = 'Você não tem permissão para esta ação.' }
  else if ((requireAdmin ?? ctx?.requireAdminForDangerous) && !isAdminRole(ctx)) { allowed = false; reason = 'Ação disponível apenas para admin/owner.' }
  return <>{children(allowed, reason)}</>
}

export function AdminOnlyBadge({ ctx }: { ctx: AuthContextDto | null }) {
  if (isAdminRole(ctx)) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-amber-500/8 border-amber-400/15 text-amber-100/75">
      <Lock size={10} />Modo protegido
    </span>
  )
}

export function DeniedNote({ message }: { message: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-[11.5px] text-amber-100/75 bg-amber-500/[0.05] border border-amber-400/15 rounded-lg px-2.5 py-1.5">
      <ShieldAlert size={13} className="text-amber-300/80" />{message}
    </div>
  )
}

export function LocalModeNote({ ctx }: { ctx: AuthContextDto | null }) {
  if (!ctx || ctx.authEnabled) return null
  return <span className="text-[10px] text-white/40">Auth desabilitado em modo local — acesso owner.</span>
}

export { ROLE_RANK }
