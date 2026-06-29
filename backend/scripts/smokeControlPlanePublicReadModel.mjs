#!/usr/bin/env node
/**
 * Smoke: Control Plane Public Read Model (B66)
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates sanitization (allowlist + denylist), throttle, and safety invariants
 * of the sanitized public control-plane read model. No secrets, no raw payloads.
 */
process.env.DATABASE_URL ||= 'file:./local.db'
process.env.ENABLE_PUBLIC_CONTROL_PLANE_READ_MODEL ||= 'true'
process.env.ENABLE_RAW_CONTROL_PLANE_READ_FALLBACK ||= 'false'
process.env.CONTROL_PLANE_PUBLIC_SNAPSHOT_MIN_INTERVAL_SECONDS ||= '30'

let pass = 0, fail = 0
function record(ok, name, detail = '') {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ' - ' + detail : ''}`) }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ' - ' + detail : ''}`) }
}

const allow = await import('../dist/modules/controlPlane/publicControlPlaneAllowlist.js')
const model = await import('../dist/modules/controlPlane/controlPlanePublicReadModel.service.js')

// 1. allowlist removes a forbidden field
const sanitized = allow.sanitizeByAllowlist(
  { status: 'running', token: 'abc', apiKey: 'AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', rawPayload: { big: 'x'.repeat(200) }, startedAt: '2026-01-01T00:00:00Z' },
  allow.WORKER_STATUS_ALLOWLIST,
)
record(!('token' in sanitized) && !('apiKey' in sanitized) && !('rawPayload' in sanitized), 'allowlist removes forbidden fields')
record('status' in sanitized && 'startedAt' in sanitized, 'allowlist keeps minimal safe fields')

// 2. forbidden-value detection (API key inside an allowed-by-name field)
const sanitized2 = allow.sanitizeByAllowlist({ status: 'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345' }, allow.WORKER_STATUS_ALLOWLIST)
record(!('status' in sanitized2), 'allowlist drops sensitive-looking value (API key pattern)')

// 3. findForbiddenFields detects leaks
const leaks = allow.findForbiddenFields({ ok: true, nested: { authorization: 'Bearer x', statsJson: '{}' } })
record(leaks.length >= 2, 'findForbiddenFields detects nested forbidden keys', String(leaks.length))

// 4. snapshot build does not contain forbidden fields / secrets / raw payload
const docs = await model.buildPublicControlPlaneSnapshot()
const allLeaks = docs.flatMap(d => allow.findForbiddenFields(d.data, d.id))
record(allLeaks.length === 0, 'public snapshot contains no forbidden fields', allLeaks.join(',') || 'clean')
const serialized = JSON.stringify(docs)
record(!/AIza[0-9A-Za-z\-_]{10,}/.test(serialized), 'public snapshot contains no API key')
record(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(serialized), 'public snapshot contains no private key')
record(!/statsJson|eventsJson|rawPayload/i.test(serialized), 'public snapshot contains no raw payload field')
record(!/odds|stake|telegram/i.test(serialized), 'public snapshot contains no odds/stake/telegram')

// 5. snapshot contains the expected minimal docs
const ids = docs.map(d => d.id)
const expected = ['latestWorkerStatus', 'latestLiveSessions', 'latestLeases', 'latestDailyReport', 'latestCausalCases', 'latestRecoveryStatus', 'freshness']
record(expected.every(id => ids.includes(id)), 'public snapshot has minimal required docs', ids.join(','))

// 6. throttle is respected
model.__resetPublicSnapshotThrottle()
const first = await model.publishPublicControlPlaneSnapshot()
const second = await model.publishPublicControlPlaneSnapshot()
record(second.published === false && second.reason === 'throttled', 'publish respects throttle', second.reason)
const forced = await model.publishPublicControlPlaneSnapshot({ force: true })
record(forced.reason !== 'throttled', 'force bypasses throttle', forced.reason)

// 7. disabled flag short-circuits
process.env.ENABLE_PUBLIC_CONTROL_PLANE_READ_MODEL = 'false'
model.__resetPublicSnapshotThrottle()
const disabled = await model.publishPublicControlPlaneSnapshot()
record(disabled.published === false && disabled.reason === 'public_read_model_disabled', 'disabled flag short-circuits publish')
process.env.ENABLE_PUBLIC_CONTROL_PLANE_READ_MODEL = 'true'

// 8. raw fallback default off in production posture
record(String(process.env.ENABLE_RAW_CONTROL_PLANE_READ_FALLBACK) === 'false', 'raw fallback disabled by default')

console.log(`\nSmoke result: ${pass} passed, ${fail} failed.`)
process.exit(fail === 0 ? 0 : 1)
