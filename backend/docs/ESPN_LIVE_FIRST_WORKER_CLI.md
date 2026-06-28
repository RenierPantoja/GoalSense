# ESPN Live-First Worker CLI

Build first:

```bash
npm run build
```

Commands:

```bash
node scripts/startEspnLiveFirstWorker.mjs --duration 180 --max-fixtures 5 --poll 45
node scripts/getEspnLiveFirstWorkerStatus.mjs
node scripts/stopEspnLiveFirstWorker.mjs <workerRunId>
node scripts/resumeEspnLiveFirstWorker.mjs <workerRunId>
node scripts/runEspnLiveFirstRecoverySweep.mjs
node scripts/runEspnLiveFirstPostMatchSweeper.mjs
node scripts/smokeEspnLiveFirstPersistentWorker.mjs
```

The CLI prints operational IDs and summaries only. It must not print API keys, tokens, Firebase service accounts, Telegram tokens, odds keys, or raw secrets.

## B61 Control Plane Split

Use these CLI scripts from the local/dedicated worker runtime. Do not run long ESPN Live-First sessions from Vercel. Hosted Backstage may show status and instructions, but worker commands are blocked in Vercel by the runtime guard.
