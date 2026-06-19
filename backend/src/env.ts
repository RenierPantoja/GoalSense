import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  // ─── Persistence ─────────────────────────────────────────────────────────
  // 'prisma' (default) requires DATABASE_URL. 'firebase' requires Firebase creds.
  PERSISTENCE_PROVIDER: z.enum(['prisma', 'firebase']).default('prisma'),
  DATABASE_URL: z.string().optional(),
  // Firebase Admin (only required when PERSISTENCE_PROVIDER=firebase)
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  // Local convenience: path to a service account JSON file (never commit the file).
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),

  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173,https://goal-sense.vercel.app'),
  API_FOOTBALL_KEY: z.string().optional(),
  FOOTBALL_DATA_KEY: z.string().optional(),
  // Live monitoring worker
  LIVE_WORKER_ENABLED: z.string().default('false'),
  LIVE_WORKER_INTERVAL_MS: z.coerce.number().default(30000),
  ESPN_BASE_URL: z.string().default('https://site.api.espn.com/apis/site/v2/sports/soccer'),
  // Summary enrichment
  SUMMARY_ENRICHMENT_ENABLED: z.string().default('true'),
  SUMMARY_ENRICHMENT_MAX_FIXTURES: z.coerce.number().default(10),
  // Pattern evaluation worker
  PATTERN_WORKER_ENABLED: z.string().default('false'),
  PATTERN_WORKER_INTERVAL_MS: z.coerce.number().default(15000),
  PATTERN_WORKER_MAX_FIXTURES: z.coerce.number().default(20),
  // Alert resolution worker
  RESOLUTION_WORKER_ENABLED: z.string().default('false'),
  RESOLUTION_WORKER_INTERVAL_MS: z.coerce.number().default(30000),
  RESOLUTION_WORKER_MAX_ALERTS: z.coerce.number().default(50),
  // Telegram
  TELEGRAM_ENABLED: z.string().default('false'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  // Odds Intelligence
  ODDS_ENABLED: z.string().default('false'),
  ODDS_PROVIDER: z.string().default('none'),
  ODDS_API_KEY: z.string().optional(),
  ODDS_FETCH_TIMEOUT_MS: z.coerce.number().default(8000),
  ODDS_CACHE_TTL_SECONDS: z.coerce.number().default(30),
  // Intelligence — Backtest & Learning (Phase B14)
  ENABLE_BACKTEST_API: z.string().default('false'),
  ENABLE_LEARNING_AGGREGATION_SCHEDULER: z.string().default('false'),
  LEARNING_AGGREGATION_INTERVAL_MS: z.coerce.number().default(3600000),
  // Alert Intelligence Scale (Phase B18)
  ENABLE_ALERT_INTELLIGENCE_CACHE: z.string().default('false'),
  ALERT_INTELLIGENCE_CACHE_TTL_SECONDS: z.coerce.number().default(60),
  ALERT_INTELLIGENCE_CACHE_MAX_KEYS: z.coerce.number().default(64),
  ENABLE_ALERT_EXPORT: z.string().default('false'),
  // Automatic Engine (Phase B19) — all OFF by default
  ENABLE_AUTO_ENGINE: z.string().default('false'),
  ENABLE_AUTO_ENGINE_WRITE: z.string().default('false'),
  ENABLE_AUTO_ENGINE_SCHEDULER: z.string().default('false'),
  ENABLE_AUTO_ENGINE_TO_ALERTS: z.string().default('false'),
  ENABLE_MANUAL_AUTO_OPPORTUNITY_PROMOTION: z.string().default('false'),
  ENABLE_PROMOTED_ALERT_RESOLUTION: z.string().default('true'),
  ENABLE_PROMOTED_ALERT_TELEGRAM: z.string().default('false'),
  ENABLE_PROMOTED_ALERT_MANUAL_RESOLVE: z.string().default('false'),
  ENABLE_AUTO_ENGINE_LEARNING_REBUILD: z.string().default('false'),
  ENABLE_AUTO_ENGINE_LEARNING_SCHEDULER: z.string().default('false'),
  AUTO_ENGINE_LEARNING_INTERVAL_MS: z.coerce.number().default(3600000),
  AUTO_ENGINE_INTERVAL_MS: z.coerce.number().default(60000),
  AUTO_ENGINE_MAX_FIXTURES_PER_RUN: z.coerce.number().default(20),
  AUTO_ENGINE_MIN_SAMPLE_QUALITY: z.enum(['insufficient', 'low', 'moderate', 'strong']).default('moderate'),
  AUTO_ENGINE_MIN_SCORE: z.coerce.number().default(55),
  AUTO_ENGINE_MAX_OPPS_PER_FIXTURE: z.coerce.number().default(3),
}).superRefine((val, ctx) => {
  // Conditional validation by persistence provider
  if (val.PERSISTENCE_PROVIDER === 'prisma') {
    if (!val.DATABASE_URL || val.DATABASE_URL.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['DATABASE_URL'], message: 'DATABASE_URL is required when PERSISTENCE_PROVIDER=prisma' })
    }
  } else if (val.PERSISTENCE_PROVIDER === 'firebase') {
    const hasJson = !!val.FIREBASE_SERVICE_ACCOUNT_JSON
    const hasPath = !!val.FIREBASE_SERVICE_ACCOUNT_PATH
    const hasSeparate = !!val.FIREBASE_PROJECT_ID && !!val.FIREBASE_CLIENT_EMAIL && !!val.FIREBASE_PRIVATE_KEY
    if (!hasJson && !hasPath && !hasSeparate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FIREBASE_SERVICE_ACCOUNT_JSON'],
        message: 'Firebase credentials required when PERSISTENCE_PROVIDER=firebase (set FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_PATH, or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)',
      })
    }
  }
})

export const env = envSchema.parse(process.env)
