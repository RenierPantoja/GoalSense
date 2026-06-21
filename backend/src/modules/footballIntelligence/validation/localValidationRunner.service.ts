/**
 * Local Validation Runner (B49 / Bloco 6).
 * ─────────────────────────────────────────────────────────────────────────────
 * Manual-first orchestration of a local validation run over today's (or a single)
 * fixture(s). Non-fatal per fixture (one failure never kills the run). Observe/shadow:
 * never blocks an alert, never enforces, never sends Telegram/odds, never changes alert
 * results. Persists run + fixture summaries; metrics collected separately. Scheduler OFF.
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import { buildTodayValidationPlan, isLocalValidationEnabled } from './localValidationPlan.service.js'
import { getOrBuildPackage, getOrBuildInfluence, getCacheMetrics, clearRunCache } from './localValidationCache.service.js'
import { evaluateAlertCandidate } from '../governance/alertDecisionGovernor.service.js'
import { runCausalLearningForFixture } from '../causal/causalLearningRunner.service.js'
import { collectRunMetrics } from './localValidationMetrics.service.js'
import type {
  LocalValidationRun, LocalValidationFixtureSummary, LocalValidationMode, LocalValidationPlan,
} from './localValidation.types.js'

const FINISHED = ['FT', 'AET', 'PEN']
const LIVE = ['1H', '2H', 'HT', 'ET', 'BT', 'P']

function mode(): LocalValidationMode { return (String(env.LOCAL_VALIDATION_MODE) as LocalValidationMode) || 'shadow_only' }
function causalEnabled(): boolean { return String(env.LOCAL_VALIDATION_ENABLE_CAUSAL).toLowerCase() === 'true' }
function buildEnabledFlags() {
  return { governance: String(env.ENABLE_ALERT_DECISION_GOVERNANCE).toLowerCase() === 'true', causal: causalEnabled() && String(env.ENABLE_CAUSAL_LEARNING).toLowerCase() === 'true' }
}

let seq = 0
function runId(): string { seq = (seq + 1) % 1e9; return `lvr_${Date.now().toString(36)}_${seq.toString(36)}` }

function newRun(scope: LocalValidationRun['scope'], fixtureIds: string[]): LocalValidationRun {
  return {
    id: runId(), title: `Validação local ${new Date().toISOString().slice(0, 16)}`, mode: mode(),
    startedAt: new Date().toISOString(), completedAt: null, durationMinutes: null,
    scope, fixtureIds, selectedFixtures: fixtureIds.length, skippedFixtures: 0,
    providerMode: String(env.ENABLE_PROVIDER_API_FOOTBALL).toLowerCase() === 'true' ? 'api_football' : 'espn_only',
    firebaseMode: String(env.PERSISTENCE_PROVIDER), governanceMode: String(env.ALERT_GOVERNANCE_MODE), causalMode: causalEnabled() ? 'on' : 'off',
    status: 'running', errors: [], warnings: [], limitations: ['Validação observacional; métrica não é promessa de acerto; shadow não bloqueia alerta.'],
  }
}

function disabledRun(): LocalValidationRun {
  return { ...newRun('today', []), status: 'cancelled', completedAt: new Date().toISOString(), warnings: ['ENABLE_LOCAL_LONG_RUN_VALIDATION=false — validação desligada.'] }
}

async function processFixture(run: LocalValidationRun, f: { fixtureId: string; teams: string; competition: string; status: string; kickoffAt: string | null }): Promise<LocalValidationFixtureSummary> {
  const repos = createRepositories()
  const flags = buildEnabledFlags()
  const isFinished = FINISHED.includes(f.status)
  const isLive = LIVE.includes(f.status)
  const summary: LocalValidationFixtureSummary = {
    id: `lvfs_${run.id}__${f.fixtureId}`, runId: run.id, fixtureId: f.fixtureId, teams: f.teams, competition: f.competition,
    status: f.status, kickoffTime: f.kickoffAt, selected: true, skipReason: null,
    preMatchAcquired: false, liveMonitored: isLive, postMatchResolved: isFinished,
    packageBuilt: false, memoryBuilt: false, influenceBuilt: false, governanceEvaluated: false, causalEvaluated: false,
    dataQuality: 'unknown', providerLimitations: [], manualDataUsed: false, notEvaluableReasons: [], createdAt: new Date().toISOString(),
  }
  try {
    const pkg = await getOrBuildPackage(run.id, f.fixtureId)
    if (pkg) {
      summary.packageBuilt = true
      summary.memoryBuilt = !!(pkg.base?.homeMemory || pkg.base?.awayMemory || pkg.base?.matchupMemory)
      summary.manualDataUsed = !!pkg.base?.base?.manualDataUsed
      const v5 = pkg.base?.base?.readinessV5
      if (v5) {
        summary.dataQuality = v5.domainReliabilityScore >= 60 ? 'rich' : v5.domainReliabilityScore > 0 ? 'partial' : 'poor'
        summary.providerLimitations = [...(v5.providerNotConfiguredDomains ?? []), ...(v5.endpointMissingDocsDomains ?? [])]
      }
    } else {
      summary.notEvaluableReasons.push('Pacote V5 indisponível (Noop/sem dados).')
    }

    // Mode dry_run: do not run governance/causal (planning/measurement only).
    if (mode() !== 'dry_run') {
      const inf = await getOrBuildInfluence(run.id, f.fixtureId, null)
      summary.influenceBuilt = !!inf
      if (flags.governance) {
        const gr = await evaluateAlertCandidate({ fixtureId: f.fixtureId, patternId: null, source: 'governance_replay', matchStatus: f.status }).catch(() => null)
        summary.governanceEvaluated = !!gr && gr.action !== 'no_decision'
        if (gr?.action === 'no_decision') summary.notEvaluableReasons.push('Governança no_decision (sem base).')
      }
      if (flags.causal && isFinished) {
        const cr = await runCausalLearningForFixture(f.fixtureId).catch(() => null)
        summary.causalEvaluated = !!cr && cr.casesAnalyzed > 0
        if (cr && cr.notEvaluableCount > 0 && cr.casesAnalyzed === cr.notEvaluableCount) summary.notEvaluableReasons.push('Casos causais não avaliáveis (vínculo fraco/outcome pendente).')
      }
    }
  } catch (e: any) {
    summary.notEvaluableReasons.push(`Erro não-fatal: ${e?.message || e}`)
    run.warnings.push(`Fixture ${f.fixtureId}: ${e?.message || e}`)
  }
  try { await repos.intelligence.saveLocalValidationFixtureSummary(summary) } catch { /* noop */ }
  return summary
}

export async function startValidationRun(plan: LocalValidationPlan): Promise<LocalValidationRun> {
  if (!isLocalValidationEnabled()) return disabledRun()
  const selected = plan.fixtures.filter(f => f.selected)
  const run = newRun('today', selected.map(f => f.fixtureId))
  run.skippedFixtures = plan.skippedCount
  try { await createRepositories().intelligence.saveLocalValidationRun(run) } catch { /* noop */ }

  const startMs = Date.now()
  const maxMs = Number(env.LOCAL_VALIDATION_MAX_DURATION_MINUTES ?? 720) * 60000
  for (const f of selected) {
    if (Date.now() - startMs > maxMs) { run.warnings.push('Duração máxima atingida — run encerrado cedo.'); break }
    await processFixture(run, { fixtureId: f.fixtureId, teams: f.teams, competition: f.competition, status: f.status, kickoffAt: f.kickoffAt })
  }

  run.completedAt = new Date().toISOString()
  run.durationMinutes = Math.round((Date.now() - startMs) / 60000)
  run.status = run.warnings.length > 0 ? 'completed_with_warnings' : 'completed'
  try { await createRepositories().intelligence.updateLocalValidationRun(run.id, run) } catch { /* noop */ }
  // Collect + persist metrics (non-fatal).
  try { await collectRunMetrics(run.id, getCacheMetrics(run.id)) } catch { /* noop */ }
  clearRunCache(run.id)
  return run
}

export async function runValidationForToday(): Promise<LocalValidationRun> {
  if (!isLocalValidationEnabled()) return disabledRun()
  const plan = await buildTodayValidationPlan()
  return startValidationRun(plan)
}

export async function runValidationForFixture(fixtureId: string): Promise<LocalValidationRun> {
  if (!isLocalValidationEnabled()) return disabledRun()
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  const run = newRun('manual', [fixtureId])
  try { await repos.intelligence.saveLocalValidationRun(run) } catch { /* noop */ }
  const startMs = Date.now()
  await processFixture(run, { fixtureId, teams: fixture ? `${fixture.homeName} x ${fixture.awayName}` : fixtureId, competition: fixture?.competition ?? 'unknown', status: fixture?.status ?? 'NS', kickoffAt: fixture?.startTime ? new Date(fixture.startTime).toISOString() : null })
  run.completedAt = new Date().toISOString()
  run.durationMinutes = Math.round((Date.now() - startMs) / 60000)
  run.status = run.warnings.length > 0 ? 'completed_with_warnings' : 'completed'
  try { await repos.intelligence.updateLocalValidationRun(run.id, run) } catch { /* noop */ }
  try { await collectRunMetrics(run.id, getCacheMetrics(run.id)) } catch { /* noop */ }
  clearRunCache(run.id)
  return run
}

export async function cancelValidationRun(runId: string): Promise<{ count: number }> {
  try { return await createRepositories().intelligence.updateLocalValidationRun(runId, { status: 'cancelled', completedAt: new Date().toISOString() }) } catch { return { count: 0 } }
}

export async function getValidationRun(runId: string): Promise<LocalValidationRun | null> {
  try { return await createRepositories().intelligence.getLocalValidationRun(runId) } catch { return null }
}
export async function listValidationRuns(limit = 50): Promise<LocalValidationRun[]> {
  try { return await createRepositories().intelligence.listLocalValidationRuns(limit) } catch { return [] }
}
