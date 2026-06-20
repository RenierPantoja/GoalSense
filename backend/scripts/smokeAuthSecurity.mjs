/**
 * Smoke test — Auth, Admin Guardrails & Security (Phase B26). PURE, no env/network.
 * ─────────────────────────────────────────────────────────────────────────────
 * Imports ONLY env-free pure modules (permissions util, rate limiter, audit
 * sanitizer is tested indirectly). Never imports services that load env/Firebase.
 *
 * Asserts:
 *   - role→permission map is cumulative (owner ⊇ admin ⊇ … ⊇ viewer)
 *   - required permission + auth enabled + not authenticated → 401
 *   - role without permission → 403
 *   - owner with permission + env gate ok → 200
 *   - env gate off → 403 even for owner (auth does not bypass env gate)
 *   - dangerous + requireAdmin + operator → 403; admin/owner → 200
 *   - context: auth off → local owner; auth on + no token → anonymous viewer;
 *     dev bypass only when explicitly allowed
 *   - rate limiter blocks after max within window; resets after window
 *
 * Build first: npm run build
 * Usage: node scripts/smokeAuthSecurity.mjs
 */
const FAILURES = []
function assert(cond, msg) { if (!cond) { FAILURES.push(msg); console.log(`  [FAIL] ${msg}`) } else console.log(`  [ok] ${msg}`) }
async function load(path) {
  try { return await import(path) }
  catch (e) { console.error(`Could not import ${path}. Run \`npm run build\` first.`); console.error(e?.message || e); process.exit(1) }
}

const perm = await load('../dist/modules/auth/utils/authPermissions.util.js')
const rl = await load('../dist/modules/auth/utils/rateLimiter.util.js')

console.log('[smoke] role → permission map (cumulative):')
{
  assert(perm.roleHasPermission('viewer', 'read:alerts'), 'viewer can read alerts')
  assert(!perm.roleHasPermission('viewer', 'run:scan'), 'viewer cannot run scan')
  assert(perm.roleHasPermission('operator', 'run:scan'), 'operator can run scan')
  assert(!perm.roleHasPermission('operator', 'policy:config'), 'operator cannot config policy')
  assert(perm.roleHasPermission('admin', 'policy:config'), 'admin can config policy')
  assert(!perm.roleHasPermission('admin', 'auto:create'), 'admin cannot auto:create')
  assert(perm.roleHasPermission('owner', 'auto:create'), 'owner can auto:create')
  assert(perm.roleHasPermission('owner', 'read:alerts'), 'owner inherits viewer perms (cumulative)')
  assert(perm.roleAtLeast('admin', 'operator') && !perm.roleAtLeast('operator', 'admin'), 'roleAtLeast ordering correct')
}

console.log('[smoke] evaluateAccess decisions:')
{
  const base = { authEnabled: true, authenticated: true, role: 'operator', requiredPermission: 'run:scan', envGatePassed: true, dangerous: false, requireAdminForDangerous: true }
  assert(perm.evaluateAccess(base).allowed, 'operator + run:scan + env ok → allowed')

  const noAuth = perm.evaluateAccess({ ...base, authenticated: false })
  assert(!noAuth.allowed && noAuth.status === 401, 'auth enabled + not authenticated → 401')

  const noPerm = perm.evaluateAccess({ ...base, role: 'viewer' })
  assert(!noPerm.allowed && noPerm.status === 403 && noPerm.reason === 'forbidden_permission', 'viewer lacking permission → 403')

  const envOff = perm.evaluateAccess({ ...base, role: 'owner', requiredPermission: 'learning:rebuild', envGatePassed: false })
  assert(!envOff.allowed && envOff.status === 403 && envOff.reason === 'env_gate_disabled', 'env gate off → 403 even for owner')

  const dangerousOperator = perm.evaluateAccess({ ...base, role: 'operator', requiredPermission: 'run:scan', dangerous: true })
  assert(!dangerousOperator.allowed && dangerousOperator.reason === 'admin_required', 'dangerous + requireAdmin + operator (has perm) → 403 admin_required')

  const dangerousAdmin = perm.evaluateAccess({ ...base, role: 'admin', requiredPermission: 'resolve:now', dangerous: true })
  assert(dangerousAdmin.allowed, 'dangerous + admin → allowed')

  const dangerousOwner = perm.evaluateAccess({ ...base, role: 'owner', requiredPermission: 'auto:create', dangerous: true })
  assert(dangerousOwner.allowed, 'dangerous + owner → allowed')

  // auth disabled → permission still enforced by role, but no 401 (no auth required)
  const authOff = perm.evaluateAccess({ ...base, authEnabled: false, authenticated: false, role: 'viewer', requiredPermission: 'run:scan' })
  assert(!authOff.allowed && authOff.status === 403, 'auth off + viewer role lacking perm → 403 (not 401)')
}

console.log('[smoke] context resolution:')
{
  const off = perm.resolveContextDecision({ authEnabled: false, hasValidToken: false, tokenRole: null, devBypassAllowed: false, devRole: 'owner' })
  assert(off.authenticated && off.role === 'owner' && off.source === 'local_dev', 'auth off → local-dev owner (dev never breaks)')

  const anon = perm.resolveContextDecision({ authEnabled: true, hasValidToken: false, tokenRole: null, devBypassAllowed: false, devRole: 'owner' })
  assert(!anon.authenticated && anon.role === 'viewer' && anon.source === 'anonymous', 'auth on + no token → anonymous viewer')

  const bypassOff = perm.resolveContextDecision({ authEnabled: true, hasValidToken: false, tokenRole: null, devBypassAllowed: false, devRole: 'admin' })
  assert(bypassOff.source === 'anonymous', 'dev bypass NOT applied when flag off')

  const bypassOn = perm.resolveContextDecision({ authEnabled: true, hasValidToken: false, tokenRole: null, devBypassAllowed: true, devRole: 'admin' })
  assert(bypassOn.authenticated && bypassOn.role === 'admin' && bypassOn.source === 'dev_bypass', 'dev bypass applied only when explicitly allowed')

  const token = perm.resolveContextDecision({ authEnabled: true, hasValidToken: true, tokenRole: 'operator', devBypassAllowed: false, devRole: 'owner' })
  assert(token.authenticated && token.role === 'operator' && token.source === 'firebase', 'valid token → role from claim')

  const tokenNoRole = perm.resolveContextDecision({ authEnabled: true, hasValidToken: true, tokenRole: null, devBypassAllowed: false, devRole: 'owner' })
  assert(tokenNoRole.role === 'viewer', 'valid token without role claim → viewer (least privilege)')
}

console.log('[smoke] rate limiter:')
{
  const limiter = new rl.RateLimiter(1000)
  const t0 = 10_000
  let lastAllowed = true
  for (let i = 0; i < 3; i++) lastAllowed = limiter.hit('k', 3, t0 + i).allowed
  assert(lastAllowed, '3 hits within limit of 3 → allowed')
  const blocked = limiter.hit('k', 3, t0 + 4)
  assert(!blocked.allowed && blocked.status !== 200 ? true : !blocked.allowed, '4th hit over limit → blocked')
  assert(blocked.retryAfterMs > 0, 'blocked hit reports retryAfterMs > 0')
  const afterWindow = limiter.hit('k', 3, t0 + 2000)
  assert(afterWindow.allowed, 'after window elapses → allowed again')
  const otherKey = limiter.hit('other', 3, t0 + 4)
  assert(otherKey.allowed, 'different key has independent bucket')
}

if (FAILURES.length > 0) { console.log(`[smoke] FAILED (${FAILURES.length}): ${FAILURES.join(' | ')}`); process.exitCode = 1 }
else console.log('[smoke] OK')
