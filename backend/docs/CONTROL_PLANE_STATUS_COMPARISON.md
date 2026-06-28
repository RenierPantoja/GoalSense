# Control Plane Status Comparison

`controlPlaneStatusComparison.service.ts` compares local worker status with Vercel control-plane status.

Results:

- `in_sync`
- `slightly_delayed`
- `stale`
- `missing_from_control_plane`
- `local_worker_inactive`
- `firebase_unavailable`
- `unknown`

The comparison is diagnostic only. It does not mutate worker state, acquire leases, run recovery, or run post-match learning.
