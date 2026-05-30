import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
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
})

export const env = envSchema.parse(process.env)
