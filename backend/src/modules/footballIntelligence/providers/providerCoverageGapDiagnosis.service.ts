import { buildCandidatesForToday } from '../identity/fixtureIdentityResolution.service.js'

export async function buildCoverageGapReport(dateStr: string) {
  const provider = 'api_football'
  const run = await buildCandidatesForToday(dateStr, provider)

  return {
    date: dateStr,
    espnFixturesCount: run.primaryFixtures,
    apiFootballFixturesCount: run.secondaryFixtures,
    possibleOverlaps: run.candidatesGenerated,
    competitionsEspnOnly: [], // Mocked for now as we don't have real data
    competitionsApiOnly: [],
    nameNormalizationWarnings: [],
    timezoneMismatches: [],
    noCandidateReasons: run.secondaryFixtures === 0
      ? ['API-Football returned 0 fixtures. Comparison impossible.']
      : ['Parsing or competition mismatch']
  }
}
