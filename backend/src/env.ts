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
  // B28: base64-encoded service account JSON (preferred for cloud env vars).
  FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().optional(),
  // Local convenience: path to a service account JSON file (never commit the file).
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),

  APP_ENV: z.enum(['local', 'development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173,https://goal-sense.vercel.app'),
  // B28: cloud runtime — preferred over CORS_ORIGIN when set (comma-separated).
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  PUBLIC_BACKEND_URL: z.string().optional(),
  FRONTEND_ORIGIN: z.string().optional(),
  BUILD_VERSION: z.string().optional(),
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
  // Auto Alert Policy Engine (Phase B25) — shadow-first; auto-create OFF by default.
  ENABLE_AUTO_ALERT_POLICY: z.string().default('false'),
  ENABLE_AUTO_ALERT_SHADOW_MODE: z.string().default('true'),
  ENABLE_AUTO_ALERT_CREATE: z.string().default('false'),
  ENABLE_AUTO_ALERT_TELEGRAM: z.string().default('false'),
  ENABLE_AUTO_ALERT_POLICY_CONFIG: z.string().default('false'),
  AUTO_ALERT_MIN_SCORE: z.coerce.number().default(70),
  AUTO_ALERT_MIN_SAMPLE_QUALITY: z.enum(['insufficient', 'low', 'moderate', 'strong']).default('moderate'),
  AUTO_ALERT_MAX_PER_FIXTURE: z.coerce.number().default(1),
  AUTO_ALERT_MAX_PER_RUN: z.coerce.number().default(3),
  AUTO_ALERT_REQUIRE_CALIBRATION: z.string().default('true'),
  AUTO_ALERT_REQUIRE_NO_CRITICAL_BLOCKERS: z.string().default('true'),
  // Auth, Admin Guardrails & Security (Phase B26) — auth OFF in dev by default.
  ENABLE_AUTH: z.string().default('false'),
  ALLOW_DEV_AUTH_BYPASS: z.string().default('false'),
  DEV_AUTH_ROLE: z.enum(['owner', 'admin', 'operator', 'analyst', 'viewer']).default('owner'),
  REQUIRE_ADMIN_FOR_DANGEROUS_ACTIONS: z.string().default('true'),
  ENABLE_RATE_LIMIT: z.string().default('false'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS_DEFAULT: z.coerce.number().default(120),
  RATE_LIMIT_MAX_REQUESTS_DANGEROUS: z.coerce.number().default(10),
  // Local Live Operations (Phase B30) — guardrails for running locally.
  LOCAL_RUNTIME_PROFILE: z.enum(['safe_local', 'live_validation', 'intensive_debug', 'disabled']).default('safe_local'),
  ENABLE_LOCAL_OPERATIONS_PANEL: z.string().default('true'),
  LOCAL_MAX_LIVE_FIXTURES: z.coerce.number().default(10),
  LOCAL_MAX_SNAPSHOTS_PER_FIXTURE_PER_MATCH: z.coerce.number().default(60),
  LOCAL_MIN_SNAPSHOT_INTERVAL_SECONDS: z.coerce.number().default(45),
  LOCAL_MAX_PROVIDER_CALLS_PER_MINUTE: z.coerce.number().default(20),
  LOCAL_MAX_PROVIDER_CALLS_PER_HOUR: z.coerce.number().default(400),
  LOCAL_WRITE_BUDGET_PER_HOUR: z.coerce.number().default(2000),
  LOCAL_READ_BUDGET_PER_HOUR: z.coerce.number().default(5000),
  // Live Pipeline Guard Integration (Phase B31) — gradual, observe-first.
  ENABLE_PROVIDER_USAGE_GUARD: z.string().default('false'),
  ENABLE_SNAPSHOT_WRITE_GUARD: z.string().default('false'),
  ENABLE_LIVE_FIXTURE_CAP: z.string().default('true'),
  ENABLE_SNAPSHOT_RETENTION: z.string().default('false'),
  ENABLE_LOCAL_OPS_GUARD_LOGGING: z.string().default('true'),
  LOCAL_OPS_GUARD_MODE: z.enum(['observe', 'enforce']).default('observe'),
  SNAPSHOT_RETENTION_DAYS_RAW: z.coerce.number().default(7),
  SNAPSHOT_RETENTION_DAYS_IMPORTANT: z.coerce.number().default(30),
  SNAPSHOT_RETENTION_DRY_RUN: z.string().default('true'),
  // Snapshot Lifecycle + persistent local-ops metrics (Phase B32).
  ENABLE_SNAPSHOT_MARK_FOR_DELETION: z.string().default('false'),
  ENABLE_SNAPSHOT_SOFT_DELETE: z.string().default('false'),
  ENABLE_SNAPSHOT_HARD_DELETE: z.string().default('false'),
  SNAPSHOT_RETENTION_SCAN_LIMIT: z.coerce.number().default(500),
  SNAPSHOT_RETENTION_BATCH_SIZE: z.coerce.number().default(100),
  SNAPSHOT_RETENTION_REQUIRE_MARK_BEFORE_DELETE: z.string().default('true'),
  ENABLE_LOCAL_OPS_METRICS_PERSISTENCE: z.string().default('false'),
  LOCAL_OPS_METRICS_INTERVAL_MS: z.coerce.number().default(300000),
  LOCAL_OPS_METRICS_RETENTION_DAYS: z.coerce.number().default(7),
  // Evidence Lineage (Phase B33).
  ENABLE_EVIDENCE_LINEAGE: z.string().default('true'),
  ENABLE_EVIDENCE_LINEAGE_BACKFILL: z.string().default('false'),
  ENABLE_BACKTEST_REPLAY_INLINE_EVIDENCE_BACKFILL: z.string().default('false'),
  ENABLE_BACKTEST_REPLAY_EVIDENCE_REPROCESS_PATCH: z.string().default('false'),
  // Live Validation Sessions (Phase B37).
  ENABLE_LIVE_VALIDATION_SESSIONS: z.string().default('true'),
  LIVE_VALIDATION_ALLOW_MULTIPLE_RUNNING: z.string().default('false'),
  LIVE_VALIDATION_AUTO_ATTACH: z.string().default('true'),
  LIVE_VALIDATION_REPORT_LIMIT: z.coerce.number().default(1000),
  ENABLE_LIVE_VALIDATION_SESSION_ATTRIBUTION_BACKFILL: z.string().default('false'),
  // B39: session record index + scoped metrics + dynamic attach.
  ENABLE_LIVE_VALIDATION_SESSION_METRICS: z.string().default('true'),
  LIVE_VALIDATION_SESSION_METRICS_FLUSH_MS: z.coerce.number().default(30000),
  ENABLE_LIVE_VALIDATION_DYNAMIC_ATTACH: z.string().default('true'),
  LIVE_VALIDATION_DYNAMIC_ATTACH_INTERVAL_MS: z.coerce.number().default(60000),
  LIVE_VALIDATION_DYNAMIC_ATTACH_PROVIDER_LOOKUP: z.string().default('false'),
  LIVE_VALIDATION_DYNAMIC_ATTACH_MAX_PER_RUN: z.coerce.number().default(20),
  ENABLE_LIVE_VALIDATION_SESSION_REINDEX: z.string().default('false'),
  // Match Intelligence Fabric — fundamental context engine (observe-first).
  ENABLE_MATCH_INTELLIGENCE: z.string().default('true'),
  ENABLE_ALERT_DECISION_PRECHECK: z.string().default('false'),
  ALERT_DECISION_PRECHECK_MODE: z.enum(['observe', 'enforce']).default('observe'),
  MATCH_INTELLIGENCE_MAX_TODAY_FIXTURES: z.coerce.number().default(20),
  // B40: multi-provider pre-match acquisition + lineup window.
  SPORTMONKS_API_KEY: z.string().optional(),
  API_FOOTBALL_BASE_URL: z.string().default('https://v3.football.api-sports.io'),
  FOOTBALL_DATA_BASE_URL: z.string().default('https://api.football-data.org/v4'),
  PROVIDER_FETCH_TIMEOUT_MS: z.coerce.number().default(8000),
  // B42: cross-provider fixture identity resolution.
  ENABLE_FIXTURE_IDENTITY_RESOLUTION: z.string().default('true'),
  FIXTURE_IDENTITY_AUTO_CONFIRM: z.string().default('true'),
  FIXTURE_IDENTITY_HIGH_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.88),
  FIXTURE_IDENTITY_MEDIUM_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.70),
  FIXTURE_IDENTITY_MAX_KICKOFF_DELTA_MINUTES: z.coerce.number().default(120),
  FIXTURE_IDENTITY_REQUIRE_COMPETITION_MATCH: z.string().default('false'),
  // B43: team/competition entity mapping derivation.
  ENABLE_ENTITY_MAPPING_DERIVATION: z.string().default('true'),
  ENTITY_MAPPING_AUTO_CONFIRM: z.string().default('true'),
  TEAM_MAPPING_MIN_CONFIRMED_FIXTURES: z.coerce.number().default(2),
  COMPETITION_MAPPING_MIN_CONFIRMED_FIXTURES: z.coerce.number().default(2),
  ENTITY_MAPPING_HIGH_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.90),
  ENABLE_PROVIDER_API_FOOTBALL: z.string().default('false'),
  ENABLE_PROVIDER_SPORTMONKS: z.string().default('false'),
  ENABLE_PROVIDER_FOOTBALL_DATA: z.string().default('false'),
  ENABLE_PROVIDER_MANUAL_LOCAL: z.string().default('false'),
  ENABLE_PRE_MATCH_ACQUISITION: z.string().default('false'),
  ENABLE_PRE_MATCH_ACQUISITION_SCHEDULER: z.string().default('false'),
  PRE_MATCH_ACQUISITION_MODE: z.enum(['manual', 'scheduled']).default('manual'),
  PRE_MATCH_ACQUISITION_INTERVAL_MS: z.coerce.number().default(900000),
  PRE_MATCH_SNAPSHOT_TTL_HOURS: z.coerce.number().default(12),
  AUTO_ENGINE_INTERVAL_MS: z.coerce.number().default(60000),
  AUTO_ENGINE_MAX_FIXTURES_PER_RUN: z.coerce.number().default(20),
  AUTO_ENGINE_MIN_SAMPLE_QUALITY: z.enum(['insufficient', 'low', 'moderate', 'strong']).default('moderate'),
  AUTO_ENGINE_MIN_SCORE: z.coerce.number().default(55),
  AUTO_ENGINE_MAX_OPPS_PER_FIXTURE: z.coerce.number().default(3),
  // B45: historical club memory + contextual pattern intelligence (manual-first; scheduler OFF).
  ENABLE_HISTORICAL_MEMORY_BUILD: z.string().default('true'),
  ENABLE_HISTORICAL_MEMORY_SCHEDULER: z.string().default('false'),
  HISTORICAL_MEMORY_MAX_FIXTURES_PER_RUN: z.coerce.number().default(20),
  HISTORICAL_MEMORY_MIN_SAMPLE_FOR_STRONG: z.coerce.number().default(8),
  HISTORICAL_MEMORY_RECENCY_DAYS: z.coerce.number().default(730),
  // B46: fundamental variable weighting + influence engine (advisory/observe).
  ENABLE_VARIABLE_INFLUENCE_ENGINE: z.string().default('true'),
  ENABLE_VARIABLE_INFLUENCE_BUILD: z.string().default('true'),
  VARIABLE_INFLUENCE_MODE: z.enum(['observe', 'enforce']).default('observe'),
  VARIABLE_INFLUENCE_MAX_PATTERNS_PER_FIXTURE: z.coerce.number().default(20),
  // B47: alert decision governance + shadow wiring + live re-evaluation (observe-first).
  ENABLE_ALERT_DECISION_GOVERNANCE: z.string().default('true'),
  ALERT_GOVERNANCE_MODE: z.enum(['observe', 'shadow', 'shadow_block', 'enforce']).default('observe'),
  ENABLE_ALERT_GOVERNANCE_SHADOW_BLOCK: z.string().default('false'),
  ENABLE_ALERT_GOVERNANCE_ENFORCE: z.string().default('false'),
  ENABLE_ALERT_GOVERNANCE_HOLDS: z.string().default('true'),
  ENABLE_ALERT_GOVERNANCE_LIVE_RECHECK: z.string().default('true'),
  ALERT_GOVERNANCE_MAX_RESULTS_PER_FIXTURE: z.coerce.number().default(100),
  ALERT_GOVERNANCE_HOLD_TTL_MINUTES: z.coerce.number().default(180),
}).superRefine((val, ctx) => {
  // Conditional validation by persistence provider
  if (val.PERSISTENCE_PROVIDER === 'prisma') {
    if (!val.DATABASE_URL || val.DATABASE_URL.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['DATABASE_URL'], message: 'DATABASE_URL is required when PERSISTENCE_PROVIDER=prisma' })
    }
  } else if (val.PERSISTENCE_PROVIDER === 'firebase') {
    const hasJson = !!val.FIREBASE_SERVICE_ACCOUNT_JSON
    const hasBase64 = !!val.FIREBASE_SERVICE_ACCOUNT_BASE64
    const hasPath = !!val.FIREBASE_SERVICE_ACCOUNT_PATH
    const hasSeparate = !!val.FIREBASE_PROJECT_ID && !!val.FIREBASE_CLIENT_EMAIL && !!val.FIREBASE_PRIVATE_KEY
    if (!hasJson && !hasBase64 && !hasPath && !hasSeparate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FIREBASE_SERVICE_ACCOUNT_JSON'],
        message: 'Firebase credentials required when PERSISTENCE_PROVIDER=firebase (set FIREBASE_SERVICE_ACCOUNT_BASE64, FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_PATH, or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)',
      })
    }
  }
})

export const env = envSchema.parse(process.env)
