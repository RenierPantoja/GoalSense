# Control Plane Public Field Allowlist — B66

Source: `backend/src/modules/controlPlane/publicControlPlaneAllowlist.ts`

## Allowlisted fields (only these may be published)
- **Worker status**: workerRunId, status, mode, startedAt, stoppedAt, heartbeatAt, fixtureCount, sessionCount, snapshotsCaptured, rechecksTriggered, postMatchResolved, warningsCount, limitations, freshnessStatus
- **Session**: sessionId, status, startedAt, endedAt, fixtureCount, snapshotsCaptured, governanceEvaluations, rechecks, completedFixtures, limitations
- **Lease**: fixtureId, sessionId, status, acquiredAt, heartbeatAt, leaseExpiresAt, limitations
- **Daily report**: date, backendHealth, goNoGoStatus, liveFirstReal, espnLiveFixturesAnalyzed, snapshotsCaptured, liveFirstEvaluableCases, freshness, limitations, generatedAt
- **Causal case**: caseId, fixtureId, classification, evaluable, linkStrength, dataMode, limitations, createdAt

## Forbidden field-name fragments (dropped even if allowlisted)
token, apikey/api_key, secret, password, credential, serviceaccount/service_account,
private/privatekey/private_key, client_email, authorization, bearer, cookie, header,
rawpayload/raw_payload, payload, rawjson, statsjson, eventsjson, sourceurl/source_url,
url, endpoint, ipaddress/ip_address, email, phone, latitude, longitude, geo,
geolocation, coordinates, stack, enteredby/entered_by, userid/user_id, session_cookie.

## Forbidden value patterns (dropped on match)
- Google/Firebase API key: `AIza...`
- PEM private key blocks
- JWTs (`eyJ...`)
- Very long base64 blobs (raw payloads)

## Defense in depth
`findForbiddenFields()` recursively scans the assembled snapshot before publish;
any document containing a forbidden key or sensitive-looking value is dropped and
reported in `forbiddenFieldsFound`. Host identifiers (`processId`, `hostId`,
`owner`) and free-text `errors`/`warnings` are intentionally excluded from the
allowlist (warnings reduced to `warningsCount`).
