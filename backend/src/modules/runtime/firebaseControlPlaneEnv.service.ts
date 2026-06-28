export interface FirebaseControlPlaneEnvStatus {
  projectIdPresent: boolean
  apiKeyPresent: boolean
  authDomainPresent: boolean
  appIdPresent: boolean
  requiredMissing: string[]
  optionalMissing: string[]
  firebaseReadableUnknown: boolean
  firebaseReadable: boolean | null
  status: 'valid' | 'missing_firebase_env'
  limitations: string[]
}

const REQUIRED = ['VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_API_KEY'] as const
const OPTIONAL = ['VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID'] as const

function present(env: NodeJS.ProcessEnv, key: string): boolean {
  return !!String(env[key] || '').trim()
}

export function getFirebaseControlPlaneEnvStatus(env: NodeJS.ProcessEnv = process.env): FirebaseControlPlaneEnvStatus {
  const requiredMissing = REQUIRED.filter(key => !present(env, key))
  const optionalMissing = OPTIONAL.filter(key => !present(env, key))
  return {
    projectIdPresent: present(env, 'VITE_FIREBASE_PROJECT_ID') || present(env, 'FIREBASE_PROJECT_ID'),
    apiKeyPresent: present(env, 'VITE_FIREBASE_API_KEY'),
    authDomainPresent: present(env, 'VITE_FIREBASE_AUTH_DOMAIN'),
    appIdPresent: present(env, 'VITE_FIREBASE_APP_ID'),
    requiredMissing,
    optionalMissing,
    firebaseReadableUnknown: requiredMissing.length > 0,
    firebaseReadable: null,
    status: requiredMissing.length > 0 ? 'missing_firebase_env' : 'valid',
    limitations: [
      'Safe summary only; Firebase env values are never returned or logged.',
      'VITE Firebase Web config is public configuration, not an Admin SDK service account.',
      ...(requiredMissing.length > 0 ? ['Missing Firebase public env prevents Vercel control-plane Firestore reads.'] : []),
    ],
  }
}

export function validateFirebaseControlPlaneEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return getFirebaseControlPlaneEnvStatus(env).requiredMissing.length === 0
}

export function explainMissingFirebaseEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const status = getFirebaseControlPlaneEnvStatus(env)
  if (status.requiredMissing.length === 0) return []
  return status.requiredMissing.map(key => `${key} is required for Vercel control-plane Firebase reads.`)
}

export function buildFirebaseEnvSafeSummary(env: NodeJS.ProcessEnv = process.env): FirebaseControlPlaneEnvStatus {
  return getFirebaseControlPlaneEnvStatus(env)
}
