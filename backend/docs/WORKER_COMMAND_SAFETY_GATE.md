# Worker Command Safety Gate

The safety gate wraps worker operations before a route can start a long-running process.

Guarded commands:

- `start_worker`
- `stop_worker`
- `resume_worker`
- `recovery_sweep`
- `post_match_sweeper`
- `live_monitoring_session`
- `long_polling_loop`

Blocked response shape:

```json
{
  "success": false,
  "status": "blocked_by_runtime_guard",
  "reason": "blocked_in_vercel_production",
  "safeAction": ["run locally", "use CLI", "configure dedicated worker runtime", "read status only"]
}
```

The gate never logs tokens, API keys, Firebase service accounts, or private keys.

The gate does not enable enforce, odds, Telegram, auto-bet, or stake.
