export interface FirebaseControlPlaneEnvStatus {
  projectIdPresent: boolean;
  apiKeyPresent: boolean;
  authDomainPresent: boolean;
  appIdPresent: boolean;
  requiredMissing: string[];
  optionalMissing: string[];
  firebaseReadableUnknown: boolean;
  firebaseReadable: boolean | null;
  status: 'valid' | 'missing_firebase_env';
  limitations: string[];
}

const REQUIRED = ['VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_API_KEY'] as const;
const OPTIONAL = ['VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID'] as const;

function present(key: string): boolean {
  return !!String(process.env[key] || '').trim();
}

export function getFirebaseControlPlaneEnvStatus(): FirebaseControlPlaneEnvStatus {
  const requiredMissing = REQUIRED.filter(key => !present(key));
  const optionalMissing = OPTIONAL.filter(key => !present(key));
  return {
    projectIdPresent: present('VITE_FIREBASE_PROJECT_ID') || present('FIREBASE_PROJECT_ID'),
    apiKeyPresent: present('VITE_FIREBASE_API_KEY'),
    authDomainPresent: present('VITE_FIREBASE_AUTH_DOMAIN'),
    appIdPresent: present('VITE_FIREBASE_APP_ID'),
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
  };
}

export function validateFirebaseControlPlaneEnv(): boolean {
  return getFirebaseControlPlaneEnvStatus().requiredMissing.length === 0;
}

export function explainMissingFirebaseEnv(): string[] {
  return getFirebaseControlPlaneEnvStatus().requiredMissing.map(key => `${key} is required for Vercel control-plane Firebase reads.`);
}

export function buildFirebaseEnvSafeSummary(): FirebaseControlPlaneEnvStatus {
  return getFirebaseControlPlaneEnvStatus();
}
