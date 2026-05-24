import type { FixtureStats } from './LiveScannerTable'

export interface ScannerColumn {
  id: string
  label: string
  shortLabel: string
  defaultVisible: boolean
  getValue: (stats: FixtureStats | undefined) => { home?: number; away?: number } | null
}

export const SCANNER_COLUMNS: ScannerColumn[] = [
  { id: 'possession', label: 'Posse de bola', shortLabel: 'Posse', defaultVisible: true, getValue: (s) => s?.possession || null },
  { id: 'shots', label: 'Finalizações', shortLabel: 'Chutes', defaultVisible: true, getValue: (s) => s?.shots || null },
  { id: 'shotsOnTarget', label: 'Finalizações no alvo', shortLabel: 'No alvo', defaultVisible: true, getValue: (s) => s?.shotsOnTarget || null },
  { id: 'corners', label: 'Escanteios', shortLabel: 'Escanteios', defaultVisible: true, getValue: (s) => s?.corners || null },
  { id: 'yellowCards', label: 'Cartões amarelos', shortLabel: 'Cartões', defaultVisible: true, getValue: (s) => s?.yellowCards || null },
  { id: 'fouls', label: 'Faltas', shortLabel: 'Faltas', defaultVisible: false, getValue: (s) => s?.fouls || null },
]

export function getVisibleColumns(): string[] {
  try {
    const saved = localStorage.getItem('goalsense_scanner_columns')
    if (saved) return JSON.parse(saved)
  } catch {}
  return SCANNER_COLUMNS.filter(c => c.defaultVisible).map(c => c.id)
}

export function saveVisibleColumns(ids: string[]): void {
  localStorage.setItem('goalsense_scanner_columns', JSON.stringify(ids))
}
