# B63 Control Plane Empty States

Control-plane states:

- `missing_firebase_env`: Vercel lacks public Firebase Web envs. Show missing key names only.
- `firebase_permission_denied`: Firestore denied read. Check rules.
- `empty_firestore`: Firebase read works, but no sessions/reports were found.
- `stale`: Latest visible worker/report is old.
- `fresh`: Control plane is seeing recent persisted state.

None of these states should cause the frontend to invent patterns, events, outcomes, probabilities, or active workers.
