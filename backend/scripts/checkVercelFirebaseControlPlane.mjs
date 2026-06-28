#!/usr/bin/env node

const base = (process.env.VERCEL_DEPLOY_URL || process.argv[2] || 'https://goal-sense.vercel.app').replace(/\/$/, '')
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
  const response = await fetch(`${base}${path}`, { cache: 'no-store' }).catch(() => null)
  if (!response?.ok) {
    failed += 1
    console.error(`[FAIL] ${path} -> ${response?.status || 'network'}`)
    continue
  }
  const body = await response.json().catch(() => null)
  const data = body?.data || body
  const summary = {
    ok: body?.ok === true,
    noStore: String(response.headers.get('cache-control') || '').includes('no-store'),
    readOnly: body?.readOnly ?? data?.readOnly ?? data?.readOnlyControlPlane ?? data?.runtime?.readOnlyControlPlane ?? data?.isReadOnlyControlPlane ?? null,
    persistentWorkerAllowed: data?.persistentWorkerAllowed ?? data?.runtime?.persistentWorkerAllowed ?? data?.isPersistentWorkerAllowed ?? null,
    firebaseEnvValid: data?.firebaseEnvValid ?? (data?.status ? data.status === 'valid' : data?.firebaseEnv?.status === 'valid'),
    firebaseEnvStatus: data?.status || data?.env?.status || data?.firebaseEnv?.status || null,
    firebaseReadStatus: data?.freshnessStatus || data?.firebaseReadDiagnostic?.freshnessStatus || null,
    workerRunsReadable: data?.workerRunsReadable ?? data?.firebaseReadDiagnostic?.workerRunsReadable ?? null,
    sessionsReadable: data?.sessionsReadable ?? data?.firebaseReadDiagnostic?.sessionsReadable ?? null,
    leasesReadable: data?.leasesReadable ?? data?.firebaseReadDiagnostic?.leasesReadable ?? null,
    dailyReportsReadable: data?.dailyReportsReadable ?? data?.firebaseReadDiagnostic?.dailyReportsReadable ?? null,
    causalCasesReadable: data?.causalCasesReadable ?? data?.firebaseReadDiagnostic?.causalCasesReadable ?? null,
    freshness: data?.freshness?.freshnessStatus || data?.controlPlaneFreshnessStatus || null,
  }
  console.log(`[PASS] ${path}`, JSON.stringify(summary))
}

if (failed > 0) process.exit(1)
console.log('Vercel Firebase control-plane check completed without invoking worker commands.')
