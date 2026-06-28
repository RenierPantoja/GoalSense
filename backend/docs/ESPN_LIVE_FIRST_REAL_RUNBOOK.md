# ESPN Live-First Real Runbook

Use the persistent worker for long live-first windows:

```bash
npm run build
node scripts/startEspnLiveFirstWorker.mjs --duration 180 --max-fixtures 5 --poll 45
node scripts/getEspnLiveFirstWorkerStatus.mjs
node scripts/runEspnLiveFirstRecoverySweep.mjs
node scripts/runEspnLiveFirstPostMatchSweeper.mjs
```

Keep Telegram, odds, stake, auto-bet, and enforce disabled. Review limitations before treating any case as evaluable.
