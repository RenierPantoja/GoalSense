export interface SafeProviderDebugSnapshot {
  provider: string
  endpointKey: string
  requestedDate: string
  statusCategory: string
  httpStatus?: number
  fixturesCount: number
  normalizedCount: number
  droppedCount: number
  parseWarnings: string[]
  suspectedCause: string
  createdAt: string
  limitations: string[]
}

// In-memory store for the latest snapshot to avoid heavy DB writes for debug info
let latestSnapshot: SafeProviderDebugSnapshot | null = null

export function saveSafeDebugSnapshot(snapshot: SafeProviderDebugSnapshot): void {
  latestSnapshot = snapshot
}

export function getLatestSafeDebugSnapshot(): SafeProviderDebugSnapshot | null {
  return latestSnapshot
}
