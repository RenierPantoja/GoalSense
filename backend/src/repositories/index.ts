/**
 * Repository Factory (Phase E1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralizes persistence provider selection. Services that have been migrated
 * to repositories use createRepositories(); legacy services may still use Prisma
 * directly during the incremental migration.
 *
 * - PERSISTENCE_PROVIDER=prisma  → all Prisma adapters
 * - PERSISTENCE_PROVIDER=firebase → Firebase adapters where implemented,
 *                                   clear error for unimplemented ones.
 */
import { env } from '../env.js'
import type { Repositories } from './contracts.js'
import {
  PrismaPatternRepository, PrismaAlertRepository, PrismaAlertResolutionRepository,
  PrismaFixtureRepository, PrismaLiveSnapshotRepository, PrismaProviderHealthRepository,
  PrismaTelegramRepository, PrismaOddsRepository,
} from './prisma/prismaRepositories.js'
import { FirebaseProviderHealthRepository } from './firebase/firebaseProviderHealth.repository.js'
import { FirebaseTelegramRepository } from './firebase/firebaseTelegram.repository.js'

function notImplemented(name: string): never {
  throw new Error(`Firebase adapter for ${name} not implemented yet. Use PERSISTENCE_PROVIDER=prisma or implement the adapter.`)
}

let cached: Repositories | null = null

export function createRepositories(): Repositories {
  if (cached) return cached

  if (env.PERSISTENCE_PROVIDER === 'firebase') {
    // E2: ProviderHealth + Telegram migrated to Firestore.
    // Alert/Pattern/Fixture/etc. throw clear errors until migrated (E3+).
    cached = {
      providerHealth: new FirebaseProviderHealthRepository(),
      telegram: new FirebaseTelegramRepository(),
      patterns: new Proxy({} as any, { get: () => () => notImplemented('PatternRepository') }),
      alerts: new Proxy({} as any, { get: () => () => notImplemented('AlertRepository') }),
      alertResolutions: new Proxy({} as any, { get: () => () => notImplemented('AlertResolutionRepository') }),
      fixtures: new Proxy({} as any, { get: () => () => notImplemented('FixtureRepository') }),
      liveSnapshots: new Proxy({} as any, { get: () => () => notImplemented('LiveSnapshotRepository') }),
      odds: new Proxy({} as any, { get: () => () => notImplemented('OddsRepository') }),
    }
    return cached
  }

  // Default: Prisma
  cached = {
    patterns: new PrismaPatternRepository(),
    alerts: new PrismaAlertRepository(),
    alertResolutions: new PrismaAlertResolutionRepository(),
    fixtures: new PrismaFixtureRepository(),
    liveSnapshots: new PrismaLiveSnapshotRepository(),
    providerHealth: new PrismaProviderHealthRepository(),
    telegram: new PrismaTelegramRepository(),
    odds: new PrismaOddsRepository(),
  }
  return cached
}

export type { Repositories } from './contracts.js'
