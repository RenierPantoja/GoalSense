import type { LiveFixture } from '@/lib/apiClient'

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function searchFixtures(fixtures: LiveFixture[], query: string): LiveFixture[] {
  if (!query.trim()) return fixtures

  const q = normalize(query)
  return fixtures.filter((fx) => {
    const fields = [
      fx.homeTeam.name,
      fx.awayTeam.name,
      fx.league.name,
      fx.league.country,
      fx.provider,
    ]
    return fields.some((f) => normalize(f || '').includes(q))
  })
}
