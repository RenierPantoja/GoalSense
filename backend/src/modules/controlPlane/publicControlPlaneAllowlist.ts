/**
 * Public Control Plane Allowlist — B66
 * ─────────────────────────────────────────────────────────────────────────────
 * Defines the EXACT set of fields that may be exposed in the public, sanitized
 * control-plane read model (`controlPlanePublicSummaries`). Anything not on the
 * allowlist is dropped. A denylist of forbidden field-name fragments provides a
 * second safety net so raw payloads / secrets / PII can never leak even if a new
 * field is accidentally passed through.
 */

// ── Allowlists (per public document shape) ──────────────────────────────────

export const WORKER_STATUS_ALLOWLIST = [
  'workerRunId', 'status', 'mode', 'startedAt', 'stoppedAt', 'heartbeatAt',
  'fixtureCount', 'sessionCount', 'snapshotsCaptured', 'rechecksTriggered',
  'postMatchResolved', 'warningsCount', 'limitations', 'freshnessStatus',
] as const

export const SESSION_ALLOWLIST = [
  'sessionId', 'status', 'startedAt', 'endedAt', 'fixtureCount',
  'snapshotsCaptured', 'governanceEvaluations', 'rechecks', 'completedFixtures',
  'limitations',
] as const

export const LEASE_ALLOWLIST = [
  'fixtureId', 'sessionId', 'status', 'acquiredAt', 'heartbeatAt',
  'leaseExpiresAt', 'limitations',
] as const

export const DAILY_REPORT_ALLOWLIST = [
  'date', 'backendHealth', 'goNoGoStatus', 'liveFirstReal',
  'espnLiveFixturesAnalyzed', 'snapshotsCaptured', 'liveFirstEvaluableCases',
  'freshness', 'limitations', 'generatedAt',
] as const

export const CAUSAL_CASE_ALLOWLIST = [
  'caseId', 'fixtureId', 'classification', 'evaluable', 'linkStrength',
  'dataMode', 'limitations', 'createdAt',
] as const

// B69: sanitized public signal-quality summary + case preview
export const SIGNAL_QUALITY_SUMMARY_ALLOWLIST = [
  'generatedAt', 'sampleSize', 'signalsReviewed', 'reliableObserve',
  'usefulButLimited', 'noisyMonitorOnly', 'insufficientData', 'misleadingCandidate',
  'pendingMoreSample', 'topUsefulSignals', 'topNoisySignals',
  'governanceFeedbackSummary', 'momentumNoiseFindings', 'recommendedHumanReviewCount',
  'limitations', 'dataMode', 'observeOnly',
] as const

export const SIGNAL_QUALITY_CASE_ALLOWLIST = [
  'caseId', 'fixtureId', 'signalKind', 'evidenceStrength', 'noiseRisk',
  'outcomeAlignment', 'qualityGrade', 'matchMinute', 'limitations', 'createdAt',
] as const

// ── Denylist: forbidden field-name fragments (case-insensitive) ─────────────
// Any field whose key contains one of these fragments is dropped, regardless of
// allowlist, as a defense-in-depth guard.
export const FORBIDDEN_FIELD_FRAGMENTS = [
  'token', 'apikey', 'api_key', 'secret', 'password', 'credential',
  'serviceaccount', 'service_account', 'private', 'privatekey', 'private_key',
  'client_email', 'authorization', 'bearer', 'cookie', 'header',
  'rawpayload', 'raw_payload', 'payload', 'rawjson', 'statsjson', 'eventsjson',
  'sourceurl', 'source_url', 'url', 'endpoint', 'ipaddress', 'ip_address', 'email', 'phone',
  'latitude', 'longitude', 'geo', 'geolocation', 'coordinates', 'stack',
  'enteredby', 'entered_by', 'userid', 'user_id', 'session_cookie',
] as const

// ── Forbidden value patterns (defense-in-depth on values) ───────────────────
const FORBIDDEN_VALUE_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z\-_]{10,}/,            // Firebase / Google API key
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM private key
  /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\./, // JWT
  /[A-Za-z0-9+/]{120,}={0,2}/,          // very long base64 blob (raw payload)
]

function keyIsForbidden(key: string): boolean {
  const k = key.toLowerCase()
  return FORBIDDEN_FIELD_FRAGMENTS.some(fragment => k.includes(fragment))
}

function valueLooksSensitive(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return FORBIDDEN_VALUE_PATTERNS.some(re => re.test(value))
}

/**
 * Pick only allowlisted fields from a source object, dropping forbidden keys and
 * values that look sensitive. Never recurses into raw nested payloads beyond
 * shallow primitives / string arrays / limitations arrays.
 */
export function sanitizeByAllowlist<T extends readonly string[]>(
  source: Record<string, any> | null | undefined,
  allowlist: T,
): Record<string, any> {
  const out: Record<string, any> = {}
  if (!source || typeof source !== 'object') return out
  for (const key of allowlist) {
    if (!(key in source)) continue
    if (keyIsForbidden(key)) continue
    const value = source[key]
    if (value === undefined) continue
    // Only allow primitives, string arrays, and shallow limitation arrays.
    if (Array.isArray(value)) {
      const safeArr = value
        .filter(item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
        .filter(item => !valueLooksSensitive(item))
      out[key] = safeArr
    } else if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      if (valueLooksSensitive(value)) continue
      out[key] = value
    }
    // Objects are intentionally dropped (no nested raw payloads in public model).
  }
  return out
}

/**
 * Audit helper: returns the list of forbidden field fragments found anywhere in
 * an object (recursive). Used by smoke tests to assert no leak.
 */
export function findForbiddenFields(obj: unknown, path = ''): string[] {
  const found: string[] = []
  if (obj === null || obj === undefined) return found
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => found.push(...findForbiddenFields(item, `${path}[${i}]`)))
    return found
  }
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      if (keyIsForbidden(key)) found.push(`${path}.${key}`)
      found.push(...findForbiddenFields(value, `${path}.${key}`))
    }
    return found
  }
  if (valueLooksSensitive(obj)) found.push(`${path}=<sensitive-value>`)
  return found
}
