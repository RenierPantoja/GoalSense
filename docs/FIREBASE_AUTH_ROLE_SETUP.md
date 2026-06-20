# Firebase Auth Role Setup (Phase B27)

How the owner assigns roles to GoalSense users. Roles are **Firebase custom claims** set by an
admin process (server-side), never by the client. The client only reads them.

## How roles flow
1. User signs in with Firebase Auth in the browser (email/password or Google).
2. The browser sends the Firebase **ID token** as `Authorization: Bearer <token>` on sensitive calls.
3. The backend verifies the token (`firebase-admin auth().verifyIdToken`) and reads the `role` custom
   claim → maps to GoalSense permissions (B26). No claim ⇒ `viewer` (least privilege).

## Expected claim
- Claim key: `role`
- Allowed values: `owner | admin | operator | analyst | viewer`
- Permissions are **derived** from the role on the backend (see `AUTH_ADMIN_GUARDRAILS.md`); you do
  NOT set individual permissions as claims.

## Setting a role (server-side, local admin script)
Custom claims require the Firebase **Admin SDK** with a service account. Run this on a trusted
machine — **never** in the browser and **never** commit the service account JSON.

```js
// scripts/setRole.mjs  (run locally; do NOT commit the service account)
import admin from 'firebase-admin'
import { readFileSync } from 'node:fs'

const cred = JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(cred) })

const [, , email, role] = process.argv // node scripts/setRole.mjs user@x.com owner
const user = await admin.auth().getUserByEmail(email)
await admin.auth().setCustomUserClaims(user.uid, { role })
console.log(`Set role=${role} for ${email}. User must re-login (or refresh token) to pick it up.`)
process.exit(0)
```

Run: `FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json node scripts/setRole.mjs you@example.com owner`

After setting a claim the user must sign out/in (or the SDK refreshes the ID token) for the new role
to take effect.

## Security rules (do NOT violate)
- The service account JSON is a **secret**. Keep it out of git (it is in `.gitignore`); never paste
  it into frontend code or env files shipped to the browser.
- The frontend uses only the **Web** SDK with `VITE_FIREBASE_*` public config — never the Admin SDK.
- `setCustomUserClaims` is server-only. The client cannot escalate its own role.
- Backend `ENABLE_AUTH=true` in production; keep `ALLOW_DEV_AUTH_BYPASS=false`.

## Frontend envs (public, safe to expose)
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_APP_ID` (required); `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_MESSAGING_SENDER_ID` (optional). When absent, the login UI shows an honest
"Firebase Auth não configurado" state and the app runs in local mode (owner) if the backend has
`ENABLE_AUTH=false`.

## Backend envs (secret — server only)
`FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_PATH` or
`FIREBASE_PROJECT_ID`+`FIREBASE_CLIENT_EMAIL`+`FIREBASE_PRIVATE_KEY`. Required for token verification
when `ENABLE_AUTH=true`.
