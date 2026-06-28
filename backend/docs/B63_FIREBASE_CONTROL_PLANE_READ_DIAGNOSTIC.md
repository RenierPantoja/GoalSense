# B63 Firebase Control Plane Read Diagnostic

The diagnostic route is read-only:

```text
GET /api/worker-control-plane/firebase-read-diagnostic
```

It reports:

- `firebaseEnvValid`
- `firebaseInitialized`
- `workerRunsReadable`
- `sessionsReadable`
- `leasesReadable`
- `dailyReportsReadable`
- `causalCasesReadable`
- `permissionDenied`
- `missingIndex`
- `emptyCollections`
- `lastErrorSafe`
- `freshnessStatus`

No env values, API keys, tokens, or service account data are returned.
