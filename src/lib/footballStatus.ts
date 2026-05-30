const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'])
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO'])
const SCHEDULED_STATUSES = new Set(['NS', 'TBD'])

export function isLiveStatus(short: string): boolean {
  return LIVE_STATUSES.has(short)
}

export function isFinishedStatus(short: string): boolean {
  return FINISHED_STATUSES.has(short)
}

export function isScheduledStatus(short: string): boolean {
  return SCHEDULED_STATUSES.has(short)
}

// ESPN uses different status names
export function isEspnLive(state: string): boolean {
  return state === 'in'
}

export function getStatusLabel(short: string, elapsed?: number | null): string {
  const labels: Record<string, string> = {
    '1H': '1º tempo',
    'HT': 'Intervalo',
    '2H': '2º tempo',
    'ET': 'Prorrogação',
    'BT': 'Intervalo prorrogação',
    'P': 'Pênaltis',
    'SUSP': 'Suspenso',
    'INT': 'Interrompido',
    'LIVE': 'Ao vivo',
    'FT': 'Encerrado',
    'AET': 'Encerrado (Prorr.)',
    'PEN': 'Encerrado (Pên.)',
    'NS': 'Não iniciado',
    'TBD': 'A definir',
    'PST': 'Adiado',
    'CANC': 'Cancelado',
    'ABD': 'Abandonado',
    // ESPN mapped
    'STATUS_IN_PROGRESS': 'Ao vivo',
    'STATUS_HALFTIME': 'Intervalo',
    'STATUS_FULL_TIME': 'Encerrado',
    'STATUS_SCHEDULED': 'Não iniciado',
  }

  const label = labels[short] || short
  if (elapsed && isLiveStatus(short)) {
    return `${elapsed}' · ${label}`
  }
  return label
}

export function getStatusVariant(short: string): 'live' | 'halftime' | 'finished' | 'scheduled' | 'default' {
  if (short === 'HT') return 'halftime'
  if (LIVE_STATUSES.has(short)) return 'live'
  if (FINISHED_STATUSES.has(short)) return 'finished'
  if (SCHEDULED_STATUSES.has(short)) return 'scheduled'
  return 'default'
}
