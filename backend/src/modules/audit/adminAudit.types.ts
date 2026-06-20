/**
 * Admin audit trail — types (Phase B26).
 * ─────────────────────────────────────────────────────────────────────────────
 * Records sensitive/admin actions + relevant denials. NEVER stores tokens,
 * secrets, or unnecessary sensitive payloads.
 */
import type { AuthRole } from '../auth/auth.types.js'

export type AdminAuditAction =
  | 'backtest_run' | 'replay_run' | 'export_csv'
  | 'auto_engine_scan' | 'opportunity_action' | 'opportunity_feedback'
  | 'promotion_plan' | 'promote_to_alert' | 'resolve_now'
  | 'learning_rebuild' | 'auto_engine_learning_rebuild'
  | 'policy_create' | 'policy_update' | 'policy_evaluate' | 'auto_create_attempt'
  | 'dangerous_route_denied'

export type AdminAuditResult = 'allowed' | 'denied' | 'success' | 'error'

export interface AdminAuditEntry {
  id: string
  userId: string
  role: AuthRole
  action: AdminAuditAction
  resourceType: string | null
  resourceId: string | null
  route: string
  method: string
  result: AdminAuditResult
  deniedReason: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}
