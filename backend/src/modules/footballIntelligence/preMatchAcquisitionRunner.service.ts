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

  return {
    fixtureId, fetchedFromProvider, filledByManual, stillMissing,
    providerNotConfigured, providerNotSupported, conflicts,
    criticalBlockers, manualRequiredDomains, nextRecommendedRefreshAt: null,
    generatedAt: new Date().toISOString(),
    limitations: ['Diagnóstico V2: separa provider × manual × ausente; conflitos exigem revisão; nada inventado.'],
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
