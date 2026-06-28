import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  detectRuntimeEnvironment,
  explainRuntimeGuardDecision,
  isPersistentWorkerAllowed,
  isReadOnlyControlPlane,
} from './_runtimeGuard.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const environment = detectRuntimeEnvironment();
  return res.status(200).json({
    ok: true,
    environment,
    isPersistentWorkerAllowed: isPersistentWorkerAllowed(),
    isReadOnlyControlPlane: isReadOnlyControlPlane(),
    decisions: {
      startWorker: explainRuntimeGuardDecision('start_worker'),
      resumeWorker: explainRuntimeGuardDecision('resume_worker'),
      recoverySweep: explainRuntimeGuardDecision('recovery_sweep'),
      postMatchSweeper: explainRuntimeGuardDecision('post_match_sweeper'),
      readStatus: explainRuntimeGuardDecision('read_status'),
    },
    limitations: isReadOnlyControlPlane()
      ? ['Vercel is a read-only control plane; persistent ESPN Live-First workers run locally or in a dedicated runtime.']
      : ['Worker commands require an explicit local_worker runtime and safety flags.'],
    timestamp: new Date().toISOString(),
  });
}
