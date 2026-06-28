import type { VercelRequest, VercelResponse } from '@vercel/node';
import { detectRuntimeEnvironment, isPersistentWorkerAllowed, isReadOnlyControlPlane } from './_runtimeGuard.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return res.status(200).json({
      ok: true,
      app: 'GoalSense',
      version: '1.0.0',
      buildVersion: process.env.BUILD_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      commitHash: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      dataMode: process.env.DATA_MODE || 'real',
      runtime: {
        environment: detectRuntimeEnvironment(),
        readOnlyControlPlane: isReadOnlyControlPlane(),
        persistentWorkerAllowed: isPersistentWorkerAllowed(),
      },
      providers: {
        apiFootballConfigured: Boolean(process.env.API_FOOTBALL_KEY),
        footballDataConfigured: Boolean(process.env.FOOTBALL_DATA_API_KEY),
      },
      firebase: {
        publicReadConfigured: Boolean(process.env.VITE_FIREBASE_PROJECT_ID && process.env.VITE_FIREBASE_API_KEY),
      },
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
