#!/usr/bin/env node

const base = (process.env.VERCEL_DEPLOY_URL || process.argv[2] || '').replace(/\/$/, '')
if (!base) {
  console.error('Usage: VERCEL_DEPLOY_URL=https://your-deploy.vercel.app node scripts/checkVercelDeployHealth.mjs')
  process.exit(1)
}

const paths = [
  '/api/health',
  '/api/runtime',
  '/api/worker-control-plane/firebase-env',
  '/api/worker-control-plane/firebase-read-diagnostic',
  '/api/worker-control-plane/status',
  '/api/worker-control-plane/readiness',
]

let failed = 0
for (const path of paths) {
  const url = `${base}${path}`
  const res = await fetch(url, { cache: 'no-store' }).catch(error => ({ ok: false, status: 0, error }))
  if (!res.ok) {
    failed += 1
    console.error(`[FAIL] ${path} -> ${res.status || 'network'}`)
    continue
  }
  const json = await res.json().catch(() => null)
  const safeSummary = {
    ok: json?.ok === true,
    environment: json?.environment || json?.runtime?.environment || json?.data?.runtime?.environment || (json?.data?.readOnlyControlPlane ? 'vercel_production' : 'unknown'),
    readOnly: json?.isReadOnlyControlPlane ?? json?.runtime?.readOnlyControlPlane ?? json?.data?.readOnly ?? json?.data?.readOnlyControlPlane ?? null,
    persistentWorkerAllowed: json?.isPersistentWorkerAllowed ?? json?.runtime?.persistentWorkerAllowed ?? json?.data?.runtime?.persistentWorkerAllowed ?? json?.data?.persistentWorkerAllowed ?? null,
    firebaseEnvStatus: json?.data?.status || json?.data?.env?.status || json?.data?.firebaseEnv?.status || undefined,
    firebaseReadStatus: json?.data?.freshnessStatus || json?.data?.firebaseReadDiagnostic?.freshnessStatus || undefined,
  }
  console.log(`[PASS] ${path}`, JSON.stringify(safeSummary))
}

if (failed > 0) process.exit(1)
console.log('Vercel deploy health check passed without invoking worker commands.')
