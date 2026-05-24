/**
 * Live Match Detail — renders MatchCenterPage inline with the fixture prop.
 * No separate UI. Same premium experience as /app/matches/:id.
 */
import type { LiveFixture } from '@/lib/apiClient'
import { MatchCenterPage } from '@/features/matches/MatchCenterPage'

interface Props {
  fixture: LiveFixture
  onBack: () => void
}

export function LiveMatchDetailView({ fixture, onBack }: Props) {
  return <MatchCenterPage inlineFixture={fixture} onBack={onBack} />
}
