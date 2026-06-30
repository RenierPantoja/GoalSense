# B70 — Current Signal Quality Sample Audit

## Snapshot of the current sample (~57 cases)
| Quality grade | Count |
|---|---|
| reliable_observe | 0 |
| useful_but_limited | 10 |
| noisy_monitor_only | 0 |
| insufficient_data | 27 |
| misleading_candidate | 0 |
| pending_more_sample | 20 |

## What already appeared
- Factual signals (`score_shift`, `fulltime_resolution`) — the main `useful_but_limited` contributors.
- Derived `pressure_shift` candidates — mostly `insufficient_data` (single-snapshot / no stats).

## What is still weak
- ~47% `insufficient_data`: derived signals lacking boxscore stats / timeline.
- ~35% `pending_more_sample`: outcomes not yet resolvable (pending/not_evaluable).
- 0 `reliable_observe`: needs more fixtures that reach full-time with aligned outcomes.

## What is missing to evaluate better
- More completed fixtures (full-time + resolvable outcome).
- Windows where ESPN exposes boxscore stats / timeline (to lift derived signals above insufficient).
- More distinct signalKinds (red_card, late_goal) which are rare in current sample.

## Signals needing more windows
- `pressure_shift`, `possession_shift`, `shots_shift` — derived, stats-dependent.
- `red_card_shift`, `late_goal` — rare events, need more matches.

## Noise candidates
- `pressure_shift` from single snapshots without event/stat support.

## Useful candidates
- `score_shift` confirmed by scoreboard, `fulltime_resolution`.

## Cases for human review
- Any `misleading_candidate` (none currently), `noiseRisk=high`, `useful_but_limited` with missing context, and `partially_aligned` outcomes.

## Starting point
Sample is small and outcome-light. Threshold study is **not_ready_small_sample** (min 200). The multi-window campaign accumulates more sample before any threshold work; everything stays observe-only.
