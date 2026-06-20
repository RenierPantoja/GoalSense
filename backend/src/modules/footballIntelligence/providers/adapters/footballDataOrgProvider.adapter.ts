/**
 * football-data.org adapter (B40) — honest skeleton.
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers competitions/matches/standings (no injuries/suspensions/lineups). Not wired
 * into the backend. Without FOOTBALL_DATA_KEY it is provider_not_configured.
 */
import { env } from '../../../../env.js'
import { SkeletonProviderAdapter } from './skeletonAdapter.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export function createFootballDataOrgAdapter(): SkeletonProviderAdapter {
  return new SkeletonProviderAdapter({
    providerName: 'football_data_org',
    priority: 30,
    requiresApiKey: true,
    isConfigured: () => !!env.FOOTBALL_DATA_KEY && env.FOOTBALL_DATA_KEY.length > 0,
    isEnabled: () => flag(env.ENABLE_PROVIDER_FOOTBALL_DATA),
    domains: ['today_fixtures', 'fixture_details', 'standings', 'team_form', 'head_to_head', 'competition_context'],
    rateLimitProfile: 'tight',
    costRisk: 'low',
    caps: { supportsTodayFixtures: true, supportsLineups: false, supportsInjuries: false, supportsSuspensions: false, supportsStandings: true, supportsH2H: true, supportsSquads: false, supportsPostMatch: true },
    envDocs: 'defina FOOTBALL_DATA_KEY e ENABLE_PROVIDER_FOOTBALL_DATA=true para habilitar.',
  })
}
