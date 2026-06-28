# Vercel Env Example

Use placeholders only in committed files. Add real values through Vercel Dashboard or `vercel env add`.

Required for Firebase control-plane reads today:

```env
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_API_KEY=
```

Optional/conditional Firebase Web App fields:

```env
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
```

Runtime safety:

```env
GOALSENSE_RUNTIME=vercel_control_plane
ENABLE_VERCEL_WORKER_COMMANDS=false
ENABLE_LOCAL_WORKER_COMMANDS=false
ENABLE_ALERT_GOVERNANCE_ENFORCE=false
```

Never add Firebase Admin service accounts, private keys, `.env` files, or backend secrets to the frontend bundle.
