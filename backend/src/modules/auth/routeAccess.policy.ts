/**
 * Route access policy (Phase B26).
 * ─────────────────────────────────────────────────────────────────────────────
 * Declarative access metadata for sensitive routes. Guards in the route files
 * reference these constants so access stays standardized and documented.
 */
import { env } from '../../env.js'
import type { AuthPermission } from './auth.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export interface AccessSpec {
  permission: AuthPermission
  dangerous: boolean
  envGate?: () => boolean
  envGateName?: string
}

/** Sensitive route specs, keyed by a stable name used by the guards + audit. */
export const ROUTE_ACCESS = {
  backtest_run: { permission: 'run:backtest', dangerous: true, envGate: () => flag(env.ENABLE_BACKTEST_API), envGateName: 'ENABLE_BACKTEST_API' },
  replay_run: { permission: 'run:replay', dangerous: true, envGate: () => flag(env.ENABLE_BACKTEST_API), envGateName: 'ENABLE_BACKTEST_API' },
  learning_rebuild: { permission: 'learning:rebuild', dangerous: true },
  export_csv: { permission: 'export:csv', dangerous: true, envGate: () => flag(env.ENABLE_ALERT_EXPORT), envGateName: 'ENABLE_ALERT_EXPORT' },
  auto_scan: { permission: 'run:scan', dangerous: true, envGate: () => flag(env.ENABLE_AUTO_ENGINE), envGateName: 'ENABLE_AUTO_ENGINE' },
  opportunity_action: { permission: 'opportunity:action', dangerous: false },
  opportunity_feedback: { permission: 'opportunity:feedback', dangerous: false },
  promotion_plan: { permission: 'promotion:plan', dangerous: false },
  promote_to_alert: { permission: 'promote:alert', dangerous: true, envGate: () => flag(env.ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION), envGateName: 'ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION' },
  resolve_now: { permission: 'resolve:now', dangerous: true, envGate: () => flag(env.ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE), envGateName: 'ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE' },
  auto_learning_rebuild: { permission: 'learning:rebuild', dangerous: true, envGate: () => flag(env.ENABLE_AUTO_ENGINE_LEARNING_REBUILD), envGateName: 'ENABLE_AUTO_ENGINE_LEARNING_REBUILD' },
  policy_config: { permission: 'policy:config', dangerous: true, envGate: () => flag(env.ENABLE_AUTO_ALERT_POLICY_CONFIG), envGateName: 'ENABLE_AUTO_ALERT_POLICY_CONFIG' },
  policy_evaluate: { permission: 'policy:evaluate', dangerous: true },
} as const satisfies Record<string, AccessSpec>

export type RouteAccessKey = keyof typeof ROUTE_ACCESS
