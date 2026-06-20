/**
 * SportMonks adapter (B40) — honest skeleton.
 * ─────────────────────────────────────────────────────────────────────────────
 * SportMonks CAN cover lineups/injuries/squads/standings, but there is no SportMonks
 * code or env in the project today. Without SPORTMONKS_API_KEY it is
 * provider_not_configured and never called.
 */
import { env } from '../../../../env.js'
import { SkeletonProviderAdapter } from './skeletonAdapter.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export function createSportmonksAdapter(): SkeletonProviderAdapter {
  return new SkeletonProviderAdapter({
    providerName: 'sportmonks',
    priority: 25,
    requiresApiKey: true,
    isConfigured: () => !!env.SPORTMONKS_API_KEY && env.SPORTMONKS_API_KEY.length > 0,
    isEnabled: () => flag(env.ENABLE_PROVIDER_SPORTMONKS),
    domains: ['today_fixtures', 'fixture_details', 'standings', 'team_form', 'head_to_head', 'squads', 'injuries', 'suspensions', 'probable_lineups', 'confirmed_lineups', 'live_events', 'live_stats', 'post_match_stats', 'competition_context'],
    rateLimitProfile: 'moderate',
    costRisk: 'high',
    caps: { supportsTodayFixtures: true, supportsLineups: true, supportsInjuries: true, supportsSuspensions: true, supportsStandings: true, supportsH2H: true, supportsSquads: true, supportsPostMatch: true },
    envDocs: 'defina SPORTMONKS_API_KEY e ENABLE_PROVIDER_SPORTMONKS=true para habilitar.',
  })
}
