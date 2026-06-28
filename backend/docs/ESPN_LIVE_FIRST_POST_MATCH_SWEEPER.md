# ESPN Live-First Post-Match Sweeper

The post-match sweeper resolves completed live-first fixtures after monitoring ends.

## Flow

1. Find monitored fixture states marked full-time or completed.
2. Build the final live-first snapshot from persisted state.
3. Resolve outcome only when final status and score are known.
4. Save a live-first post-match outcome.
5. Create a conservative causal case only for evaluable outcomes.
6. Keep weak contextual links weak.
7. Update daily reporting through persisted outcomes.

## Not Evaluable

A fixture remains not_evaluable when:

- final status is not confirmed;
- final score is absent;
- no snapshots were captured;
- the persisted state is missing;
- ESPN did not provide a reliable final.

The sweeper does not apply calibration, enable enforce, send Telegram, use odds, or classify without outcome.
