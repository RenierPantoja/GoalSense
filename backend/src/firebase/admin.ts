/**
 * Firebase Admin initialization (Phase E1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lazily initializes Firebase Admin only when PERSISTENCE_PROVIDER=firebase.
 * Accepts either FIREBASE_SERVICE_ACCOUNT_JSON or separate vars.
 * Credentials NEVER leave the backend.
 */
import { env } from '../env.js'
import { readFileSync } from 'node:fs'

// Dynamic import so firebase-admin is only loaded when actually needed.
// This keeps the Prisma path free of the firebase-admin dependency at runtime.

let firestoreInstance: any = null
let initialized = false

interface ServiceAccountCreds {
  projectId: string
  clientEmail: string
  privateKey: string
}

function resolveCredentials(): ServiceAccountCreds | null {
  // Option 1: full JSON (inline string)
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)
      return {
        projectId: parsed.project_id || parsed.projectId,
        clientEmail: parsed.client_email || parsed.clientEmail,
        privateKey: (parsed.private_key || parsed.privateKey || '').replace(/\\n/g, '\n'),
      }
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON')
    }
  }
  // Option 2: path to a service account JSON file (local convenience; never commit the file)
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    let raw: string
    try {
      raw = readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8')
    } catch {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH could not be read: ${env.FIREBASE_SERVICE_ACCOUNT_PATH}`)
    }
    try {
      const parsed = JSON.parse(raw)
      return {
        projectId: parsed.project_id || parsed.projectId,
        clientEmail: parsed.client_email || parsed.clientEmail,
        privateKey: (parsed.private_key || parsed.privateKey || '').replace(/\\n/g, '\n'),
      }
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH file is not valid JSON')
    }
  }
  // Option 3: separate vars
  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }
  }
  return null
}

/**
 * Initialize Firebase Admin and return the Firestore instance.
 * Throws a clear error if credentials are missing.
 */
export async function getFirestore(): Promise<any> {
  if (firestoreInstance) return firestoreInstance

  const creds = resolveCredentials()
  if (!creds) {
    throw new Error('Firebase credentials not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.')
  }

  // Dynamic import keeps firebase-admin optional for the Prisma path.
  // The module name is held in a variable so tsc does not statically resolve it
  // (firebase-admin only needs to be installed when PERSISTENCE_PROVIDER=firebase).
  const moduleName = 'firebase-admin'
  const admin: any = await import(moduleName).catch(() => {
    throw new Error('firebase-admin is not installed. Run: npm install firebase-admin (in backend/)')
  })

  if (!initialized) {
    const app = (admin.default || admin)
    if (!app.apps?.length) {
      app.initializeApp({
        credential: app.credential.cert({
          projectId: creds.projectId,
          clientEmail: creds.clientEmail,
          privateKey: creds.privateKey,
        }),
      })
    }
    initialized = true
    firestoreInstance = app.firestore()
    console.log(`[Firebase] Admin initialized for project ${creds.projectId}`)
  }

  return firestoreInstance
}

export function isFirebaseConfigured(): boolean {
  return !!(env.FIREBASE_SERVICE_ACCOUNT_JSON || env.FIREBASE_SERVICE_ACCOUNT_PATH || (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY))
}

/** Mask a project id for diagnostics (project ids are low-sensitivity, but we mask anyway). */
function maskProjectId(id: string): string {
  if (!id) return ''
  if (id.length <= 7) return `${id.slice(0, 2)}***`
  return `${id.slice(0, 4)}***${id.slice(-3)}`
}

let cachedDiagnostics: { configured: boolean; projectId: string | null } | null = null

/**
 * Non-secret Firebase diagnostics for /health. Never exposes the private key,
 * client email, or the service-account file path. Resolves credentials once.
 */
export function getFirebaseDiagnostics(): { configured: boolean; projectId: string | null } {
  if (cachedDiagnostics) return cachedDiagnostics
  try {
    const creds = resolveCredentials()
    cachedDiagnostics = creds
      ? { configured: true, projectId: maskProjectId(creds.projectId || '') }
      : { configured: false, projectId: null }
  } catch {
    cachedDiagnostics = { configured: false, projectId: null }
  }
  return cachedDiagnostics
}
