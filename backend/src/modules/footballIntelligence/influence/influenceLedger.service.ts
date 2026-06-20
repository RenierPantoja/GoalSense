/**
 * Influence Ledger + Orchestrator (B46 / Bloco 3).
 * ─────────────────────────────────────────────────────────────────────────────
 * Ties extraction → sensitivity → rule engine → aggregator → conflict engine into a
 * single influence reading, and persists an audit entry + build run. Read-only
 * composition (`composeInfluence`) is reused by Package V5 / Readiness V7 / Precheck
 * V7 WITHOUT persisting. Advisory only; never changes score/confidence/patterns/alerts.
 * Manual-first; flag-gated. Persists only under Firebase (Noop accepts but stores nothing).
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import { buildMatchIntelligencePackageV4, type MatchIntelligencePackageV4 } from '../matchIntelligencePackageV4.service.js'
import { extractVariablesForFixture } from './variableExtraction.service.js'
import { getPatternSensitivityProfile } from './patternSensitivity.service.js'
import { assessVariables } from './variableInfluenceRuleEngine.service.js'
import { aggregateInfluences, buildInfluenceSummary } from './influenceAggregator.service.js'
import { detectVariableConflicts } from './variableConflictEngine.service.js'
import type {
  InfluenceLedgerEntry, InfluenceBuildRun, VariableInfluenceInput,
  VariableInfluenceAssessment, InfluenceAggregate, VariableConflict, PatternVariableSensitivityProfile,
} from './variableInfluence.types.js'

export function isInfluenceEngineEnabled(): boolean { return String(env.ENABLE_VARIABLE_INFLUENCE_ENGINE).toLowerCase() === 'true' }
export function isInfluenceBuildEnabled(): boolean { return String(env.ENABLE_VARIABLE_INFLUENCE_BUILD).toLowerCase() === 'true' }
export function influenceMode(): 'observe' | 'enforce' { return String(env.VARIABLE_INFLUENCE_MODE) === 'enforce' ? 'enforce' : 'observe' }

export interface ComposedInfluence {
  fixtureId: string
  patternId: string | null
  sensitivity: PatternVariableSensitivityProfile
  variables: VariableInfluenceInput[]
  assessments: VariableInfluenceAssessment[]
  aggregate: InfluenceAggregate
  conflicts: VariableConflict[]
  summary: string
}

function patternHintFromId(patternId: string | null): { id?: string; name?: string; type?: string } {
  return patternId ? { id: patternId, name: patternId, type: patternId } : { id: 'fixture_level', name: 'fixture_level' }
}

/** Pure-ish composition (no persistence). Optionally reuse a prebuilt V4 package. */
export async function composeInfluence(fixtureId: string, patternId: string | null = null, prebuilt?: MatchIntelligencePackageV4 | null, patternHint?: { id?: string; name?: string; type?: string }): Promise<ComposedInfluence | null> {
  const pkg = prebuilt ?? await buildMatchIntelligencePackageV4(fixtureId).catch(() => null)
  if (!pkg) return null
  const sensitivity = getPatternSensitivityProfile(patternHint ?? patternHintFromId(patternId))
  const variables = await extractVariablesForFixture(fixtureId, patternId, pkg).catch(() => [])
  const assessments = assessVariables(variables, sensitivity)
  const aggregate = aggregateInfluences(fixtureId, patternId, assessments)
  const conflicts = detectVariableConflicts(fixtureId, patternId, variables, assessments)
  return { fixtureId, patternId, sensitivity, variables, assessments, aggregate, conflicts, summary: buildInfluenceSummary(aggregate) }
}

let seq = 0
function runId(): string { seq = (seq + 1) % 1e9; return `ibr_${Date.now().toString(36)}_${seq.toString(36)}` }
function entryId(fixtureId: string, patternId: string | null): string { return `ile_${fixtureId}__${patternId ?? 'fixture'}` }

async function persistEntry(composed: ComposedInfluence, decisionInputsCreated: number): Promise<InfluenceLedgerEntry> {
  const entry: InfluenceLedgerEntry = {
    id: entryId(composed.fixtureId, composed.patternId),
    fixtureId: composed.fixtureId, patternId: composed.patternId, generatedAt: new Date().toISOString(),
    packageVersion: 'v5',
    // Keep payload modest: store variables + assessments + aggregate (no giant nested package).
    variables: composed.variables, assessments: composed.assessments, aggregate: composed.aggregate,
    decisionInputsCreated, source: 'derived_context',
    limitations: ['Influência advisory; influenceScore não é probabilidade; conflitos explícitos.'],
  }
  try { await createRepositories().intelligence.saveInfluenceLedgerEntry(entry) } catch { /* noop */ }
  return entry
}

function newRun(scope: InfluenceBuildRun['scope'], fixtureId: string, patternId: string | null): InfluenceBuildRun {
  return { id: runId(), scope, fixtureId, patternId, status: 'running', startedAt: new Date().toISOString(), finishedAt: null, variablesExtracted: 0, assessmentsBuilt: 0, conflictsFound: 0, notes: [], error: null }
}
async function finishRun(run: InfluenceBuildRun, patch: Partial<InfluenceBuildRun>): Promise<InfluenceBuildRun> {
  const finished: InfluenceBuildRun = { ...run, ...patch, status: patch.status || 'completed', finishedAt: new Date().toISOString() }
  try { await createRepositories().intelligence.updateInfluenceBuildRun(run.id, finished) } catch { /* noop */ }
  return finished
}
function disabledRun(scope: InfluenceBuildRun['scope'], fixtureId: string, patternId: string | null): InfluenceBuildRun {
  return { ...newRun(scope, fixtureId, patternId), status: 'skipped', finishedAt: new Date().toISOString(), notes: ['ENABLE_VARIABLE_INFLUENCE_BUILD=false — build desligado (sem efeito).'] }
}

export async function buildFixtureInfluence(fixtureId: string): Promise<{ run: InfluenceBuildRun; entry: InfluenceLedgerEntry | null }> {
  if (!isInfluenceBuildEnabled()) return { run: disabledRun('fixture', fixtureId, null), entry: null }
  const run = newRun('fixture', fixtureId, null)
  try { await createRepositories().intelligence.createInfluenceBuildRun(run) } catch { /* noop */ }
  const composed = await composeInfluence(fixtureId, null).catch(() => null)
  if (!composed) return { run: await finishRun(run, { status: 'failed', error: 'Pacote V4 indisponível.' }), entry: null }
  const entry = await persistEntry(composed, 0)
  const finished = await finishRun(run, { variablesExtracted: composed.variables.length, assessmentsBuilt: composed.assessments.length, conflictsFound: composed.conflicts.length, notes: [composed.summary] })
  return { run: finished, entry }
}

export async function buildPatternInfluence(fixtureId: string, patternId: string, patternHint?: { id?: string; name?: string; type?: string }): Promise<{ run: InfluenceBuildRun; entry: InfluenceLedgerEntry | null }> {
  if (!isInfluenceBuildEnabled()) return { run: disabledRun('pattern', fixtureId, patternId), entry: null }
  const run = newRun('pattern', fixtureId, patternId)
  try { await createRepositories().intelligence.createInfluenceBuildRun(run) } catch { /* noop */ }
  const composed = await composeInfluence(fixtureId, patternId, null, patternHint).catch(() => null)
  if (!composed) return { run: await finishRun(run, { status: 'failed', error: 'Pacote V4 indisponível.' }), entry: null }
  const entry = await persistEntry(composed, 0)
  const finished = await finishRun(run, { variablesExtracted: composed.variables.length, assessmentsBuilt: composed.assessments.length, conflictsFound: composed.conflicts.length, notes: [composed.summary] })
  return { run: finished, entry }
}

export async function getInfluenceLedgerEntry(fixtureId: string, patternId: string | null = null): Promise<InfluenceLedgerEntry | null> {
  try { return await createRepositories().intelligence.getInfluenceLedgerEntry(entryId(fixtureId, patternId)) } catch { return null }
}
export async function listInfluenceBuildRuns(limit = 50): Promise<InfluenceBuildRun[]> {
  try { return await createRepositories().intelligence.listInfluenceBuildRuns(limit) } catch { return [] }
}
