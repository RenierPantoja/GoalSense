# B63 Vercel Firebase Env Wiring

Goal: allow the hosted read-only control plane to read persisted Firebase state without enabling worker execution in Vercel.

Required production envs:

- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_API_KEY`

Optional/conditional:

- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`

Do not add Firebase Admin service accounts or private keys for this frontend/control-plane read path.
