export interface ManualIntakeRecord {
  domain: string
  sourceLabel?: string
  sourceUrl?: string
  reliability?: 'high' | 'medium' | 'low'
  limitations?: string[]
  enteredBy: string
  timestamp: string
  data: any
}

export function validateManualRecordForBaseline(record: ManualIntakeRecord): { valid: boolean; reason?: string } {
  if (!record.sourceLabel) {
    return { valid: false, reason: 'Missing sourceLabel' }
  }

  if (record.domain === 'injuries' && record.data?.hasNoInjuries && !record.sourceUrl) {
    return { valid: false, reason: 'Declaring "no injuries" requires explicit sourceUrl evidence' }
  }

  if (record.domain === 'suspensions' && record.data?.hasNoSuspensions && !record.sourceUrl) {
    return { valid: false, reason: 'Declaring "no suspensions" requires explicit sourceUrl evidence' }
  }

  if (record.domain === 'lineups' && record.data?.status === 'confirmed' && !record.data?.publishedAt) {
    return { valid: false, reason: 'Confirmed lineups require publishedAt time' }
  }

  return { valid: true }
}

export function classifyManualRecordReliability(record: ManualIntakeRecord): 'high' | 'medium' | 'low' {
  if (!record.sourceUrl) return 'low'
  if (record.sourceLabel?.toLowerCase().includes('official') || record.sourceLabel?.toLowerCase().includes('club')) return 'high'
  return 'medium'
}
