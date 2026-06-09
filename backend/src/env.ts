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

  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
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
}).superRefine((val, ctx) => {
  // Conditional validation by persistence provider
  if (val.PERSISTENCE_PROVIDER === 'prisma') {
    if (!val.DATABASE_URL || val.DATABASE_URL.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['DATABASE_URL'], message: 'DATABASE_URL is required when PERSISTENCE_PROVIDER=prisma' })
    }
  } else if (val.PERSISTENCE_PROVIDER === 'firebase') {
    const hasJson = !!val.FIREBASE_SERVICE_ACCOUNT_JSON
    const hasSeparate = !!val.FIREBASE_PROJECT_ID && !!val.FIREBASE_CLIENT_EMAIL && !!val.FIREBASE_PRIVATE_KEY
    if (!hasJson && !hasSeparate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FIREBASE_SERVICE_ACCOUNT_JSON'],
        message: 'Firebase credentials required when PERSISTENCE_PROVIDER=firebase (set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)',
      })
    }
  }
})

export const env = envSchema.parse(process.env)
