/**
 * ESPN Live-First Lease Service — B59 Locks and Leases
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages fixture leases to prevent multiple workers from monitoring the same
 * fixture simultaneously. Uses Firebase for distributed locking.
 */
import { env } from '../../../env.js'
import { createRepositories } from '../../../repositories/index.js'
import { listActiveSessions, getActiveSessionDetails } from './espnLiveFirstMonitoringRunner.service.js'
import type {
  EspnLiveFirstFixtureLease,
  EspnLiveFirstFixtureLeaseStatus
} from './espnLiveFirstWorker.types.js'

const DEFAULT_LEASE_TTL_SECONDS = parseInt(process.env.ESPN_LIVE_FIRST_LEASE_TTL_SECONDS || '120')
const DEFAULT_HEARTBEAT_SECONDS = parseInt(process.env.ESPN_LIVE_FIRST_HEARTBEAT_SECONDS || '30')

// In-memory lease state (for active workers)
const activeLeases = new Map<string, EspnLiveFirstFixtureLease>()

/**
 * Build lease ID from fixture ID
 */
function buildLeaseId(fixtureId: string): string {
  return `lease_${fixtureId}`
}

/**
 * Build owner string from process and host
 */
function buildOwnerString(): string {
  const processId = process.env.WORKER_PROCESS_ID || `process_${process.pid || 'unknown'}`
  const hostId = process.env.HOST_ID || 'local'
  return `${processId}@${hostId}`
}

/**
 * Check if a lease can be acquired for a fixture
 */
export async function canMonitorFixture(fixtureId: string): Promise<{
  canMonitor: boolean
  reason: string
  currentLease?: EspnLiveFirstFixtureLease | null
}> {
  const repos = createRepositories()
  const leaseId = buildLeaseId(fixtureId)

  // Check in-memory active leases first
  const activeLease = activeLeases.get(leaseId)
  if (activeLease && activeLease.status === 'active') {
    if (Date.now() < new Date(activeLease.leaseExpiresAt).getTime()) {
      return {
        canMonitor: false,
        reason: `Lease held by worker ${activeLease.owner}`,
        currentLease: activeLease
      }
    }
    // Lease expired, can acquire
  }

  // Check persisted lease
  const persistedLease = await repos.intelligence.getEspnLiveFirstFixtureLease(leaseId)
  if (persistedLease && persistedLease.status === 'active') {
    if (Date.now() < new Date(persistedLease.leaseExpiresAt).getTime()) {
      return {
        canMonitor: false,
        reason: `Lease held by worker ${persistedLease.owner}`,
        currentLease: persistedLease
      }
    }
    // Lease expired, can acquire
  }

  return {
    canMonitor: true,
    reason: 'No active lease found',
    currentLease: persistedLease || activeLease || null
  }
}

/**
 * Acquire a lease for monitoring a fixture
 */
export async function acquireFixtureLease(
  fixtureId: string,
  sessionId: string,
  workerRunId: string
): Promise<{
  success: boolean
  lease?: EspnLiveFirstFixtureLease
  reason: string
}> {
  const repos = createRepositories()
  const owner = buildOwnerString()
  const now = new Date()
  const leaseId = buildLeaseId(fixtureId)

  try {
    // Check if we can monitor
    const canMonitor = await canMonitorFixture(fixtureId)
    if (!canMonitor.canMonitor) {
      return {
        success: false,
        reason: canMonitor.reason
      }
    }

    // Calculate expiry
    const leaseExpiresAt = new Date(now.getTime() + DEFAULT_LEASE_TTL_SECONDS * 1000)
    const heartbeatAt = new Date(now.getTime() + DEFAULT_HEARTBEAT_SECONDS * 1000)

    const lease: EspnLiveFirstFixtureLease = {
      id: leaseId,
      fixtureId,
      sessionId,
      workerRunId,
      acquiredAt: now.toISOString(),
      heartbeatAt: heartbeatAt.toISOString(),
      leaseExpiresAt: leaseExpiresAt.toISOString(),
      status: 'active',
      owner,
      limitations: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }

    // Save lease
    await repos.intelligence.saveEspnLiveFirstFixtureLease(lease)

    // Also track in memory for fast access
    activeLeases.set(leaseId, lease)

    return {
      success: true,
      lease,
      reason: 'Lease acquired successfully'
    }

  } catch (error: any) {
    return {
      success: false,
      reason: `Failed to acquire lease: ${error?.message || 'unknown'}`
    }
  }
}

/**
 * Renew a lease heartbeat
 */
export async function renewFixtureLease(
  fixtureId: string,
  workerRunId: string
): Promise<{
  success: boolean
  lease?: EspnLiveFirstFixtureLease
  reason: string
}> {
  const repos = createRepositories()
  const leaseId = buildLeaseId(fixtureId)

  try {
    // Check if lease exists and belongs to this worker
    const lease = await repos.intelligence.getEspnLiveFirstFixtureLease(leaseId)
    if (!lease) {
      return {
        success: false,
        reason: 'Lease not found'
      }
    }

    if (lease.workerRunId !== workerRunId) {
      return {
        success: false,
        reason: 'Lease belongs to different worker'
      }
    }

    if (lease.status !== 'active') {
      return {
        success: false,
        reason: `Lease is not active (status: ${lease.status})`
      }
    }

    // Check if already expired
    if (Date.now() >= new Date(lease.leaseExpiresAt).getTime()) {
      return {
        success: false,
        reason: 'Lease already expired'
      }
    }

    // Renew heartbeat
    const now = new Date()
    const leaseExpiresAt = new Date(now.getTime() + DEFAULT_LEASE_TTL_SECONDS * 1000)
    const heartbeatAt = new Date(now.getTime() + DEFAULT_HEARTBEAT_SECONDS * 1000)

    const updatedLease: EspnLiveFirstFixtureLease = {
      ...lease,
      heartbeatAt: heartbeatAt.toISOString(),
      leaseExpiresAt: leaseExpiresAt.toISOString(),
      updatedAt: now.toISOString()
    }

    await repos.intelligence.updateEspnLiveFirstFixtureLease(leaseId, updatedLease)
    activeLeases.set(leaseId, updatedLease)

    return {
      success: true,
      lease: updatedLease,
      reason: 'Lease heartbeat renewed'
    }

  } catch (error: any) {
    return {
      success: false,
      reason: `Failed to renew lease: ${error?.message || 'unknown'}`
    }
  }
}

/**
 * Release a lease (when fixture completed or worker stopping)
 */
export async function releaseFixtureLease(
  fixtureId: string,
  workerRunId: string
): Promise<{
  success: boolean
  reason: string
}> {
  const repos = createRepositories()
  const leaseId = buildLeaseId(fixtureId)

  try {
    const lease = await repos.intelligence.getEspnLiveFirstFixtureLease(leaseId)
    if (!lease) {
      // No lease to release, that's fine
      return {
        success: true,
        reason: 'No lease found (already released or never acquired)'
      }
    }

    if (lease.workerRunId !== workerRunId) {
      return {
        success: false,
        reason: 'Lease belongs to different worker'
      }
    }

    const now = new Date()
    const updatedLease: EspnLiveFirstFixtureLease = {
      ...lease,
      status: 'released',
      updatedAt: now.toISOString()
    }

    await repos.intelligence.updateEspnLiveFirstFixtureLease(leaseId, updatedLease)
    activeLeases.delete(leaseId)

    return {
      success: true,
      reason: 'Lease released'
    }

  } catch (error: any) {
    return {
      success: false,
      reason: `Failed to release lease: ${error?.message || 'unknown'}`
    }
  }
}

/**
 * Expire old leases (cleanup)
 */
export async function expireOldLeases(): Promise<{
  expiredCount: number
  leases: EspnLiveFirstFixtureLease[]
}> {
  const repos = createRepositories()
  const now = new Date()

  try {
    const allLeases = await repos.intelligence.listEspnLiveFirstFixtureLeases(1000)

    const expiredLeases: EspnLiveFirstFixtureLease[] = []

    for (const lease of allLeases) {
      if (lease.status === 'active' && Date.now() >= new Date(lease.leaseExpiresAt).getTime()) {
        const updatedLease: EspnLiveFirstFixtureLease = {
          ...lease,
          status: 'expired',
          updatedAt: now.toISOString()
        }
        await repos.intelligence.updateEspnLiveFirstFixtureLease(lease.id, updatedLease)
        expiredLeases.push(updatedLease)
        activeLeases.delete(lease.id)
      }
    }

    return {
      expiredCount: expiredLeases.length,
      leases: expiredLeases
    }

  } catch (error: any) {
    return {
      expiredCount: 0,
      leases: []
    }
  }
}

/**
 * Detect orphaned leases (leases without active worker)
 */
export async function detectOrphanedLeases(): Promise<{
  orphanedLeases: EspnLiveFirstFixtureLease[]
  orphanedFixtureIds: string[]
}> {
  const repos = createRepositories()

  try {
    const allLeases = await repos.intelligence.listEspnLiveFirstFixtureLeases(1000)

    const orphanedLeases: EspnLiveFirstFixtureLease[] = []
    const orphanedFixtureIds: string[] = []

    for (const lease of allLeases) {
      if (lease.status === 'active') {
        // Check if lease is expired
        if (Date.now() >= new Date(lease.leaseExpiresAt).getTime()) {
          // Mark as orphaned
          const updatedLease: EspnLiveFirstFixtureLease = {
            ...lease,
            status: 'orphaned',
            updatedAt: new Date().toISOString()
          }
          await repos.intelligence.updateEspnLiveFirstFixtureLease(lease.id, updatedLease)
          orphanedLeases.push(updatedLease)
          orphanedFixtureIds.push(lease.fixtureId)
        }
      }
    }

    return {
      orphanedLeases,
      orphanedFixtureIds
    }

  } catch (error: any) {
    return {
      orphanedLeases: [],
      orphanedFixtureIds: []
    }
  }
}

/**
 * Get lease status for a fixture
 */
export async function getFixtureLeaseStatus(fixtureId: string): Promise<{
  hasLease: boolean
  lease?: EspnLiveFirstFixtureLease | null
  status: EspnLiveFirstFixtureLeaseStatus | 'none'
  owner?: string
  expiresAt?: string
}> {
  const repos = createRepositories()
  const leaseId = buildLeaseId(fixtureId)

  // Check in-memory first
  const activeLease = activeLeases.get(leaseId)
  if (activeLease) {
    return {
      hasLease: true,
      lease: activeLease,
      status: activeLease.status,
      owner: activeLease.owner,
      expiresAt: activeLease.leaseExpiresAt
    }
  }

  // Check persisted
  const persistedLease = await repos.intelligence.getEspnLiveFirstFixtureLease(leaseId)

  return {
    hasLease: !!persistedLease,
    lease: persistedLease,
    status: persistedLease?.status || 'none',
    owner: persistedLease?.owner,
    expiresAt: persistedLease?.leaseExpiresAt
  }
}

/**
 * Check if session is still being monitored (has any active leases)
 */
export async function sessionHasActiveLeases(sessionId: string): Promise<boolean> {
  const repos = createRepositories()

  try {
    const leases = await repos.intelligence.listEspnLiveFirstFixtureLeases(100)
    return leases.some(
      l => l.sessionId === sessionId && l.status === 'active'
    )
  } catch {
    return false
  }
}

/**
 * Get active leases count for a worker
 */
export async function getWorkerActiveLeasesCount(workerRunId: string): Promise<number> {
  const repos = createRepositories()

  try {
    const leases = await repos.intelligence.listEspnLiveFirstFixtureLeases(100)
    return leases.filter(
      l => l.workerRunId === workerRunId && l.status === 'active'
    ).length
  } catch {
    return 0
  }
}

/**
 * Release all leases for a session (when stopping)
 */
export async function releaseSessionLeases(sessionId: string): Promise<{
  releasedCount: number
  failedCount: number
}> {
  const repos = createRepositories()

  try {
    const leases = await repos.intelligence.listEspnLiveFirstFixtureLeases(100)

    let released = 0
    let failed = 0

    for (const lease of leases) {
      if (lease.sessionId === sessionId && lease.status === 'active') {
        const result = await releaseFixtureLease(lease.fixtureId, lease.workerRunId)
        if (result.success) {
          released++
        } else {
          failed++
        }
      }
    }

    return {
      releasedCount: released,
      failedCount: failed
    }
  } catch (error: any) {
    return {
      releasedCount: 0,
      failedCount: 0
    }
  }
}
