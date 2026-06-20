/**
 * ESPN adapter (B40) — the only truly wired provider.
 * ─────────────────────────────────────────────────────────────────────────────
 * Serves today_fixtures / live_events / live_stats / post_match_stats from data the
 * backend ALREADY ingested (no extra provider call beyond the existing live worker).
 * Every pre-match domain it does not cover returns provider_not_supported. Never
 * fabricates lineups/injuries/suspensions.
 */
import { createRepositories } from '../../../../repositories/index.js'
import type { AcquisitionDomain, DomainFetchResult, FetchParams, ProviderAdapter, ProviderRegistryEntry } from '../provider.types.js'

const SUPPORTED: AcquisitionDomain[] = ['today_fixtures', 'fixture_details', 'live_events', 'live_stats', 'post_match_stats', 'competition_context']
const LIVE = ['1H', '2H', 'HT', 'ET', 'BT', 'P']

function result(domain: AcquisitionDomain, partial: Partial<DomainFetchResult>): DomainFetchResult {
  return {
    domain, provider: 'espn', availability: 'unavailable', freshness: 'unknown', dataQuality: 'unavailable',
    fetchedAt: new Date().toISOString(), canonicalData: null, payloadSummary: '', reasons: [], limitations: [],
    providerCandidatesTried: ['espn'], ...partial,
  }
}

export class EspnFootballProviderAdapter implements ProviderAdapter {
  providerName = 'espn'
  isConfigured(): boolean { return true } // public ESPN, no key
  isEnabled(): boolean { return true }
  supportedDomains(): AcquisitionDomain[] { return SUPPORTED }

  describe(): ProviderRegistryEntry {
    return {
      providerName: 'espn', enabled: true, configured: true, priority: 10, domains: SUPPORTED,
      rateLimitProfile: 'moderate', costRisk: 'none', requiresApiKey: false,
      supportsTodayFixtures: true, supportsLineups: false, supportsInjuries: false, supportsSuspensions: false,
      supportsStandings: false, supportsH2H: false, supportsSquads: false, supportsPostMatch: true,
      limitations: ['ESPN cobre placar/stats/eventos ao vivo; não cobre escalação/lesão/suspensão/tabela/H2H.'],
    }
  }

  async fetchDomain(domain: AcquisitionDomain, params: FetchParams): Promise<DomainFetchResult> {
    if (!SUPPORTED.includes(domain)) {
      return result(domain, { availability: 'provider_not_supported', reasons: [`ESPN não cobre ${domain}.`], limitations: ['ESPN não coleta esse domínio pré-jogo.'] })
    }
    const repos = createRepositories()
    try {
      if (domain === 'today_fixtures') {
        const rows = await repos.fixtures.listLive(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'NS', 'FT', 'AET', 'PEN'], 300).catch(() => [])
        return result(domain, { availability: rows.length ? 'available' : 'unavailable', freshness: 'near_realtime', dataQuality: rows.length ? 'partial' : 'unavailable', canonicalData: { count: rows.length }, payloadSummary: `${rows.length} fixtures ingeridas`, reasons: rows.length ? [] : ['Sem fixtures ingeridas (worker ESPN pode estar off).'] })
      }
      // fixture-scoped domains use the latest snapshot.
      if (!params.fixtureId) return result(domain, { availability: 'unavailable', reasons: ['fixtureId ausente.'] })
      const snap = await repos.liveSnapshots.findLatestByFixture(params.fixtureId).catch(() => null)
      if (domain === 'competition_context') {
        const fx = await repos.fixtures.findById(params.fixtureId).catch(() => null)
        return result(domain, { availability: fx ? 'partial' : 'unavailable', freshness: 'pre_match_only', dataQuality: 'partial', canonicalData: fx ? { competition: fx.competition } : null, payloadSummary: fx ? `competição ${fx.competition}` : 'sem fixture', limitations: ['Contexto de competição é heurístico (nome).'] })
      }
      if (!snap) return result(domain, { availability: (domain === 'live_events' || domain === 'live_stats') ? 'not_available_yet' : 'unavailable', reasons: ['Sem snapshot para a fixture.'] })
      const hasStats = !!snap.statsJson
      const isLive = LIVE.includes(snap.status)
      if (domain === 'live_stats' || domain === 'post_match_stats') {
        return result(domain, { availability: hasStats ? 'available' : 'partial', freshness: isLive ? 'realtime' : 'fresh', dataQuality: hasStats ? 'partial' : 'poor', canonicalData: { hasStats }, payloadSummary: hasStats ? 'stats de equipe disponíveis' : 'sem stats', limitations: ['Stats de equipe apenas (ESPN).'] })
      }
      // live_events / fixture_details
      return result(domain, { availability: 'available', freshness: isLive ? 'realtime' : 'fresh', dataQuality: 'partial', canonicalData: { minute: snap.minute, score: { home: snap.scoreHome, away: snap.scoreAway } }, payloadSummary: `min ${snap.minute ?? '?'} ${snap.scoreHome}-${snap.scoreAway}` })
    } catch (e: any) {
      return result(domain, { availability: 'unavailable', reasons: [`Falha não-fatal: ${String(e?.message || e).slice(0, 60)}`] })
    }
  }
}
