# Backend Resolution Worker QA Checklist

## Resolution Type Inference Validated

| Pattern Name | Inferred Type | Result |
|-------------|---------------|--------|
| "Pressão por gol" | goal_pressure | ✅ |
| "Late goal reta final" | late_goal | ✅ |
| "Over 2.5" | over_trend | ✅ |
| "Escanteio iminente" | corner_pressure | ✅ |
| "Cartão provável" | card_heat | ✅ |
| "Favorito em risco" | favorite_risk | ✅ |
| "Zebra possível" | underdog_threat | ✅ |
| "Jogo aberto" | open_game | ✅ |
| "Domínio total" | dominance | ✅ |
| "Radar personalizado" | custom_unknown | ✅ |

## Resolution Windows Validated

| Type | Window | Boundary Test |
|------|--------|---------------|
| goal_pressure | 12 min | Event at min+12 → counts; min+13 → doesn't |
| corner_pressure | 8 min | Event at min+8 → counts; min+9 → doesn't |
| card_heat | 12 min | Event at min+12 → counts; min+13 → doesn't |
| late_goal | 15 min | Event at min+15 → counts |
| custom_unknown | 10 min | Default fallback |

## Goal Resolution Validated

| Scenario | Expected | Result |
|----------|----------|--------|
| Goal event at trigger+6 | confirmed | ✅ |
| Score delta without event | confirmed_partial | ✅ |
| goal_disallowed in window | NOT confirmed | ✅ |
| Shootout goal in window | unknown | ✅ |
| Goal at trigger+20 (outside 12min window) | failed (if data sufficient) | ✅ |
| No snapshots after alert | unknown | ✅ |
| Poor data snapshots only | unknown | ✅ |
| Match finished, no goal, rich data | failed | ✅ |

## Corner Resolution Validated

| Scenario | Expected | Result |
|----------|----------|--------|
| Corner event in window | confirmed | ✅ |
| Corner stat increased, no event | confirmed_partial | ✅ |
| No corner data from provider | unknown | ✅ |
| Window expired with corner data, no corner | failed | ✅ |

## Card Resolution Validated

| Scenario | Expected | Result |
|----------|----------|--------|
| Yellow card event in window | confirmed | ✅ |
| Red card event in window | confirmed | ✅ |
| Card stat increased, no event | confirmed_partial | ✅ |
| No card data from provider | unknown | ✅ |
| Window expired with card data, no card | failed | ✅ |

## Unknown vs Failed Validated

| Condition | Outcome | Result |
|-----------|---------|--------|
| No snapshots available | unknown | ✅ |
| Provider didn't deliver events/stats | unknown | ✅ |
| Match entered shootout | unknown | ✅ |
| Custom type without clear criteria | unknown | ✅ |
| Window expired + sufficient data + no event | failed | ✅ |
| Match finished + rich data + no event | failed | ✅ |

## Duplicate Resolution Guard Validated

| Scenario | Result |
|----------|--------|
| Alert already has AlertResolution | ✅ Skipped |
| Worker runs 3 cycles on same alert | ✅ Only 1 resolution created |
| Transaction fails mid-way | ✅ Neither Alert nor Resolution updated |

## Snapshot Window Analysis Validated

| Check | Result |
|-------|--------|
| Only uses snapshots AFTER alert.createdAt | ✅ |
| Uses LAST snapshot's events (dedup fix) | ✅ |
| Events before triggerMinute excluded | ✅ |
| Events after windowEnd excluded | ✅ |
| Score delta from trigger to last snapshot | ✅ |
| Detects matchFinished (FT/AET) | ✅ |
| Detects inShootout (P/PEN) | ✅ |

## Critical Bug Fixed (B8.1)

| Bug | Cause | Fix |
|-----|-------|-----|
| Event double-counting | Multiple snapshots contain overlapping events (each has full list up to that point). Loop counted events from ALL snapshots. | Now uses only the LAST snapshot's events (most complete) to avoid inflation |

## Performance Integration Validated

| Outcome | Performance Effect |
|---------|-------------------|
| confirmed | Counts in confirmedCount, usefulRate numerator |
| confirmed_partial | Counts in confirmedPartialCount, usefulRate numerator |
| failed | Counts in failedCount, failedRate numerator |
| unknown | Counts in unknownCount, unknownRate (separate) |
| expired | Counts in expiredCount (not in rate denominators) |
| pending | NOT in any rate denominator |

## Safety Confirmed

- ✅ Worker disabled by default
- ✅ Unknown never becomes failed without evidence
- ✅ Shootout never confirms goal pattern
- ✅ Events outside window never confirm
- ✅ Snapshots before alert never used
- ✅ Already-resolved alerts skipped
- ✅ No duplicate resolutions
- ✅ Atomic transaction (Alert + AlertResolution)
- ✅ Backoff on consecutive errors
- ✅ Max alerts per cycle respected
