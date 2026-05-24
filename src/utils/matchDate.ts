/**
 * Central date utilities for match timezone handling.
 * All match dates from APIs are in UTC. We must display and group
 * them by the local date in America/Sao_Paulo timezone.
 */

const DEFAULT_TZ = 'America/Sao_Paulo'

/**
 * Returns the local date key (YYYY-MM-DD) for a given UTC match date string.
 * Uses Intl.DateTimeFormat to correctly resolve the local day.
 */
export function getMatchLocalDateKey(utcDateStr: string, timeZone = DEFAULT_TZ): string {
  const date = new Date(utcDateStr)
  // Use Intl to get year, month, day in the target timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find(p => p.type === 'year')?.value || '2026'
  const month = parts.find(p => p.type === 'month')?.value || '01'
  const day = parts.find(p => p.type === 'day')?.value || '01'

  return `${year}-${month}-${day}`
}

/**
 * Formats the match time (HH:mm) in the local timezone.
 */
export function formatMatchTime(utcDateStr: string, timeZone = DEFAULT_TZ): string {
  const date = new Date(utcDateStr)
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/**
 * Checks if a match falls on a specific selected local date.
 */
export function isMatchOnSelectedLocalDate(
  utcDateStr: string,
  selectedDate: string,
  timeZone = DEFAULT_TZ
): boolean {
  return getMatchLocalDateKey(utcDateStr, timeZone) === selectedDate
}

/**
 * Formats the selected date as a readable pt-BR label.
 * Input: YYYY-MM-DD string (local date)
 */
export function formatSelectedDateLabel(selectedDate: string): string {
  // Parse as noon local to avoid timezone shifts
  const date = new Date(selectedDate + 'T12:00:00')
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/**
 * Returns today's date key in the local timezone.
 */
export function getTodayLocalDateKey(timeZone = DEFAULT_TZ): string {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const year = parts.find(p => p.type === 'year')?.value || '2026'
  const month = parts.find(p => p.type === 'month')?.value || '01'
  const day = parts.find(p => p.type === 'day')?.value || '01'

  return `${year}-${month}-${day}`
}

/**
 * DEV-only debug log for match date resolution.
 */
export function debugMatchDate(utcDateStr: string, selectedDate: string, home: string, away: string, timeZone = DEFAULT_TZ): void {
  if (import.meta.env.DEV) {
    const localDateKey = getMatchLocalDateKey(utcDateStr, timeZone)
    const localTime = formatMatchTime(utcDateStr, timeZone)
    console.debug('[match-date-debug]', {
      rawDate: utcDateStr,
      localDateKey,
      selectedDate,
      localTime,
      home,
      away,
      matches: localDateKey === selectedDate,
    })
  }
}
