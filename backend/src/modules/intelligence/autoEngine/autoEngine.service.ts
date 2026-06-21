/**
 * Auto Engine Service (Phase B19) — scan orchestration + overview.
 * ─────────────────────────────────────────────────────────────────────────────
 * OFF by default. Scans live fixtures, builds ranked opportunities, persists only
 * when ENABLE_AUTO_ENGINE_WRITE=true. NEVER creates alerts, never sends Telegram,
 * never alters patterns/confidence/counters.
 */
import { env } from '../../../env.js'
import { createRepositories } from '../../../repositories/index.js'
import { buildPatternInput } from '../../command/snapshotToPatternInput.js'
import { deriveMatchContext } from '../../command/matchContext.service.js'
import { normalizeKeyPart } from '../learning/contextKey.util.js'
import { scanFixture, type ProfileMaps } from './autoOpportunityScanner.service.js'
import { evaluateOpportunitiesForRun } from './autoAlertPolicyEvaluation.service.js'
import { isAutoAlertPolicyEnabled } from './autoAlertPolicyConfig.service.js'
import { rankOpportunities } from './utils/autoSignalRanking.util.js'
import { autoRunId } from './utils/autoSignalId.util.js'
import { linkOpportunitySnapshot } from '../evidence/evidenceLineage.service.js'
import { evaluateOpportunity, isGovernanceEnabled } from '../../footballIntelligence/governance/alertDecisionGovernor.service.js'
import { resolveSessionAttribution, recordAttributionEvent } from '../../validation/liveValidationAttribution.service.js'
import { linkRecordToSession } from '../../validation/liveValidationRecordIndex.service.js'
import { incrementSessionMetric } from '../../validation/liveValidationSessionMetrics.service.js'
import type { AutoEngineRun, AutoEngineRunConfig, AutoOpportunity, AutoEngineOverview } from './autoEngine.types.js'
import type { SampleQuality } from '../contracts/learning.types.js'

const DEFAULT_USER = 'default'
const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT']

function flag(v: unknown): boolean { return String(v).toLowerCase() === 'true' }
export function isAutoEngineEnabled(): boolean { return flag(env.ENABLE_AUTO_ENGINE) }
export function isAutoEngineWriteEnabled(): boolean { return flag(env.ENABLE_AUTO_ENGINE_WRITE) }
export function isAutoEngineSchedulerEnabled(): boolean { return flag(env.ENABLE_AUTO_ENGINE_SCHEDULER) && env.APP_ENV !== 'test' }
export function isAutoEngineToAlertsEnabled(): boolean { return flag(env.ENABLE_AUTO_ENGINE_TO_ALERTS) }

function toDate(v: any): Date { return v instanceof Date ? v : new Date(v) }

export interface ScanOptions { dryRun?: boolean; limit?: number; persist?: boolean }

export async function runAutoEngineScan(opts: ScanOptions = {}): Promise<AutoEngineRun> {
  const now = new Date().toISOString()
  const enabled = isAutoEngineEnabled()
  const write = isAutoEngineWriteEnabled() && opts.persist === true && !opts.dryRun
  const config: AutoEngineRunConfig = {
    maxFixtures: Math.min(Math.max(1, opts.limit || env.AUTO_ENGINE_MAX_FIXTURES_PER_RUN), 60),
    minSampleQuality: env.AUTO_ENGINE_MIN_SAMPLE_QUALITY as SampleQuality,
    minScore: env.AUTO_ENGINE_MIN_SCORE,
    maxOppsPerFixture: env.AUTO_ENGINE_MAX_OPPS_PER_FIXTURE,
    write,
    dryRun: !!opts.dryRun,
  }
  const run: AutoEngineRun = {
    id: autoRunId(), startedAt: now, finishedAt: null, status: 'running', enabled, write, config,
    fixturesScanned: 0, opportunitiesFound: 0, strong: 0, watch: 0, candidate: 0, blocked: 0, blockReasons: {}, notes: [],
  }

  if (!enabled) {
    run.status = 'skipped'; run.finishedAt = new Date().toISOString()
    run.notes.push('ENABLE_AUTO_ENGINE=false — scan não executado.')
    return run
  }

  const repos = createRepositories()
  if (write) { try { await repos.intelligence.createAutoEngineRun(run) } catch { /* never block */ } }

  try {
    const fixtures = await repos.fixtures.listLive(LIVE_STATUSES, config.maxFixtures)
    // Load learning context once.
    const [patternProfiles, competitionProfiles, teamProfiles, activePatternsRaw] = await Promise.all([
      repos.intelligence.listPatternLearningProfiles(500).catch(() => []),
      repos.intelligence.listCompetitionLearningProfiles(500).catch(() => []),
      repos.intelligence.listTeamLearningProfiles(500).catch(() => []),
      repos.patterns.listActive(DEFAULT_USER).catch(() => []),
    ])
    const profiles: ProfileMaps = {
      patternById: new Map(patternProfiles.map((p: any) => [p.scopeKey, p])),
      competitionByKey: new Map(competitionProfiles.map((c: any) => [normalizeKeyPart(c.scopeKey), c])),
      teamByKey: new Map(teamProfiles.map((t: any) => [normalizeKeyPart(t.scopeKey), t])),
    }
    const activePatterns = (activePatternsRaw as any[]).map(p => ({ id: p.id, name: p.name }))
    if (patternProfiles.length === 0 && competitionProfiles.length === 0) run.notes.push('Sem perfis de aprendizado (B13) — contexto limitado.')

    const allOpps: AutoOpportunity[] = []
    for (const fx of fixtures) {
      const snapshot = await repos.liveSnapshots.findLatestByFixture(fx.id)
      if (!snapshot) continue
      run.fixturesScanned++
      const snapshotAgeMs = Date.now() - toDate((snapshot as any).capturedAt).getTime()
      const input = buildPatternInput(fx as any, snapshot as any)
      const context = deriveMatchContext(fx.competition)
      // Recent manual alert guard (read-only).
      let hasRecentManualAlert = false
      try {
        const existing = await repos.alerts.findByFixtureIds(fx.id)
        hasRecentManualAlert = Array.isArray(existing) && existing.length > 0
      } catch { /* ignore */ }

      const opps = scanFixture({
        runId: run.id, fixtureId: fx.id, fixtureLabel: `${fx.homeName} vs ${fx.awayName}`,
        config, input, context, profiles, activePatterns, hasRecentManualAlert, snapshotAgeMs,
      })
      // B34: attach the EXACT evidence snapshot the scan evaluated (no recompute).
      const evSnapId = (snapshot as any)?.id ? String((snapshot as any).id) : null
      const evSnapAt = (snapshot as any)?.capturedAt ? toDate((snapshot as any).capturedAt).toISOString() : null
      const oppAttribution = await resolveSessionAttribution(fx.id)
      for (const o of opps) {
        o.evidenceSnapshotId = evSnapId; o.evidenceSnapshotCapturedAt = evSnapAt
        if (oppAttribution) { o.validationSessionId = oppAttribution.validationSessionId; o.sessionAttachedAt = oppAttribution.sessionAttachedAt }
        allOpps.push(o)
      }
    }

    const ranked = rankOpportunities(allOpps)
    for (const o of ranked) {
      run.opportunitiesFound++
      if (o.status === 'strong') run.strong++
      else if (o.status === 'watch') run.watch++
      else if (o.status === 'candidate') run.candidate++
      else if (o.status === 'blocked') { run.blocked++; for (const br of o.riskGate.blockReasons) run.blockReasons[br] = (run.blockReasons[br] || 0) + 1 }
    }

    if (write) {
      for (const o of ranked) { try { await repos.intelligence.upsertAutoOpportunity(o) } catch { /* never block */ } }
      // ── B47: Alert Decision Governance shadow for opportunities (advisory; never blocks) ──
      if (isGovernanceEnabled()) {
        for (const o of ranked) { try { void evaluateOpportunity(o.id) } catch { /* non-blocking */ } }
      }
      // B34: non-fatal exact evidence links for opportunities with a real snapshotId.
      if (String(env.ENABLE_EVIDENCE_LINEAGE).toLowerCase() === 'true') {
        for (const o of ranked) {
          void linkOpportunitySnapshot({
            fixtureId: o.fixtureId, opportunityId: o.id, minute: o.minute,
            snapshotId: o.evidenceSnapshotId ?? null, capturedAt: o.evidenceSnapshotCapturedAt ?? null,
            validationSessionId: (o as any).validationSessionId ?? null,
          })
          if ((o as any).validationSessionId) {
            void recordAttributionEvent({ sessionId: (o as any).validationSessionId, type: 'auto_opportunity_created', fixtureId: o.fixtureId, source: 'auto_engine', message: `Oportunidade ${o.opportunityType} (${o.status}, score ${o.score}).` })
            void linkRecordToSession({ validationSessionId: (o as any).validationSessionId, sessionName: (o as any).sessionName ?? null, recordType: 'auto_opportunity', recordId: o.id, fixtureId: o.fixtureId, opportunityId: o.id, snapshotId: o.evidenceSnapshotId ?? null, source: 'auto_engine' })
            incrementSessionMetric((o as any).validationSessionId, 'opportunitiesCreated', 1)
          }
        }
      }
    } else {
      run.notes.push('Dry-run / WRITE=false — nada persistido.')
    }

    // ── B25: optional Auto Alert Policy evaluation (shadow-first; never fatal) ──
    if (write && isAutoAlertPolicyEnabled()) {
      try {
        const ids = ranked.filter(o => o.status === 'strong' || o.status === 'watch').map(o => o.id)
        const pol = await evaluateOpportunitiesForRun(ids)
        run.notes.push(`Política avaliada: ${pol.evaluated} (auto:${pol.autoCreated} shadow:${pol.shadow} bloq:${pol.blocked}).`)
      } catch (e: any) {
        run.notes.push(`Avaliação de política falhou (não bloqueante): ${e?.message || e}`)
      }
    }

    run.status = 'completed'
    run.finishedAt = new Date().toISOString()
    if (write) { try { await repos.intelligence.updateAutoEngineRun(run.id, run) } catch { /* */ } }
    // Stash the ranked opportunities on the returned object (not persisted unless write).
    ;(run as any).opportunities = ranked
    return run
  } catch (e: any) {
    run.status = 'failed'; run.finishedAt = new Date().toISOString(); run.notes.push(`Erro: ${e?.message || e}`)
    if (write) { try { await repos.intelligence.updateAutoEngineRun(run.id, run) } catch { /* */ } }
    return run
  }
}

export async function getAutoEngineOverview(): Promise<AutoEngineOverview> {
  const repos = createRepositories()
  const [lastRun, opps] = await Promise.all([
    repos.intelligence.getLatestAutoEngineRun().catch(() => null),
    repos.intelligence.listAutoOpportunities({ limit: 200 }).catch(() => [] as AutoOpportunity[]),
  ])
  const byType = new Map<string, number>()
  const byDataQuality = new Map<string, number>()
  const blockReasons = new Map<string, number>()
  let strong = 0, watch = 0, candidate = 0, blocked = 0
  for (const o of opps) {
    byType.set(o.opportunityType, (byType.get(o.opportunityType) || 0) + 1)
    byDataQuality.set(o.evidence.dataQuality, (byDataQuality.get(o.evidence.dataQuality) || 0) + 1)
    if (o.status === 'strong') strong++
    else if (o.status === 'watch') watch++
    else if (o.status === 'candidate') candidate++
    else if (o.status === 'blocked') { blocked++; for (const br of o.riskGate.blockReasons) blockReasons.set(br, (blockReasons.get(br) || 0) + 1) }
  }
  const limitations: string[] = []
  if (!isAutoEngineEnabled()) limitations.push('Motor automático desativado (ENABLE_AUTO_ENGINE=false).')
  if (!isAutoEngineWriteEnabled()) limitations.push('Persistência desativada (ENABLE_AUTO_ENGINE_WRITE=false) — modo dry-run.')
  if (opps.length === 0) limitations.push('Sem oportunidades registradas ainda.')
  limitations.push('Sem odds, sem aposta, sem alerta automático — apenas oportunidades observáveis.')

  return {
    enabled: isAutoEngineEnabled(),
    writeEnabled: isAutoEngineWriteEnabled(),
    schedulerEnabled: isAutoEngineSchedulerEnabled(),
    toAlertsEnabled: isAutoEngineToAlertsEnabled(),
    lastRun,
    opportunitiesTotal: opps.length,
    strong, watch, candidate, blocked,
    topOpportunityTypes: [...byType.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    dataQualityBreakdown: Object.fromEntries(byDataQuality),
    blockReasons: Object.fromEntries(blockReasons),
    limitations,
    latestOpportunities: rankOpportunities(opps).slice(0, 20),
    generatedAt: new Date().toISOString(),
  }
}
