/**
 * Shared Firebase Admin bootstrap for maintenance scripts (Phase E7).
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolves credentials the same way as src/firebase/admin.ts:
 *   FIREBASE_SERVICE_ACCOUNT_JSON | FIREBASE_SERVICE_ACCOUNT_PATH | 3 separate vars
 * Reads backend/.env automatically. Never logs secrets. No writes here.
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'

function resolveCredentials() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const p = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    return { projectId: p.project_id || p.projectId, clientEmail: p.client_email || p.clientEmail, privateKey: (p.private_key || p.privateKey || '').replace(/\\n/g, '\n') }
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const raw = readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8')
    const p = JSON.parse(raw)
    return { projectId: p.project_id || p.projectId, clientEmail: p.client_email || p.clientEmail, privateKey: (p.private_key || p.privateKey || '').replace(/\\n/g, '\n') }
  }
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return { projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }
  }
  return null
}

export async function getFirestore() {
  const creds = resolveCredentials()
  if (!creds) {
    throw new Error('Firebase credentials not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH (or _JSON, or the 3 separate vars) in backend/.env')
  }
  const admin = (await import('firebase-admin')).default
  if (!admin.apps?.length) {
    admin.initializeApp({ credential: admin.credential.cert(creds) })
  }
  console.log(`[scripts] Firebase Admin connected to project ${creds.projectId}`)
  return admin.firestore()
}

/** Parse common CLI flags. */
export function parseFlags(argv) {
  const args = argv.slice(2)
  return {
    confirm: args.includes('--confirm'),
    dryRun: !args.includes('--confirm'),
    arg(name, def) {
      const i = args.indexOf(`--${name}`)
      return i >= 0 && args[i + 1] ? args[i + 1] : def
    },
  }
}
