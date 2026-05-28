/**
 * buildMatchDisplayModel — single source of presentation for /app/matches.
 * -------------------------------------------------------------------------
 * Every renderer (AgendaRow, HighlightCard, CompactRow, Sidebar) MUST use
 * this model to decide what to show. No component should call mapStatus,
 * formatMatchTime, or classifyMatch directly for display decisions.
 *
 * No mocks. No invented data.
 */

import { classifyMatch, type MatchClassification } from '@/lib/matchesClassification'
import { formatMatchTime } from '@/utils/matchDate'

// --- Types ----------------------------------------------------------------

export interface MatchDisplayModel {
  /** Canonical classification (source of truth for filtering). */
  classification: MatchClassification
  /** Short key for switch/case in renderers. */
  statusKey: 'live' | 'finished' | 'upcoming' | 'starting_soon' | 'awaiting_kickoff' | 'stale_pending' | 'stale_strong' | 'delayed' | 'cancelled' | 'unknown'
  /** Badge text to show (e.g. "Ao vivo", "FIM", "Pendente"). */
  badgeLabel: string
  /** Badge visual tone. */
  badgeTone: 'live' | 'finished' | 'upcoming' | 'soon' | 'pending' | 'delayed' | 'cancelled' | 'unknown'
  /** Primary time/status label (what goes in the main status column). */
  primaryLabel: string
  /** Secondary label (e.g. "Prev. 19:00") — shown below primary when relevant. */
  secondaryLabel: string | null
  /** Whether the kickoff time should be shown as the primary status. */
  shouldShowKickoffAsPrimary: boolean
  /** Formatted kickoff time (HH:mm). */
  kickoffTime: string
  /** Home team display name. */
  homeName: string
  /** Away team display name. */
  awayName: string
  /** Home team logo URL or null. */
  homeLogo: string | null
  /** Away team logo URL or null. */
  awayLogo: string | null
  /** Home score (null if not available). */
  homeScore: number | null
  /** Away score (null if not available). */
  awayScore: number | null
  /** Whether score is reliable (live or finished). */
  hasReliableScore: boolean
  /** Competition display name. */
  competitionLabel: string
  /** Competition emblem URL or null. */
  competitionLogo: string | null
  /** Warning line for advanced mode (e.g. "Provider não atualizou"). */
  warningLabel: string | null
}

// --- Builder --------------------------------------------------------------

export interface MatchInput {
  status: string
  utcDate: string
  state?: string
  homeTeam: { name: string; shortName?: string; crest?: string | null }
  awayTeam: { name: string; shortName?: string; crest?: string | null }
  score: { fullTime: { home: number | null; away: number | null } }
  competition: { name: string; emblem?: string | null }
}

export function buildMatchDisplayModel(match: MatchInput, now: Date = new Date()): MatchDisplayModel {
  const cls = classifyMatch(match, now)
  const kickoffTime = formatMatchTime(match.utcDate)
  const homeName = match.homeTeam.shortName || match.homeTeam.name
  const awayName = match.awayTeam.shortName || match.awayTeam.name

  // Determine statusKey and labels based on classification
  let statusKey: MatchDisplayModel['statusKey']
  let badgeLabel: string
  let badgeTone: MatchDisplayModel['badgeTone']
  let primaryLabel: string
  let secondaryLabel: string | null = null
  let shouldShowKickoffAsPrimary: boolean
  let warningLabel: string | null = null

  if (cls.isLive) {
    statusKey = 'live'
    badgeLabel = cls.labelShort
    badgeTone = 'live'
    primaryLabel = cls.labelShort
    shouldShowKickoffAsPrimary = false
  } else if (cls.isFinished) {
    statusKey = 'finished'
    badgeLabel = 'FIM'
    badgeTone = 'finished'
    primaryLabel = 'FIM'
    shouldShowKickoffAsPrimary = false
  } else if (cls.isStaleScheduled) {
    // Determine if it's "Aguardando atualização" (10-30min) or "Pendente" (30min+)
    const kickoff = new Date(match.utcDate)
    const minutesSince = Math.round((now.getTime() - kickoff.getTime()) / 60000)
    if (minutesSince <= 30) {
      statusKey = 'stale_pending'
      badgeLabel = 'Aguardando'
      primaryLabel = 'Aguardando atualização'
    } else {
      statusKey = 'stale_strong'
      badgeLabel = 'Pendente'
      primaryLabel = 'Status pendente'
      warningLabel = 'Provider não atualizou o status'
    }
    badgeTone = 'pending'
    secondaryLabel = `Prev. ${kickoffTime}`
    shouldShowKickoffAsPrimary = false
  } else if (cls.isStartingSoon) {
    // Check if past kickoff (awaiting) or future (starting soon)
    const kickoff = new Date(match.utcDate)
    const minutesSince = Math.round((now.getTime() - kickoff.getTime()) / 60000)
    if (minutesSince > 0) {
      statusKey = 'awaiting_kickoff'
      badgeLabel = 'Aguardando início'
      badgeTone = 'soon'
      primaryLabel = 'Aguardando início'
      secondaryLabel = kickoffTime
      shouldShowKickoffAsPrimary = false
    } else {
      statusKey = 'starting_soon'
      badgeLabel = 'Em breve'
      badgeTone = 'soon'
      primaryLabel = kickoffTime
      secondaryLabel = 'Em breve'
      shouldShowKickoffAsPrimary = true
    }
  } else if (cls.isUpcoming) {
    statusKey = 'upcoming'
    badgeLabel = kickoffTime
    badgeTone = 'upcoming'
    primaryLabel = kickoffTime
    shouldShowKickoffAsPrimary = true
  } else if (cls.isDelayed) {
    statusKey = 'delayed'
    badgeLabel = 'Adiado'
    badgeTone = 'delayed'
    primaryLabel = 'Adiado'
    shouldShowKickoffAsPrimary = false
  } else if (cls.isCancelled) {
    statusKey = 'cancelled'
    badgeLabel = 'Cancelado'
    badgeTone = 'cancelled'
    primaryLabel = 'Cancelado'
    shouldShowKickoffAsPrimary = false
  } else {
    statusKey = 'unknown'
    badgeLabel = 'Indefinido'
    badgeTone = 'unknown'
    primaryLabel = kickoffTime || 'Indefinido'
    shouldShowKickoffAsPrimary = Boolean(kickoffTime)
  }

  const hasReliableScore = cls.isLive || cls.isFinished

  // DEV assertion
  if (import.meta.env.DEV) {
    if (cls.isStaleScheduled && shouldShowKickoffAsPrimary) {
      console.warn('[GoalSense][DisplayModel] stale_scheduled should NOT show kickoff as primary', { homeName, awayName, kickoffTime })
    }
  }

  return {
    classification: cls,
    statusKey,
    badgeLabel,
    badgeTone,
    primaryLabel,
    secondaryLabel,
    shouldShowKickoffAsPrimary,
    kickoffTime,
    homeName,
    awayName,
    homeLogo: match.homeTeam.crest || null,
    awayLogo: match.awayTeam.crest || null,
    homeScore: match.score.fullTime.home,
    awayScore: match.score.fullTime.away,
    hasReliableScore,
    competitionLabel: match.competition.name,
    competitionLogo: match.competition.emblem || null,
    warningLabel,
  }
}
