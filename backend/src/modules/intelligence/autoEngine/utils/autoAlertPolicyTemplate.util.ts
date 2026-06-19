/**
 * Default Auto Alert Policy template (Phase B25) — PURE, env-free.
 * ─────────────────────────────────────────────────────────────────────────────
 * A conservative, SHADOW-ONLY starting point. Never auto-inserted; returned by a
 * template endpoint so the user has a safe baseline. Auto-create is NOT the
 * default mode and is never enabled by the template.
 */
import type { AutoAlertPolicy } from '../autoAlertPolicy.types.js'
import type { SampleQuality } from '../../contracts/learning.types.js'

export interface DefaultPolicyInputs {
  minScore: number
  minSampleQuality: SampleQuality
  maxPerFixture: number
  maxPerRun: number
  requireCalibration: boolean
  requireNoCriticalBlockers: boolean
}

export function buildDefaultPolicyTemplate(inputs: DefaultPolicyInputs, now: string): AutoAlertPolicy {
  return {
    id: 'aap_template_default',
    name: 'Política padrão (shadow, conservadora)',
    enabled: false,                 // never auto-active
    mode: 'shadow_only',            // never auto-create by default
    opportunityTypes: [],           // any
    minScore: inputs.minScore,
    minSampleQuality: inputs.minSampleQuality,
    allowedConfidenceBands: ['high', 'medium'],
    allowedDataQuality: ['rich', 'partial'],
    allowedLeagues: [],
    blockedLeagues: [],
    allowedTeams: [],
    blockedTeams: [],
    minuteWindows: [],
    maxPerFixture: inputs.maxPerFixture,
    maxPerRun: inputs.maxPerRun,
    requireCalibration: inputs.requireCalibration,
    requireNoCriticalBlockers: inputs.requireNoCriticalBlockers,
    requireLearningProfile: false,
    allowUnknownData: false,
    allowPoorData: false,
    createdAt: now,
    updatedAt: now,
    createdByUserId: null,
  }
}

/** Normalize an incoming policy payload into a complete, safe AutoAlertPolicy. */
export function normalizePolicyInput(raw: Partial<AutoAlertPolicy>, fallback: AutoAlertPolicy, id: string, now: string): AutoAlertPolicy {
  const arr = (v: unknown, f: any[]): any[] => Array.isArray(v) ? v : f
  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 120) : fallback.name,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : false,
    mode: (['disabled', 'shadow_only', 'suggest_manual', 'auto_create_monitored'] as const).includes(raw.mode as any) ? raw.mode as AutoAlertPolicy['mode'] : 'shadow_only',
    opportunityTypes: arr(raw.opportunityTypes, fallback.opportunityTypes),
    minScore: typeof raw.minScore === 'number' ? Math.max(0, Math.min(100, raw.minScore)) : fallback.minScore,
    minSampleQuality: (['insufficient', 'low', 'moderate', 'strong'] as const).includes(raw.minSampleQuality as any) ? raw.minSampleQuality as SampleQuality : fallback.minSampleQuality,
    allowedConfidenceBands: arr(raw.allowedConfidenceBands, fallback.allowedConfidenceBands),
    allowedDataQuality: arr(raw.allowedDataQuality, fallback.allowedDataQuality),
    allowedLeagues: arr(raw.allowedLeagues, fallback.allowedLeagues),
    blockedLeagues: arr(raw.blockedLeagues, fallback.blockedLeagues),
    allowedTeams: arr(raw.allowedTeams, fallback.allowedTeams),
    blockedTeams: arr(raw.blockedTeams, fallback.blockedTeams),
    minuteWindows: arr(raw.minuteWindows, fallback.minuteWindows),
    maxPerFixture: typeof raw.maxPerFixture === 'number' ? Math.max(0, Math.min(50, raw.maxPerFixture)) : fallback.maxPerFixture,
    maxPerRun: typeof raw.maxPerRun === 'number' ? Math.max(0, Math.min(200, raw.maxPerRun)) : fallback.maxPerRun,
    requireCalibration: typeof raw.requireCalibration === 'boolean' ? raw.requireCalibration : fallback.requireCalibration,
    requireNoCriticalBlockers: typeof raw.requireNoCriticalBlockers === 'boolean' ? raw.requireNoCriticalBlockers : fallback.requireNoCriticalBlockers,
    requireLearningProfile: typeof raw.requireLearningProfile === 'boolean' ? raw.requireLearningProfile : fallback.requireLearningProfile,
    allowUnknownData: typeof raw.allowUnknownData === 'boolean' ? raw.allowUnknownData : false,
    allowPoorData: typeof raw.allowPoorData === 'boolean' ? raw.allowPoorData : false,
    createdAt: fallback.createdAt || now,
    updatedAt: now,
    createdByUserId: fallback.createdByUserId ?? null,
  }
}
