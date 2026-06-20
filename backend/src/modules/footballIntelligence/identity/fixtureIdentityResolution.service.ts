/**
 * Fixture Identity Resolution (B42).
 * ─────────────────────────────────────────────────────────────────────────────
 * Compares ESPN fixtures vs an external provider's same-day fixtures and produces
 * candidates + mappings. Auto-confirms ONLY safe high-confidence matches; ambiguous
 * (multiple close candidates / swapped / high delta) require operator review. Never
 * guesses ids; rejected mappings are not auto-reused unless the fingerprint changes.
 */
import { randomUUID } from 'node:crypto'
import { env } from '../../../env.js'
import { createRepositories } from '../../../repositories/index.js'
import { getAdapter } from '../providers/providerRegistry.service.js'
import {
  scoreFixtureCandidate, classifyCandidateScore, buildFixtureIdentityFingerprint, explainCandidate, type FixtureSide,
} from './providerIdentity.util.js'
import type {
  FixtureIdentityCandidate, ProviderEntityMapping, FixtureIdentityResolutionRun, ConfidenceBand, ProviderEntityMappingStrength,
} from './providerIdentity.types.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'
export function isResolutionEnabled(): boolean { return flag(env.ENABLE_FIXTURE_IDENTITY_RESOLUTION) }
function classifyOpts() {
  return {
    highThreshold: Number(env.FIXTURE_IDENTITY_HIGH_CONFIDENCE_THRESHOLD) || 0.88,
    mediumThreshold: Number(env.FIXTURE_IDENTITY_MEDIUM_CONFIDENCE_THRESHOLD) || 0.70,
    maxKickoffDeltaMinutes: Number(env.FIXTURE_IDENTITY_MAX_KICKOFF_DELTA_MINUTES) || 120,
    requireCompetitionMatch: flag(env.FIXTURE_IDENTITY_REQUIRE_COMPETITION_MATCH),
  }
}

const LIVE_OR_SCHEDULED = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'NS', 'FT', 'AET', 'PEN']
function sameDay(a: Date, b: Date): boolean { return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate() }

interface SecondaryFixture { id: string; home: string; away: string; competition: string; country: string | null; kickoff: string | null }

async function loadSecondaryFixtures(provider: string, date: string): Promise<{ fixtures: SecondaryFixture[]; configured: boolean }> {
  const adapter = getAdapter(provider)
  if (!adapter || !adapter.isConfigured()) return { fixtures: [], configured: false }
  const res = await adapter.fetchDomain('today_fixtures', { date }).catch(() => null)
  const list = (res?.canonicalData as any)?.fixtures
  return { fixtures: Array.isArray(list) ? list : [], configured: true }
}

function toSide(home: string, away: string, competition: string, country: string | null, kickoff: string | null): FixtureSide {
  return { home, away, competition, country, kickoff }
}

export async function buildCandidatesForFixture(primaryFixtureId: string, targetProvider = 'api_football'): Promise<FixtureIdentityCandidate[]> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(primaryFixtureId).catch(() => null)
  if (!fixture) return []
  const date = fixture.startTime ? new Date(fixture.startTime).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  const { fixtures } = await loadSecondaryFixtures(targetProvider, date)
  return buildCandidatesFor(fixture, fixtures, targetProvider)
}

function buildCandidatesFor(primary: any, secondary: SecondaryFixture[], provider: string): FixtureIdentityCandidate[] {
  const opts = classifyOpts()
  const primarySide = toSide(primary.homeName, primary.awayName, primary.competition, null, primary.startTime)
  const out: FixtureIdentityCandidate[] = []
  for (const s of secondary) {
    const c = scoreFixtureCandidate(primarySide, toSide(s.home, s.away, s.competition, s.country, s.kickoff))
    if (c.score <= 0) continue
    const band = classifyCandidateScore(c, opts)
    out.push({
      primaryFixtureId: String(primary.id), secondaryProvider: provider, secondaryProviderFixtureId: s.id,
      primaryLabel: `${primary.homeName} vs ${primary.awayName}`, secondaryLabel: `${s.home} vs ${s.away}`,
      normalizedHome: s.home, normalizedAway: s.away, normalizedCompetition: s.competition,
      kickoffDeltaMinutes: c.kickoffDeltaMinutes, sameDate: c.sameDate, sameHomeAway: c.sameHomeAway, swappedHomeAway: c.swappedHomeAway,
      competitionMatch: c.competitionMatch, countryMatch: c.countryMatch, seasonMatch: 'unknown',
      score: Math.round(c.score * 1000) / 1000, confidenceBand: band, reasons: c.reasons, warnings: c.warnings,
      limitations: band === 'high' ? [] : ['Confiança não-alta — requer revisão antes de desbloquear fetch crítico.'],
    })
  }
  return out.sort((a, b) => b.score - a.score)
}

function strengthFromBand(band: ConfidenceBand): ProviderEntityMappingStrength {
  return band === 'high' ? 'strong_composite' : band === 'medium' ? 'medium_composite' : band === 'low' ? 'weak_name_match' : 'unknown'
}

function candidateToMapping(primaryProvider: string, c: FixtureIdentityCandidate, status: ProviderEntityMapping['status']): ProviderEntityMapping {
  const ts = new Date().toISOString()
  const fingerprint = buildFixtureIdentityFingerprint({ primaryProvider, primaryFixtureId: c.primaryFixtureId, secondaryProvider: c.secondaryProvider, secondaryProviderFixtureId: c.secondaryProviderFixtureId })
  return {
    id: `pem_${fingerprint.slice(4)}`,
    identityType: 'fixture', canonicalEntityId: c.primaryFixtureId,
    primaryProvider, primaryProviderEntityId: c.primaryFixtureId,
    secondaryProvider: c.secondaryProvider, secondaryProviderEntityId: c.secondaryProviderFixtureId,
    status, strength: strengthFromBand(c.confidenceBand), confidenceScore: c.score, confidenceBand: c.confidenceBand,
    matchedFields: c.reasons, conflictingFields: c.warnings, fingerprint, limitations: c.limitations,
    createdAt: ts, updatedAt: ts, confirmedAt: status === 'auto_confirmed' ? ts : null, confirmedBy: status === 'auto_confirmed' ? 'system_auto' : null,
    rejectedAt: null, rejectedBy: null, expiresAt: null,
    audit: [{ at: ts, by: status === 'auto_confirmed' ? 'system_auto' : null, action: status === 'auto_confirmed' ? 'auto_confirmed' : 'created' }],
  }
}

export async function resolveFixtureIdentity(primaryFixtureId: string, targetProvider = 'api_football'): Promise<{ mapping: ProviderEntityMapping | null; candidates: FixtureIdentityCandidate[]; status: string }> {
  const repos = createRepositories()
  const candidates = await buildCandidatesForFixture(primaryFixtureId, targetProvider)
  if (candidates.length === 0) return { mapping: null, candidates, status: 'no_candidates' }

  // Respect a prior rejection on the same fingerprint.
  const existing = await repos.intelligence.listProviderMappingsForEntity('fixture', primaryFixtureId, 50).catch(() => [])
  const top = candidates[0]
  const second = candidates[1]
  const opts = classifyOpts()
  const competing = !!second && (top.score - second.score) < 0.06 && second.confidenceBand !== 'unknown'

  let status: ProviderEntityMapping['status']
  if (top.confidenceBand === 'high' && flag(env.FIXTURE_IDENTITY_AUTO_CONFIRM) && !competing && top.sameDate && !top.swappedHomeAway && (top.kickoffDeltaMinutes == null || top.kickoffDeltaMinutes <= opts.maxKickoffDeltaMinutes)) {
    status = 'auto_confirmed'
  } else if (competing || top.swappedHomeAway || top.confidenceBand === 'medium') {
    status = 'ambiguous'
  } else {
    status = 'candidate'
  }

  const mapping = candidateToMapping('espn', top, status)
  const priorReject = existing.find(m => m.fingerprint === mapping.fingerprint && m.status === 'rejected')
  if (priorReject) return { mapping: priorReject, candidates, status: 'previously_rejected' }

  try { await repos.intelligence.saveProviderEntityMapping(mapping) } catch { /* non-fatal */ }
  return { mapping, candidates, status }
}

export async function buildCandidatesForToday(date: string = new Date().toISOString().slice(0, 10), targetProvider = 'api_football'): Promise<FixtureIdentityResolutionRun> {
  const repos = createRepositories()
  const run: FixtureIdentityResolutionRun = {
    id: `fir_${randomUUID()}`, date, primaryProvider: 'espn', secondaryProvider: targetProvider,
    startedAt: new Date().toISOString(), completedAt: null, primaryFixtures: 0, secondaryFixtures: 0,
    candidatesGenerated: 0, autoConfirmed: 0, ambiguous: 0, rejected: 0, errors: [], status: 'completed', limitations: [],
  }
  if (!isResolutionEnabled()) { run.status = 'disabled'; run.completedAt = new Date().toISOString(); run.limitations.push('Resolução desabilitada (ENABLE_FIXTURE_IDENTITY_RESOLUTION=false).'); await repos.intelligence.createFixtureIdentityResolutionRun(run).catch(() => {}); return run }

  const { fixtures: secondary, configured } = await loadSecondaryFixtures(targetProvider, date)
  if (!configured) { run.status = 'provider_not_configured'; run.completedAt = new Date().toISOString(); run.limitations.push(`Provider ${targetProvider} não configurado — não chamado.`); await repos.intelligence.createFixtureIdentityResolutionRun(run).catch(() => {}); return run }

  let espn: any[] = []
  try { espn = await repos.fixtures.listLive(LIVE_OR_SCHEDULED, 300) } catch { espn = [] }
  const target = new Date(date)
  const todays = espn.filter(f => f.startTime && sameDay(new Date(f.startTime), target))
  run.primaryFixtures = todays.length
  run.secondaryFixtures = secondary.length

  await repos.intelligence.createFixtureIdentityResolutionRun(run).catch(() => {})
  for (const fx of todays) {
    try {
      const candidates = buildCandidatesFor(fx, secondary, targetProvider)
      if (candidates.length === 0) continue
      run.candidatesGenerated += candidates.length
      const res = await resolveFixtureIdentity(String(fx.id), targetProvider)
      if (res.status === 'auto_confirmed') run.autoConfirmed++
      else if (res.status === 'ambiguous') run.ambiguous++
    } catch (e: any) { run.errors.push(String(e?.message || e).slice(0, 60)) }
  }
  if (run.ambiguous > 0 || run.errors.length > 0) run.status = 'completed_with_limitations'
  run.completedAt = new Date().toISOString()
  await repos.intelligence.updateFixtureIdentityResolutionRun(run.id, run).catch(() => {})
  return run
}

export async function getBestMappingForFixture(primaryFixtureId: string, provider = 'api_football'): Promise<ProviderEntityMapping | null> {
  const repos = createRepositories()
  const all = await repos.intelligence.listProviderMappingsForEntity('fixture', primaryFixtureId, 50).catch(() => [])
  const forProvider = all.filter(m => m.secondaryProvider === provider && m.status !== 'rejected' && m.status !== 'invalidated')
  if (forProvider.length === 0) return null
  const order: Record<string, number> = { manually_confirmed: 0, auto_confirmed: 1, ambiguous: 2, candidate: 3 }
  return forProvider.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.confidenceScore - a.confidenceScore)[0]
}

export async function confirmMapping(mappingId: string, user: string | null): Promise<{ ok: boolean }> {
  const repos = createRepositories()
  const m = await repos.intelligence.getProviderEntityMapping(mappingId).catch(() => null)
  if (!m) return { ok: false }
  const ts = new Date().toISOString()
  const res = await repos.intelligence.updateProviderEntityMappingStatus(mappingId, {
    status: 'manually_confirmed', strength: 'manual_confirmed', confirmedAt: ts, confirmedBy: user, updatedAt: ts,
    audit: [...(m.audit || []), { at: ts, by: user, action: 'manually_confirmed' }],
  }).catch(() => ({ count: 0 }))
  return { ok: res.count > 0 }
}

export async function rejectMapping(mappingId: string, user: string | null): Promise<{ ok: boolean }> {
  const repos = createRepositories()
  const m = await repos.intelligence.getProviderEntityMapping(mappingId).catch(() => null)
  if (!m) return { ok: false }
  const ts = new Date().toISOString()
  const res = await repos.intelligence.updateProviderEntityMappingStatus(mappingId, {
    status: 'rejected', rejectedAt: ts, rejectedBy: user, updatedAt: ts,
    audit: [...(m.audit || []), { at: ts, by: user, action: 'rejected' }],
  }).catch(() => ({ count: 0 }))
  return { ok: res.count > 0 }
}

export async function explainFixtureMapping(primaryFixtureId: string, provider = 'api_football'): Promise<string> {
  const m = await getBestMappingForFixture(primaryFixtureId, provider)
  if (!m) return `Sem mapping ${provider} para a fixture (use "Resolver identidade").`
  return `Mapping ${m.status} (${m.confidenceBand}, score ${m.confidenceScore}) → ${provider} id ${m.secondaryProviderEntityId ?? 'n/d'}.`
}

export { explainCandidate }
