# Vercel Control Plane Operation

Use production Vercel as a visual control plane:

1. Run the ESPN Live-First worker locally or in a dedicated worker runtime.
2. Let the worker persist runs, sessions, leases, snapshots, reports, and post-match outcomes to Firebase.
3. Open `https://goal-sense.vercel.app`.
4. Use Backstage to inspect runtime, freshness, sessions, leases, reports, and causal cases.

Do not use Vercel to start persistent workers or long polling loops.

B63 requires Firebase Web envs in Vercel Production before the hosted panel can see persisted worker state. Missing env is shown explicitly and is not treated as empty data.
