# Backend Pattern Worker QA Checklist

## Hard Gates Validated

| Gate | Test | Result |
|------|------|--------|
| Pattern paused | status !== 'active' | ✅ Blocked |
| Pattern archived | status === 'archived' | ✅ Blocked |
| Pattern suggest_only | action === 'suggest_only' | ✅ Blocked |
| Pattern highlight | action === 'highlight' | ✅ Blocked |
| Match not live | status not in [1H, 2H, HT, ET, BT] | ✅ Blocked |
| Penalty shootout | status P/PEN | ✅ Blocked |
| Finished match | status FT/AET | ✅ Blocked |
| Cancelled/postponed | status CANC/PST/SUSP | ✅ Blocked |
| Stale snapshot | > 5 min old | ✅ Skipped |
| Poor data + critical | severity=critical, quality=poor | ✅ Blocked |
| requireRichData + partial | requireRichData=true, quality≠rich | ✅ Blocked |
| No conditions | empty conditions array | ✅ Blocked |
| Duplicate signature | same sig within 5min | ✅ Blocked |
| Same pattern+fixture | within 5min window | ✅ Blocked |

## Condition Evaluation Validated

| Condition | Absent Data Behavior | Result |
|-----------|---------------------|--------|
| is_live | N/A (uses status) | ✅ |
| minute_between | minute null → false | ✅ |
| score_tied | Always available | ✅ |
| score_diff_lte | Always available | ✅ |
| goals_total_gte/lte | Always available | ✅ |
| possession_gte | stats null → false | ✅ |
| shots_on_target_gte | stats null → false | ✅ |
| corners_gte | stats null → false | ✅ |
| cards_gte | stats null → false | ✅ |
| is_final_phase | minute null → false | ✅ |
| shots_total_gte | stats null → false | ✅ |
| Unknown type | → false (conservative) | ✅ |

## Momentum Validated

| Scenario | Source | Strength | Result |
|----------|--------|----------|--------|
| 4+ offensive events in window | timed_events | strong | ✅ |
| 2-3 offensive events | timed_events | moderate | ✅ |
| 1 offensive event | timed_events | weak | ✅ |
| Events exist but none offensive in window | stats_proxy or insufficient | weak/none | ✅ |
| No events, has stats | stats_proxy | weak | ✅ |
| No events, no stats | insufficient | none | ✅ |
| Cards/substitutions only | NOT counted as offensive | ✅ |
| Minute null | insufficient | none | ✅ |

## Confidence Validated

| Scenario | Expected | Result |
|----------|----------|--------|
| All conditions + rich + strong momentum | ~100 (capped 99) | ✅ |
| 70% conditions + timed_events + rich | ~76 | ✅ |
| 50% conditions + stats_proxy + partial | ~45 | ✅ |
| < 50% conditions | watch_only, no alert | ✅ |
| Confidence never > 99 | Math.min(conf, 99) | ✅ |
| Confidence never < 0 | matchRatio >= 0 | ✅ |

## Signal States Validated

| State | Criteria | Creates Alert? |
|-------|----------|---------------|
| ready_to_alert | conf >= min AND ratio >= 0.7 AND momentum.strength !== 'none' | ✅ Yes |
| strong_candidate | conf >= min AND ratio >= 0.6 | ✅ No |
| watch_only | ratio >= 0.5 but insufficient | ✅ No |
| blocked | Hard gate failed | ✅ No |

## Duplicate Guard Validated

| Scenario | Result |
|----------|--------|
| Same signature within 5min | ✅ Blocked |
| Same pattern+fixture within 5min | ✅ Blocked |
| Score changed (new signature) | ✅ Allowed |
| Minute bucket advanced (new signature) | ✅ Allowed |
| 3 consecutive worker cycles | ✅ Only 1 alert created |

## Evidence Completeness

Every alert created contains:
- ✅ patternId, patternName
- ✅ fixtureId, homeTeam, awayTeam, competition
- ✅ triggerMinute, triggerScoreHome, triggerScoreAway
- ✅ confidence, signalState
- ✅ evidenceJson (reasons, severity, triggerSnapshot, source)
- ✅ temporalEvidenceJson (momentumSource, recencyConfidence, recentEventsUsed)
- ✅ duplicateSignature
- ✅ source = 'backend_worker'

## Safety Hardening Applied (B7.1)

| Fix | Description |
|-----|-------------|
| Non-null assertion removed | `possessionAway!` → `possessionAway ?? 0` |
| Highlight action blocked | Same as suggest_only |
| Momentum clarity | Restructured count=0 logic to avoid dead code path |
| Blockers populated | Momentum adds blockers when falling back to proxy/insufficient |

## Criteria for Production Activation

Before setting `PATTERN_WORKER_ENABLED=true` in production:
1. ✅ Backend deployed with DB access
2. ✅ Live monitor running and capturing snapshots
3. ✅ Summary enrichment active (rich snapshots available)
4. ✅ At least 1 active pattern in DB
5. ✅ /api/pattern-worker/status accessible
6. ✅ /api/alerts shows correct data
7. ⬜ Telegram integration ready (Phase B8)
8. ⬜ Frontend consuming backend alerts (Phase B9)
