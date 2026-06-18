/**
 * Minute-window bucketing (Phase B13).
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic. Never infers a minute when absent — null/`pre_match` →
 * dedicated buckets so missing data stays visible.
 */
import type { MinuteWindow } from '../contracts/learning.types.js'

const PRE_MATCH_STATUSES = new Set(['NS', 'TBD', 'PST', 'CANC', 'SUSP'])

export const MINUTE_WINDOWS: MinuteWindow[] = [
  'pre_match', '0_15', '16_30', '31_45', '46_60', '61_70', '71_80', '81_90', 'stoppage', 'unknown',
]

export function minuteWindowOf(minute: number | null | undefined, status?: string | null): MinuteWindow {
  if (status && PRE_MATCH_STATUSES.has(status)) return 'pre_match'
  if (minute == null || !Number.isFinite(minute)) return 'unknown'
  if (minute <= 15) return '0_15'
  if (minute <= 30) return '16_30'
  if (minute <= 45) return '31_45'
  if (minute <= 60) return '46_60'
  if (minute <= 70) return '61_70'
  if (minute <= 80) return '71_80'
  if (minute <= 90) return '81_90'
  return 'stoppage'
}

export function minuteWindowLabel(w: MinuteWindow): string {
  switch (w) {
    case 'pre_match': return 'Pré-jogo'
    case 'stoppage': return 'Acréscimos (90+)'
    case 'unknown': return 'Minuto desconhecido'
    default: return `${w.replace('_', "'–")}'`
  }
}
