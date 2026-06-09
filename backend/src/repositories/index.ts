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
import { FirebasePatternRepository } from './firebase/firebasePattern.repository.js'
import { FirebaseAlertRepository } from './firebase/firebaseAlert.repository.js'
import { FirebaseAlertResolutionRepository } from './firebase/firebaseAlertResolution.repository.js'
import { FirebaseFixtureRepository } from './firebase/firebaseFixture.repository.js'
import { FirebaseLiveSnapshotRepository } from './firebase/firebaseLiveSnapshot.repository.js'
import { FirebaseOddsRepository } from './firebase/firebaseOdds.repository.js'

let cached: Repositories | null = null

export function createRepositories(): Repositories {
  if (cached) return cached

  if (env.PERSISTENCE_PROVIDER === 'firebase') {
    // E2: ProviderHealth + Telegram. E3: Patterns + Alerts + AlertResolutions.
    // E4: Fixtures + LiveSnapshots. E5: Odds + workers (commandEvaluation,
    // alertResolution) run repository-backed. Performance analytics still uses
    // Prisma aggregations (E6).
    cached = {
      providerHealth: new FirebaseProviderHealthRepository(),
      telegram: new FirebaseTelegramRepository(),
      patterns: new FirebasePatternRepository(),
      alerts: new FirebaseAlertRepository(),
      alertResolutions: new FirebaseAlertResolutionRepository(),
      fixtures: new FirebaseFixtureRepository(),
      liveSnapshots: new FirebaseLiveSnapshotRepository(),
      odds: new FirebaseOddsRepository(),
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
