/**
 * API-Football adapter (B40) — honest skeleton.
 * ─────────────────────────────────────────────────────────────────────────────
 * API-Football CAN cover fixtures/standings/injuries/lineups/squads, but it is not
 * wired into the Fastify backend (only exists as repo-root edge functions). Without
 * API_FOOTBALL_KEY it is provider_not_configured and never called.
 */
import { env } from '../../../../env.js'
import { SkeletonProviderAdapter } from './skeletonAdapter.js'

const flag = (v: unknown) => String(v).toLowerCase() === 'true'

export function createApiFootballAdapter(): SkeletonProviderAdapter {
  return new SkeletonProviderAdapter({
    providerName: 'api_football',
    priority: 20,
    requiresApiKey: true,
    isConfigured: () => !!env.API_FOOTBALL_KEY && env.API_FOOTBALL_KEY.length > 0,
    isEnabled: () => flag(env.ENABLE_PROVIDER_API_FOOTBALL),
    domains: ['today_fixtures', 'fixture_details', 'standings', 'team_form', 'head_to_head', 'squads', 'injuries', 'suspensions', 'probable_lineups', 'confirmed_lineups', 'post_match_stats', 'competition_context'],
    rateLimitProfile: 'tight',
    costRisk: 'medium',
    caps: { supportsTodayFixtures: true, supportsLineups: true, supportsInjuries: true, supportsSuspensions: true, supportsStandings: true, supportsH2H: true, supportsSquads: true, supportsPostMatch: true },
    envDocs: 'defina API_FOOTBALL_KEY e ENABLE_PROVIDER_API_FOOTBALL=true para habilitar.',
  })
}
