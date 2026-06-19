/**
 * Auto Engine ranking (Phase B19) — pure ordering of opportunities.
 */
import type { AutoOpportunity } from '../autoEngine.types.js'

const STATUS_RANK: Record<string, number> = { strong: 3, watch: 2, candidate: 1, blocked: 0, ignored: 0 }

export function rankOpportunities(opps: AutoOpportunity[]): AutoOpportunity[] {
  return [...opps].sort((a, b) => {
    const s = (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0)
    if (s !== 0) return s
    if (b.score !== a.score) return b.score - a.score
    return (b.minute ?? 0) - (a.minute ?? 0)
  })
}
