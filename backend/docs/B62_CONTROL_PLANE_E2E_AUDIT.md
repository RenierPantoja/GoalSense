# B62 Control Plane E2E Audit

## Answers

1. Vercel can read `/api/health`, `/api/runtime`, `/api/worker-control-plane/status`, `/api/worker-control-plane/readiness`, worker runs, sessions, leases, fixture states, recovery reports, post-match outcomes, causal-case summaries, and daily reports when Firebase public read configuration permits it.
2. Vercel is prohibited from starting/resuming/stopping persistent workers, running long polling loops, acquiring leases, renewing heartbeats, running destructive recovery, or running post-match writes by default.
3. The local worker must write `espnLiveFirstWorkerRuns`, `liveMonitoringSessions`, `liveMonitoringFixtureStates`, `espnLiveFirstFixtureLeases`, `espnLiveFirstRecoveryReports`, `liveFirstPostMatchOutcomes`, and `dailyValidationReports`.
4. The hosted panel shows latest worker runs through the control-plane status read model.
5. Active sessions are shown from `liveMonitoringSessions`.
6. Leases are shown from `espnLiveFirstFixtureLeases`.
7. Daily reports are shown from `dailyValidationReports`.
8. Causal cases/post-match outcomes are shown from `liveFirstPostMatchOutcomes`.
9. Runtime guard is visible through `/api/runtime`, status payloads, and the Backstage runtime badge.
10. Dangerous commands must be disabled in production; backend/runtime guard also blocks them.
11. `api/misc.ts` preserves public URLs through Vercel rewrites for `/api/runtime`, `/api/worker-control-plane/status`, and `/api/worker-control-plane/readiness`.
12. Cache/stale risk is mitigated with `Cache-Control: no-store`, `generatedAt`, `source`, and explicit freshness classification.

## Drill Boundary

Vercel is a read-only control plane. The only runtime allowed to perform long ESPN Live-First operations is local or dedicated worker runtime with explicit local flags.
