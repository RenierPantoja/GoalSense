# Match Intelligence — Decision Philosophy

The GoalSense fundamental engine behaves like an elite analyst: it does not alert out
of anxiety, it does not alert on weak data, it waits for decisive information when it
matters, it stays out when there is conflict or low data quality, and it studies every
result afterwards — without calling every miss "bad luck" or every hit "skill".

This document defines the operational philosophy. It is the contract the engines and
the precheck implement. It changes no existing calculation; it only decides
**when to engage and when to stay out**.

## Decision classes

Each opportunity/pattern, in the context of a real match, is classified as one of:

| Class | Meaning |
|---|---|
| `avoid` | Stay out. Weak data, bad context, or fundamentals contradict the pattern. |
| `wait_for_lineup` | Decisive lineup/availability info not out yet — wait before deciding. |
| `wait_for_live_confirmation` | Pre‑match base is thin; wait for live signals to confirm. |
| `monitor` | Worth watching, but no strong alert — observe and re‑evaluate. |
| `alert_candidate` | Plausible alert; needs final confirmation gates to pass. |
| `strong_alert` | Strong alert IF every gate passes (and only when creation is enabled). |
| `post_match_learning_only` | Not for live use; study after the match. |

These are **advisory** in this phase. The Alert Decision Precheck emits them in
`observe` mode and never blocks a real alert (see `ALERT_DECISION_PRECHECK.md`).

## Core rules

1. **Not every detected pattern becomes an alert.** Detection ≠ conviction.
2. **A favorable history alone is not enough.** Context can invalidate history.
3. **Absent data can be a reason to stay out.** Missing critical data → `avoid` or wait.
4. **Missing lineup can be a reason to wait.** If a club's lineup usually drops ~1h
   before kickoff and it is not out yet, prefer `wait_for_lineup`.
5. **A confirmed lineup can invalidate a prior read.** Key absence/return changes the
   picture; recompute, never cling to the pre‑lineup view.
6. **Context dominates history in special matches:** decisive games, classics,
   knockouts, finals/semis can break historical tendencies.
7. **Injuries/suspensions can invalidate a historical pattern** (e.g. clean‑sheet
   pattern with the first‑choice keeper out).
8. **A red card can invalidate a pre‑match assumption.** Game‑state shocks dominate.
9. **A key substitution can shift a live tendency.**
10. **A hit is not luck without analysis; a miss is not chance without investigation.**
    Randomness must be *evidenced* (extreme/unpredictable event), not assumed.

## Honest data discipline (inviolable)

- `unknown` ≠ `failed`. `not_evaluable` ≠ `failed`. Absent ≠ zero.
- Unknown injury ≠ "no injury". Unknown suspension ≠ "no suspension". Missing lineup ≠
  "empty lineup". A pending/expired outcome is never a failure.
- Partial data must be marked partial. Provider gaps must be explicit. Analysis without
  enough base must say `not_analyzable` / `insufficient_history`.
- Small samples are marked small and never over‑weighted. No tabu/curse without sample
  and context. An unknown classic is not a classic; an unknown stage is not a final.

## What this phase does NOT do

No cloud, no billing, no odds, no Telegram, no auto‑bet, no stake, no promise of
accuracy. It does not change patterns, does not change runtime score/confidence without
governance, and does not create automatic alerts. It builds the structure for deep
analysis, entry/stay‑out decisions, and logical post‑match learning.
