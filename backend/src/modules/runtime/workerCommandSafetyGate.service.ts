import type { AuthContext } from '../auth/auth.types.js'
import {
  explainRuntimeGuardDecision,
  type WorkerCommand,
} from './runtimeEnvironmentGuard.service.js'

export function buildBlockedWorkerCommandResponse(command: WorkerCommand, reason: string) {
  return {
    status: 'blocked_by_runtime_guard',
    command,
    reason,
    safeAction: [
      'run locally',
      'use CLI',
      'configure dedicated worker runtime',
      'read status only',
    ],
    limitations: [
      'Vercel must not start persistent workers or 90+ minute loops.',
      'No odds, Telegram, auto-bet, stake, or enforce changes are enabled by this path.',
    ],
  }
}

export function auditWorkerCommandAttempt(command: WorkerCommand, actor?: AuthContext | null, environment = process.env.GOALSENSE_RUNTIME || 'auto') {
  return {
    command,
    actorRole: actor?.user?.role ?? 'unknown',
    actorSource: actor?.source ?? 'unknown',
    environment,
    attemptedAt: new Date().toISOString(),
  }
}

export function assertWorkerCommandAllowed(command: WorkerCommand, context?: { actor?: AuthContext | null }) {
  const decision = explainRuntimeGuardDecision(command)
  const audit = auditWorkerCommandAttempt(command, context?.actor, decision.environment)
  if (!decision.allowed) {
    return {
      allowed: false as const,
      decision,
      audit,
      response: buildBlockedWorkerCommandResponse(command, decision.reason),
    }
  }
  return { allowed: true as const, decision, audit }
}
