/**
 * Auto Alert Policy config (Phase B25) — flags, CRUD, template, overview.
 * ─────────────────────────────────────────────────────────────────────────────
 * Read/write side of policies. Shadow-first: nothing here creates an alert.
 * Mutations are env-gated by ENABLE_AUTO_ALERT_POLICY_CONFIG.
 */
import { env } from '../../../env.js'
import { createRepositories } from '../../../repositories/index.js'
import { buildDefaultPolicyTemplate, normalizePolicyInput } from './utils/autoAlertPolicyTemplate.util.js'
import type { AutoAlertPolicy, AutoAlertPolicyOverview, AutoAlertPolicyEvaluation } from './autoAlertPolicy.types.js'
import type { SampleQuality } from '../contracts/learning.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export function isAutoAlertPolicyEnabled(): boolean { return flag(env.ENABLE_AUTO_ALERT_POLICY) }
export function isAutoAlertShadowMode(): boolean { return flag(env.ENABLE_AUTO_ALERT_SHADOW_MODE) }
export function isAutoAlertCreateFlagEnabled(): boolean { return flag(env.ENABLE_AUTO_ALERT_CREATE) }
export function isAutoAlertTelegramEnabled(): boolean { return flag(env.ENABLE_AUTO_ALERT_TELEGRAM) }
export function isAutoAlertPolicyConfigEnabled(): boolean { return flag(env.ENABLE_AUTO_ALERT_POLICY_CONFIG) }
export function isAutoEngineToAlertsEnabled(): boolean { return flag(env.ENABLE_AUTO_ENGINE_TO_ALERTS) }

export function getDefaultPolicyTemplate(): AutoAlertPolicy {
  return buildDefaultPolicyTemplate({
    minScore: env.AUTO_ALERT_MIN_SCORE,
    minSampleQuality: env.AUTO_ALERT_MIN_SAMPLE_QUALITY as SampleQuality,
    maxPerFixture: env.AUTO_ALERT_MAX_PER_FIXTURE,
    maxPerRun: env.AUTO_ALERT_MAX_PER_RUN,
    requireCalibration: flag(env.AUTO_ALERT_REQUIRE_CALIBRATION),
    requireNoCriticalBlockers: flag(env.AUTO_ALERT_REQUIRE_NO_CRITICAL_BLOCKERS),
  }, new Date().toISOString())
}

export async function listPolicies(): Promise<AutoAlertPolicy[]> {
  return createRepositories().intelligence.listAutoAlertPolicies(200).catch(() => [])
}
export async function getPolicy(id: string): Promise<AutoAlertPolicy | null> {
  return createRepositories().intelligence.getAutoAlertPolicy(id).catch(() => null)
}

export async function createPolicy(raw: Partial<AutoAlertPolicy>): Promise<AutoAlertPolicy> {
  const repos = createRepositories()
  const now = new Date().toISOString()
  const id = `aap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const policy = normalizePolicyInput(raw, getDefaultPolicyTemplate(), id, now)
  // Safety: auto_create requires the global create flag; otherwise downgrade to shadow.
  if (policy.mode === 'auto_create_monitored' && !isAutoAlertCreateFlagEnabled()) policy.mode = 'shadow_only'
  await repos.intelligence.createAutoAlertPolicy(policy)
  return policy
}

export async function updatePolicy(id: string, raw: Partial<AutoAlertPolicy>): Promise<AutoAlertPolicy | null> {
  const repos = createRepositories()
  const existing = await repos.intelligence.getAutoAlertPolicy(id).catch(() => null)
  if (!existing) return null
  const now = new Date().toISOString()
  const policy = normalizePolicyInput({ ...existing, ...raw }, existing, id, now)
  if (policy.mode === 'auto_create_monitored' && !isAutoAlertCreateFlagEnabled()) policy.mode = 'shadow_only'
  await repos.intelligence.updateAutoAlertPolicy(id, policy)
  return policy
}

export async function getAutoAlertPolicyOverview(): Promise<AutoAlertPolicyOverview> {
  const repos = createRepositories()
  const [policies, evals] = await Promise.all([
    repos.intelligence.listAutoAlertPolicies(200).catch(() => [] as AutoAlertPolicy[]),
    repos.intelligence.listAutoAlertPolicyEvaluations(1000).catch(() => [] as AutoAlertPolicyEvaluation[]),
  ])
  let blocked = 0, shadowWouldCreate = 0, suggestedManual = 0, autoCreated = 0, skipped = 0
  const blockReasons = new Map<string, number>()
  const blockedTypes = new Map<string, number>()
  const byPolicyBlocked = new Map<string, { name: string; blocked: number }>()
  let lastEvaluationAt: string | null = null

  for (const e of evals) {
    switch (e.decision) {
      case 'blocked': blocked++; break
      case 'shadow_would_create': shadowWouldCreate++; break
      case 'suggest_manual_review': suggestedManual++; break
      case 'auto_created': autoCreated++; break
      default: skipped++; break
    }
    if (e.decision === 'blocked') {
      for (const r of e.reasons) blockReasons.set(r, (blockReasons.get(r) || 0) + 1)
      blockedTypes.set(e.scoreSnapshot.opportunityType, (blockedTypes.get(e.scoreSnapshot.opportunityType) || 0) + 1)
      const p = byPolicyBlocked.get(e.policyId) || { name: e.policyName, blocked: 0 }
      p.blocked++; byPolicyBlocked.set(e.policyId, p)
    }
    if (!lastEvaluationAt || e.evaluatedAt > lastEvaluationAt) lastEvaluationAt = e.evaluatedAt
  }

  const top = (m: Map<string, number>, key: 'reason' | 'opportunityType') =>
    [...m.entries()].map(([k, count]) => ({ [key]: k, count } as any)).sort((a, b) => b.count - a.count).slice(0, 5)

  return {
    flags: {
      policyEnabled: isAutoAlertPolicyEnabled(), shadowMode: isAutoAlertShadowMode(),
      createEnabled: isAutoAlertCreateFlagEnabled(), telegramEnabled: isAutoAlertTelegramEnabled(),
      toAlertsEnabled: isAutoEngineToAlertsEnabled(), configEnabled: isAutoAlertPolicyConfigEnabled(),
    },
    policies: policies.length,
    enabledPolicies: policies.filter(p => p.enabled && p.mode !== 'disabled').length,
    totalEvaluations: evals.length,
    blocked, shadowWouldCreate, suggestedManual, autoCreated, skipped,
    topBlockReasons: top(blockReasons, 'reason'),
    topBlockedOpportunityTypes: top(blockedTypes, 'opportunityType'),
    mostRestrictivePolicies: [...byPolicyBlocked.entries()].map(([policyId, v]) => ({ policyId, name: v.name, blocked: v.blocked })).sort((a, b) => b.blocked - a.blocked).slice(0, 5),
    lastEvaluationAt,
    limitations: [
      'Shadow-first: por padrão nenhuma política cria alerta automático.',
      'Auto-create exige ENABLE_AUTO_ALERT_POLICY + ENABLE_AUTO_ALERT_CREATE + ENABLE_AUTO_ENGINE_TO_ALERTS + policy.mode=auto_create_monitored.',
      'Sem Telegram, sem odds, sem aposta. Shadow nunca conta como alerta real.',
    ],
    generatedAt: new Date().toISOString(),
  }
}
