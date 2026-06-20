/**
 * Pre-Match Acquisition Runner (B40) — manual-first, budget-guarded, non-fatal.
 * ─────────────────────────────────────────────────────────────────────────────
 * Executes the planner's tasks through the domain router and persists domain
 * snapshots + an acquisition run. Disabled by default (ENABLE_PRE_MATCH_ACQUISITION).
 * Never calls a provider without env (the router/registry enforce that). Honest
 * statuses; nothing fabricated.
 */
import { randomUUID } from 'node:crypto'
import { env } from '../../env.js'
import { fetchDomain } from './providers/footballDataProviderRouter.service.js'
import { planAcquisitionForFixture, planAcquisitionForToday } from './preMatchAcquisitionPlanner.service.js'
import { createRepositories } from '../../repositories/index.js'
import { fromFetchResult, savePreMatchDomainSnapshot, createAcquisitionRun, updateAcquisitionRun, listPreMatchDomainSnapshots, listAcquisitionRuns } from './preMatchDataStore.service.js'
import type { PreMatchAcquisitionRun, PreMatchAcquisitionTask } from './preMatchAcquisition.types.js'
import type { AcquisitionDomain } from './providers/provider.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'
export function isAcquisitionEnabled(): boolean { return flag(env.ENABLE_PRE_MATCH_ACQUISITION) }
function mode(): 'manual' | 'scheduled' { return String(env.PRE_MATCH_ACQUISITION_MODE) === 'scheduled' ? 'scheduled' : 'manual' }

function newRun(scope: 'today' | 'fixture', fixtureId: string | null): PreMatchAcquisitionRun {
  return {
    id: `pmar_${randomUUID()}`, scope, fixtureId, startedAt: new Date().toISOString(), completedAt: null, mode: mode(),
    tasksPlanned: 0, tasksRan: 0, tasksSkipped: 0, domainsAvailable: 0, domainsUnavailable: 0, domainsUnsupported: 0,
    providerCallsBlocked: 0, status: 'completed', limitations: [],
  }
}

async function executeTasks(fixtureId: string, tasks: PreMatchAcquisitionTask[], run: PreMatchAcquisitionRun): Promise<void> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  const params = { fixtureId, homeTeam: fixture?.homeName, awayTeam: fixture?.awayName, competition: fixture?.competition, providerFixtureId: fixture?.providerFixtureId ?? null }
  run.tasksPlanned += tasks.length
  for (const task of tasks) {
    if (task.status !== 'scheduled') {
      run.tasksSkipped++
      if (task.status === 'skipped_unsupported') run.domainsUnsupported++
      continue
    }
    try {
      const res = await fetchDomain(task.domain, params)
      run.tasksRan++
      if (res.availability === 'budget_blocked') run.providerCallsBlocked++
      if (res.availability === 'available' || res.availability === 'partial') run.domainsAvailable++
      else if (res.availability === 'provider_not_supported') run.domainsUnsupported++
      else run.domainsUnavailable++
      // Persist a snapshot for every honest result (including unavailable, for audit).
      await savePreMatchDomainSnapshot(fromFetchResult(fixtureId, res))
    } catch (e: any) {
      run.tasksSkipped++
      run.limitations.push(`Task ${task.domain} falhou (não-fatal): ${String(e?.message || e).slice(0, 50)}`)
    }
  }
}

export async function runAcquisitionForFixture(fixtureId: string): Promise<PreMatchAcquisitionRun> {
  const run = newRun('fixture', fixtureId)
  if (!isAcquisitionEnabled()) { run.status = 'disabled'; run.completedAt = new Date().toISOString(); run.limitations.push('Aquisição desabilitada (ENABLE_PRE_MATCH_ACQUISITION=false).'); await createAcquisitionRun(run); return run }
  await createAcquisitionRun(run)
  try {
    const tasks = await planAcquisitionForFixture(fixtureId)
    await executeTasks(fixtureId, tasks, run)
  } catch (e: any) { run.status = 'failed_non_fatal'; run.limitations.push(String(e?.message || e).slice(0, 60)) }
  if (run.providerCallsBlocked > 0 || run.domainsUnsupported > 0 || run.domainsUnavailable > 0) run.status = run.status === 'failed_non_fatal' ? run.status : 'completed_with_limitations'
  run.completedAt = new Date().toISOString()
  await updateAcquisitionRun(run.id, run)
  return run
}

export async function runAcquisitionForToday(max?: number): Promise<PreMatchAcquisitionRun> {
  const run = newRun('today', null)
  if (!isAcquisitionEnabled()) { run.status = 'disabled'; run.completedAt = new Date().toISOString(); run.limitations.push('Aquisição desabilitada (ENABLE_PRE_MATCH_ACQUISITION=false).'); await createAcquisitionRun(run); return run }
  await createAcquisitionRun(run)
  try {
    const plans = await planAcquisitionForToday(new Date(), max)
    for (const p of plans) await executeTasks(p.fixtureId, p.tasks, run)
    if (plans.length === 0) run.limitations.push('Nenhuma fixture de hoje no escopo.')
  } catch (e: any) { run.status = 'failed_non_fatal'; run.limitations.push(String(e?.message || e).slice(0, 60)) }
  if (run.providerCallsBlocked > 0 || run.domainsUnsupported > 0 || run.domainsUnavailable > 0) run.status = run.status === 'failed_non_fatal' ? run.status : 'completed_with_limitations'
  run.completedAt = new Date().toISOString()
  await updateAcquisitionRun(run.id, run)
  return run
}

export async function runAcquisitionTask(fixtureId: string, task: PreMatchAcquisitionTask): Promise<PreMatchAcquisitionRun> {
  const run = newRun('fixture', fixtureId)
  if (!isAcquisitionEnabled()) { run.status = 'disabled'; run.completedAt = new Date().toISOString(); return run }
  await executeTasks(fixtureId, [task], run)
  run.completedAt = new Date().toISOString()
  return run
}

/** Refresh just the lineup-window domains for a fixture (T-90/T-60/T-15 critical path). */
export async function refreshLineupWindow(fixtureId: string): Promise<PreMatchAcquisitionRun> {
  const run = newRun('fixture', fixtureId)
  if (!isAcquisitionEnabled()) { run.status = 'disabled'; run.completedAt = new Date().toISOString(); run.limitations.push('Aquisição desabilitada.'); return run }
  try {
    const tasks = (await planAcquisitionForFixture(fixtureId)).filter(t => t.domain === 'confirmed_lineups' || t.domain === 'probable_lineups')
    await executeTasks(fixtureId, tasks, run)
  } catch (e: any) { run.status = 'failed_non_fatal'; run.limitations.push(String(e?.message || e).slice(0, 60)) }
  run.completedAt = new Date().toISOString()
  return run
}

/** Refresh injuries/suspensions/standings — the critical pre-match data. */
export async function refreshCriticalPreMatchData(fixtureId: string): Promise<PreMatchAcquisitionRun> {
  const run = newRun('fixture', fixtureId)
  if (!isAcquisitionEnabled()) { run.status = 'disabled'; run.completedAt = new Date().toISOString(); run.limitations.push('Aquisição desabilitada.'); return run }
  try {
    const tasks = (await planAcquisitionForFixture(fixtureId)).filter(t => ['injuries', 'suspensions', 'standings'].includes(t.domain))
    await executeTasks(fixtureId, tasks, run)
  } catch (e: any) { run.status = 'failed_non_fatal'; run.limitations.push(String(e?.message || e).slice(0, 60)) }
  run.completedAt = new Date().toISOString()
  return run
}

export async function buildAcquisitionReport(fixtureId: string): Promise<{ fixtureId: string; snapshots: unknown[]; runs: unknown[]; generatedAt: string }> {
  const [snapshots, runs] = await Promise.all([listPreMatchDomainSnapshots(fixtureId, 100), listAcquisitionRuns(fixtureId, 20)])
  return { fixtureId, snapshots, runs, generatedAt: new Date().toISOString() }
}

// ─── Acquisition V2 (B41) — provider + manual diagnostic ───────────────────────
import { buildPreMatchMergeReport } from './preMatchDataMerge.service.js'
import { buildProviderIntegrationReadiness } from './providerIntegrationReadiness.service.js'
import { listManualRecordsForFixture } from './manualIntelligenceIntake.service.js'
import { getProviderFixtureId } from './identity/providerBridge.service.js'

const CRITICAL: AcquisitionDomain[] = ['confirmed_lineups', 'injuries', 'suspensions', 'standings']

export interface AcquisitionReportV2 {
  fixtureId: string
  fetchedFromProvider: string[]
  filledByManual: string[]
  stillMissing: string[]
  providerNotConfigured: string[]
  providerNotSupported: string[]
  conflicts: Array<{ domain: string; detail: string }>
  criticalBlockers: string[]
  manualRequiredDomains: string[]
  providerMappingStatus: string | null
  providerMappingConfidence: number | null
  blockedByMissingMapping: boolean
  blockedByAmbiguousMapping: boolean
  suggestedAction: 'run_identity_resolution' | 'confirm_mapping' | 'use_manual_intake' | 'configure_provider' | 'none'
  nextRecommendedRefreshAt: string | null
  generatedAt: string
  limitations: string[]
}

export async function buildAcquisitionReportV2(fixtureId: string): Promise<AcquisitionReportV2> {
  const repos = createRepositories()
  const [snapshots, merge, manual] = await Promise.all([
    listPreMatchDomainSnapshots(fixtureId, 200).catch(() => []),
    buildPreMatchMergeReport(fixtureId).catch(() => null),
    listManualRecordsForFixture(fixtureId, 200).catch(() => []),
  ])
  void repos
  const byDomain = new Map<string, any>()
  for (const s of snapshots) if (!byDomain.has(s.domain) || s.fetchedAt > byDomain.get(s.domain).fetchedAt) byDomain.set(s.domain, s)

  const fetchedFromProvider: string[] = []
  const providerNotConfigured: string[] = []
  const providerNotSupported: string[] = []
  for (const [domain, s] of byDomain.entries()) {
    if (s.availability === 'available' || s.availability === 'available_empty_confirmed' || s.availability === 'partial') fetchedFromProvider.push(domain)
    else if (s.availability === 'provider_not_configured') providerNotConfigured.push(domain)
    else if (s.availability === 'provider_not_supported') providerNotSupported.push(domain)
  }
  const filledByManual = [...new Set((manual as any[]).map(m => m.domain))]
  const conflicts = merge?.conflicts ?? []
  const mergedDomains = merge?.domains ?? []
  const stillMissing = mergedDomains.filter(d => d.chosenSource === 'none').map(d => d.domain)
  const criticalBlockers = CRITICAL.filter(d => stillMissing.includes(d))
  const manualRequiredDomains = criticalBlockers.filter(d => providerNotConfigured.includes(d) || providerNotSupported.includes(d) || !byDomain.has(d))

  // B42: mapping diagnostics.
  const mapping = await getProviderFixtureId(fixtureId, 'api_football').catch(() => null)
  const blockedByMissingMapping = [...byDomain.values()].some((s: any) => s.availability === 'blocked_missing_provider_mapping')
  const blockedByAmbiguousMapping = [...byDomain.values()].some((s: any) => s.availability === 'blocked_ambiguous_provider_mapping')
  const providerReady = buildProviderIntegrationReadiness().providers.find(p => p.providerName === 'api_football')
  let suggestedAction: AcquisitionReportV2['suggestedAction'] = 'none'
  if (providerReady && providerReady.adapterStatus !== 'real') suggestedAction = 'configure_provider'
  else if (blockedByAmbiguousMapping) suggestedAction = 'confirm_mapping'
  else if (blockedByMissingMapping) suggestedAction = 'run_identity_resolution'
  else if (manualRequiredDomains.length > 0) suggestedAction = 'use_manual_intake'

  return {
    fixtureId, fetchedFromProvider, filledByManual, stillMissing,
    providerNotConfigured, providerNotSupported, conflicts,
    criticalBlockers, manualRequiredDomains,
    providerMappingStatus: mapping?.mappingStatus ?? null, providerMappingConfidence: mapping?.mappingConfidence ?? null,
    blockedByMissingMapping, blockedByAmbiguousMapping, suggestedAction,
    nextRecommendedRefreshAt: null,
    generatedAt: new Date().toISOString(),
    limitations: ['Diagnóstico V2: separa provider × manual × ausente; conflitos e bloqueio por mapping explícitos; nada inventado.'],
  }
}

export async function runAcquisitionForFixtureV2(fixtureId: string): Promise<{ run: PreMatchAcquisitionRun; report: AcquisitionReportV2; providerReadiness: ReturnType<typeof buildProviderIntegrationReadiness> }> {
  const run = await runAcquisitionForFixture(fixtureId)
  const report = await buildAcquisitionReportV2(fixtureId)
  return { run, report, providerReadiness: buildProviderIntegrationReadiness() }
}

export async function runAcquisitionForTodayV2(max?: number): Promise<{ run: PreMatchAcquisitionRun; providerReadiness: ReturnType<typeof buildProviderIntegrationReadiness> }> {
  const run = await runAcquisitionForToday(max)
  return { run, providerReadiness: buildProviderIntegrationReadiness() }
}

// ─── Acquisition V3 (B43) — identity-driven domain unlock diagnostics ──────────
import { getDomainUnlockStatus } from './identity/providerBridge.service.js'
import type { DomainUnlockStatus } from './identity/providerIdentity.types.js'

const V3_DOMAINS = ['fixture_details', 'confirmed_lineups', 'post_match_stats', 'standings', 'injuries', 'suspensions', 'head_to_head', 'squads']

export interface AcquisitionReportV3 {
  fixtureId: string
  domainUnlockStatuses: DomainUnlockStatus[]
  domainsUnlocked: string[]
  domainsStillBlocked: string[]
  missingMappings: string[]
  ambiguousMappings: string[]
  manualIntakeRecommended: string[]
  generatedAt: string
  limitations: string[]
}

export async function buildAcquisitionReportV3(fixtureId: string): Promise<AcquisitionReportV3> {
  const statuses = await Promise.all(V3_DOMAINS.map(d => getDomainUnlockStatus(fixtureId, d, 'api_football').catch(() => null)))
  const domainUnlockStatuses = statuses.filter((s): s is DomainUnlockStatus => !!s)
  const domainsUnlocked = domainUnlockStatuses.filter(s => s.currentStatus === 'unlocked').map(s => s.domain)
  const domainsStillBlocked = domainUnlockStatuses.filter(s => s.currentStatus !== 'unlocked').map(s => s.domain)
  const missingMappings = domainUnlockStatuses.filter(s => s.currentStatus === 'blocked_missing_mapping').map(s => s.domain)
  const ambiguousMappings = domainUnlockStatuses.filter(s => s.currentStatus === 'blocked_ambiguous_mapping').map(s => s.domain)
  const manualIntakeRecommended = domainUnlockStatuses.filter(s => s.currentStatus === 'blocked_endpoint_not_implemented' || s.currentStatus === 'blocked_provider_not_supported').map(s => s.domain)
  return {
    fixtureId, domainUnlockStatuses, domainsUnlocked, domainsStillBlocked, missingMappings, ambiguousMappings, manualIntakeRecommended,
    generatedAt: new Date().toISOString(),
    limitations: ['Diagnóstico V3: status de desbloqueio por domínio (identidade/provider/endpoint). Bloqueado não é falha; nada inventado.'],
  }
}

export async function runAcquisitionForFixtureV3(fixtureId: string): Promise<{ run: PreMatchAcquisitionRun; reportV2: AcquisitionReportV2; reportV3: AcquisitionReportV3 }> {
  const run = await runAcquisitionForFixture(fixtureId)
  const [reportV2, reportV3] = await Promise.all([buildAcquisitionReportV2(fixtureId), buildAcquisitionReportV3(fixtureId)])
  return { run, reportV2, reportV3 }
}

export async function runAcquisitionForTodayV3(max?: number): Promise<{ run: PreMatchAcquisitionRun }> {
  const run = await runAcquisitionForToday(max)
  return { run }
}

// ─── Acquisition Runner V4 (B44) — critical domain orchestration ───────────────
import { getDomainUnlockStatusV2 } from './identity/providerBridge.service.js'
import { normalizeDomainResult } from './canonicalNormalizer.service.js'
import { selectFixturesForAnalysis } from './matchDayScope.service.js'

const CRITICAL_ORDER: AcquisitionDomain[] = ['fixture_details', 'standings', 'squads', 'injuries', 'suspensions', 'confirmed_lineups', 'probable_lineups', 'head_to_head', 'team_form', 'post_match_stats']

export interface DomainAcquisitionResult {
  domain: string
  attempted: boolean
  availability: string
  endpointStatus: string | null
  recommendedNextAction: string | undefined
  manualFallbackAvailable: boolean
  confirmedEmpty: boolean
}

export interface CriticalDomainAcquisitionReport {
  fixtureId: string
  results: DomainAcquisitionResult[]
  domainsFetched: string[]
  domainsBlocked: string[]
  domainsManualRecommended: string[]
  domainsProviderNotConfigured: string[]
  domainsEndpointMissingDocs: string[]
  domainsWithConfirmedEmpty: string[]
  criticalDomainsReady: string[]
  criticalDomainsMissing: string[]
  nextRefreshRecommendations: string[]
  generatedAt: string
  limitations: string[]
}

const CRITICAL_SET = ['confirmed_lineups', 'injuries', 'standings']

export async function runDomainAcquisition(fixtureId: string, domain: AcquisitionDomain): Promise<DomainAcquisitionResult> {
  const repos = createRepositories()
  const matrix = await getDomainUnlockStatusV2(fixtureId, domain, 'api_football').catch(() => null)
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  const params = { fixtureId, homeTeam: fixture?.homeName, awayTeam: fixture?.awayName, competition: fixture?.competition, providerFixtureId: fixture?.providerFixtureId ?? null }

  // Only attempt a real fetch when the matrix says ready_to_fetch; otherwise record the
  // blocker WITHOUT calling the provider.
  const ready = matrix?.recommendedNextAction === 'ready_to_fetch'
  let availability = matrix?.endpointStatus || 'blocked'
  let confirmedEmpty = false
  if (ready) {
    const res = await fetchDomain(domain, params).catch(() => null)
    if (res) {
      availability = res.availability
      confirmedEmpty = res.availability === 'available_empty_confirmed'
      const envelope = normalizeDomainResult(res, (matrix?.idsResolved as any) ?? {})
      const snap = fromFetchResult(fixtureId, res)
      snap.providerEndpointKey = matrix?.endpointKey ?? null
      snap.domainUnlockStatus = matrix?.currentStatus
      snap.idsResolved = (matrix?.idsResolved as any) ?? {}
      snap.idsMissing = matrix?.idsMissing ?? []
      snap.sourceBreakdown = { provider: envelope.source === 'provider', manual: envelope.source === 'manual' }
      snap.manualFallbackAvailable = !!matrix?.manualFallbackAvailable
      snap.providerResponseStatus = res.availability
      snap.confirmedEmpty = confirmedEmpty
      snap.reliability = envelope.reliability
      snap.refreshReason = 'critical_domain_acquisition_v4'
      await savePreMatchDomainSnapshot(snap)
    }
  }
  return {
    domain, attempted: ready, availability,
    endpointStatus: matrix?.endpointStatus ?? null, recommendedNextAction: matrix?.recommendedNextAction,
    manualFallbackAvailable: !!matrix?.manualFallbackAvailable, confirmedEmpty,
  }
}

export async function runCriticalDomainAcquisitionForFixture(fixtureId: string): Promise<CriticalDomainAcquisitionReport> {
  const results: DomainAcquisitionResult[] = []
  for (const d of CRITICAL_ORDER) {
    try { results.push(await runDomainAcquisition(fixtureId, d)) } catch { /* non-fatal */ }
  }
  return buildReport(fixtureId, results)
}

function buildReport(fixtureId: string, results: DomainAcquisitionResult[]): CriticalDomainAcquisitionReport {
  const domainsFetched = results.filter(r => r.attempted && (r.availability === 'available' || r.availability === 'partial' || r.availability === 'available_empty_confirmed')).map(r => r.domain)
  const domainsBlocked = results.filter(r => !r.attempted).map(r => r.domain)
  const domainsManualRecommended = results.filter(r => r.recommendedNextAction === 'use_manual_intake').map(r => r.domain)
  const domainsProviderNotConfigured = results.filter(r => r.endpointStatus === 'blocked_missing_env').map(r => r.domain)
  const domainsEndpointMissingDocs = results.filter(r => r.endpointStatus === 'blocked_not_documented' || r.endpointStatus === 'not_implemented').map(r => r.domain)
  const domainsWithConfirmedEmpty = results.filter(r => r.confirmedEmpty).map(r => r.domain)
  const criticalDomainsReady = results.filter(r => CRITICAL_SET.includes(r.domain) && domainsFetched.includes(r.domain)).map(r => r.domain)
  const criticalDomainsMissing = CRITICAL_SET.filter(d => !criticalDomainsReady.includes(d))
  const nextRefreshRecommendations = results.filter(r => r.recommendedNextAction && r.recommendedNextAction !== 'ready_to_fetch' && r.recommendedNextAction !== 'stay_out').map(r => `${r.domain}: ${r.recommendedNextAction}`)
  return {
    fixtureId, results, domainsFetched, domainsBlocked, domainsManualRecommended, domainsProviderNotConfigured,
    domainsEndpointMissingDocs, domainsWithConfirmedEmpty, criticalDomainsReady, criticalDomainsMissing, nextRefreshRecommendations,
    generatedAt: new Date().toISOString(),
    limitations: ['Orquestração V4: só busca domínios ready_to_fetch; bloqueado não chama provider e não é falha; nada inventado.'],
  }
}

export async function buildCriticalDomainAcquisitionReport(fixtureId: string): Promise<CriticalDomainAcquisitionReport> {
  // Read-only: report current matrix without fetching.
  const results: DomainAcquisitionResult[] = []
  for (const d of CRITICAL_ORDER) {
    const m = await getDomainUnlockStatusV2(fixtureId, d, 'api_football').catch(() => null)
    results.push({ domain: d, attempted: false, availability: m?.endpointStatus || 'unknown', endpointStatus: m?.endpointStatus ?? null, recommendedNextAction: m?.recommendedNextAction, manualFallbackAvailable: !!m?.manualFallbackAvailable, confirmedEmpty: false })
  }
  return buildReport(fixtureId, results)
}

export async function runCriticalDomainAcquisitionForToday(max?: number): Promise<{ fixtures: number; reports: CriticalDomainAcquisitionReport[] }> {
  const fixtures = await selectFixturesForAnalysis(new Date(), max).catch(() => [])
  const reports: CriticalDomainAcquisitionReport[] = []
  for (const f of fixtures) { try { reports.push(await runCriticalDomainAcquisitionForFixture(f.fixtureId)) } catch { /* non-fatal */ } }
  return { fixtures: fixtures.length, reports }
}
