import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getControlPlaneStatusReadModel } from '../_workerControlPlaneReadModel.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    return res.status(200).json({ ok: true, data: await getControlPlaneStatusReadModel() });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: 'control_plane_status_failed',
      message: err?.message || 'Unable to build control-plane status',
    });
  }
}
