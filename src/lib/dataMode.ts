const DATA_MODE = import.meta.env.VITE_DATA_MODE || 'real'
const ALLOW_MOCKS = import.meta.env.VITE_ALLOW_MOCKS === 'true'

export function isRealDataMode(): boolean {
  return DATA_MODE === 'real'
}

export function canUseMocks(): boolean {
  return ALLOW_MOCKS && import.meta.env.DEV
}

export function assertRealDataOnly(): void {
  if (!isRealDataMode()) return
  if (canUseMocks()) return
  // In real mode, mocks are forbidden
}

export function getDataUnavailableMessage(context: string): string {
  return `${context} indisponível pelo provider.`
}
