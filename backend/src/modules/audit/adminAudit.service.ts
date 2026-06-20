/**
 * Admin audit trail — service (Phase B26).
 * ─────────────────────────────────────────────────────────────────────────────
 * Best-effort, never-throws persistence of sensitive actions + denials. Never
 * stores tokens/secrets. Firebase persists; Noop accepts without storing.
 */
import { createRepositories } from '../../repositories/index.js'
import type { AdminAuditEntry, AdminAuditAction, AdminAuditResult } from './adminAudit.types.js'
import type { AuthContext } from '../auth/auth.types.js'

function auditId(): string { return `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` }

/** Shallow-sanitize metadata: drop anything that looks like a secret/token. */
function sanitize(meta: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!meta) return null
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (/token|secret|password|authorization|cookie|key/i.test(k)) continue
    if (typeof v === 'string' && v.length > 500) { out[k] = v.slice(0, 500); continue }
    out[k] = v
  }
  return out
}

export interface RecordAuditInput {
  auth: AuthContext | undefined
  action: AdminAuditAction
  route: string
  method: string
  result: AdminAuditResult
  resourceType?: string | null
  resourceId?: string | null
  deniedReason?: string | null
  metadata?: Record<string, unknown> | null
}

export async function recordAdminAudit(input: RecordAuditInput): Promise<void> {
  try {
    const entry: AdminAuditEntry = {
      id: auditId(),
      userId: input.auth?.user.userId ?? 'unknown',
      role: input.auth?.user.role ?? 'viewer',
      action: input.action,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      route: input.route,
      method: input.method,
      result: input.result,
      deniedReason: input.deniedReason ?? null,
      metadata: sanitize(input.metadata),
      createdAt: new Date().toISOString(),
    }
    await createRepositories().intelligence.createAdminAuditEntry(entry)
  } catch (e: any) {
    console.warn(`[Audit] recordAdminAudit failed (non-blocking): ${e?.message || e}`)
  }
}

export async function listAdminAudit(limit = 100): Promise<AdminAuditEntry[]> {
  return createRepositories().intelligence.listAdminAuditEntries(limit).catch(() => [])
}
