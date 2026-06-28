import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getControlPlaneReadinessModel } from '../_workerControlPlaneReadModel.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    return res.status(200).json({ ok: true, data: await getControlPlaneReadinessModel() });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: 'control_plane_readiness_failed',
      message: err?.message || 'Unable to build control-plane readiness',
    });
  }
}
