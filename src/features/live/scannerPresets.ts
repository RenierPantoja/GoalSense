const STORAGE_KEY = 'goalsense_live_scanner_preset'

export interface ScannerPreset {
  id: string
  label: string
  columns: string[]
}

export const PRESETS: ScannerPreset[] = [
  { id: 'essential', label: 'Essencial', columns: ['min', 'home', 'score', 'away', 'attention', 'competition'] },
  { id: 'stats', label: 'Estatísticas', columns: ['min', 'home', 'score', 'away', 'possession', 'shots', 'onTarget', 'corners', 'cards', 'attention'] },
  { id: 'compact', label: 'Compacto', columns: ['min', 'home', 'score', 'away', 'attention'] },
  { id: 'full', label: 'Completo', columns: ['min', 'home', 'score', 'away', 'possession', 'shots', 'onTarget', 'corners', 'cards', 'attention', 'competition'] },
]

export function getActivePreset(): string {
  try { return localStorage.getItem(STORAGE_KEY) || 'full' } catch { return 'full' }
}

export function savePreset(id: string) {
  localStorage.setItem(STORAGE_KEY, id)
}
