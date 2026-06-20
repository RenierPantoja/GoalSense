/**
 * Firebase Auth client (Phase B27) — SAFE, optional initialization.
 * ─────────────────────────────────────────────────────────────────────────────
 * Initializes Firebase Auth ONLY when all required VITE_FIREBASE_* envs are present.
 * Never uses the Admin SDK. Never holds a service account. When unconfigured,
 * returns null so the app shows an honest "not configured" state (no crash).
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  storageBucket?: string
  messagingSenderId?: string
}

function readConfig(): FirebaseWebConfig | null {
  const e = import.meta.env
  const apiKey = e.VITE_FIREBASE_API_KEY
  const authDomain = e.VITE_FIREBASE_AUTH_DOMAIN
  const projectId = e.VITE_FIREBASE_PROJECT_ID
  const appId = e.VITE_FIREBASE_APP_ID
  if (!apiKey || !authDomain || !projectId || !appId) return null
  return {
    apiKey, authDomain, projectId, appId,
    storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
  }
}

let cachedAuth: Auth | null = null
let triedInit = false

export function isFirebaseAuthConfigured(): boolean {
  return readConfig() !== null
}

/** Returns the Firebase Auth instance, or null when not configured / init failed. */
export function getFirebaseAuth(): Auth | null {
  if (cachedAuth) return cachedAuth
  if (triedInit) return cachedAuth
  triedInit = true
  const config = readConfig()
  if (!config) return null
  try {
    // Reuse an existing app (src/lib/firebase.ts may have created one) when present.
    const app: FirebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(config, 'goalsense-auth')
    cachedAuth = getAuth(app)
    return cachedAuth
  } catch {
    cachedAuth = null
    return null
  }
}
