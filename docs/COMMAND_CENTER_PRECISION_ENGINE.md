# Command Center Precision Engine — Performance Analytics

## Overview

The Performance Analytics module (`patternPerformanceAnalytics.ts`) transforms real alert history into actionable intelligence. It is the single source of truth for pattern reliability, rates, and recommendations across the entire Command Center UI.

## Architecture

```
patternPerformanceAnalytics.ts
├── buildPatternPerformanceReport(pattern, commandAlerts, triggeredAlerts)
├── buildAllPerformanceReports(patterns, commandAlerts, triggeredAlerts)
├── RELIABILITY_TONE (UI color tokens)
└── RELIABILITY_LABEL (human-readable labels)

patternHealthEngine.ts (complementary)
├── buildPatternHealth(pattern, triggeredAlerts, commandAlerts)
├── HEALTH_TONE (UI color tokens)
└── isReviewableHealth(status)
```

Both engines use the same underlying alert data. They complement each other:
- **Health Engine**: operational status (no_data, warming_up, healthy, noisy, underperforming, stale, needs_review)
- **Analytics Engine**: reliability label (insufficient_sample, promising, reliable, noisy, data_limited, underperforming)

## PerformanceView Integration (V9B)

The PerformanceView tab uses `buildAllPerformanceReports` as its primary data source:

1. **Reliability Summary Cards** — top-level overview showing count of patterns per reliability label
2. **PatternStatRow** — each row shows both health badge AND reliability badge, plus rates and recommendations
3. **Confiabilidade Analítica** — expandable cards with full detail per pattern
4. **Local Backtest** — table with all metrics, clearly labeled as browser-local history
5. **Honest Copy** — disclaimers about unknown, sample size, local history

## Pattern Studio Integration (V9B)

- **ConfiguredRadarRow**: shows reliability badge with tooltip (sampleSize, usefulRate, recommendation)
- **TemplateCard**: shows reliability badge from the instance (only when instance exists; template without instance shows no performance)

## Reliability Labels

| Label | Condition | Meaning |
|-------|-----------|---------|
| `insufficient_sample` | sampleSize < 5 | Not enough data to evaluate |
| `promising` | usefulRate ≥ 0.4 | Shows potential, needs more data |
| `reliable` | usefulRate ≥ 0.55 | Consistently useful |
| `noisy` | usefulRate < 0.4 AND failedRate > 0.35 | Too many false positives |
| `data_limited` | unknownRate > 0.4 | Provider doesn't deliver enough data |
| `underperforming` | failedRate > 0.5 | Mostly fails |

## Sample Size Minimum

- Rates (confirmedRate, usefulRate, failedRate) require **5 resolved alerts** (confirmed + partial + failed)
- unknownRate requires **5 total alerts**
- Below threshold: shows "Amostra insuficiente" — never a fake percentage

## Unknown Handling

- **Unknown does NOT count as failure**
- Unknown means the provider didn't deliver enough data to confirm or deny
- unknownRate is tracked separately and triggers "data_limited" reliability
- Recommendations guide the user to use `requireRichData` or restrict leagues

## Grouping Breakdowns (Advanced Mode)

In expanded view, each pattern shows performance grouped by:

- **byMomentumSource**: timed_events, mixed, stats_proxy, insufficient
- **byDataQuality**: rich, partial, poor
- **byProvider**: ESPN, unknown, etc.

Each group shows: total, confirmed, partial, failed, unknown, usefulRate

## Local Backtest

- Shows all patterns with sampleSize > 0 in a table
- Columns: Amostra, Confirmados, Parciais, Falhas, Unknown, Taxa útil, Taxa conf., Limitação
- **Clearly labeled**: "Backtest local baseado apenas no histórico salvo neste navegador"
- **Disclaimer**: "Performance passada não garante resultado futuro"

## Limits

- No backend — history is browser-local (localStorage)
- Small samples don't generate strong conclusions
- Performance depends on the provider delivering events/resolutions
- Clearing browser data erases all history

## Live Pattern Dry-Run (V10)

### Overview

The dry-run feature allows users to test a pattern against current fixtures using the exact same evaluator and precision engine that the live system uses, **without registering alerts, sending notifications, or altering history**.

### How It Works

1. User clicks "Testar ao vivo" in the CustomPatternModal or TemplateConfigModal
2. The system validates the pattern draft (name, conditions, scope)
3. `runPatternDryRun()` evaluates the pattern against all loaded fixtures (capped at 50)
4. Results show what would happen if the pattern were active

### Engine: `patternDryRunEngine.ts`

```
runPatternDryRun({ pattern, fixtures, statsMap, eventsMap, isFavoriteTeam })
→ PatternDryRunResult[]
```

Uses:
- `evaluatePattern()` — real evaluator with scope/exclusion checks
- `applyPrecisionChecks()` — real precision engine with data quality caps, momentum validation, strict mode

Does NOT call:
- `triggerAlert`
- `registerCommandAlert`
- `localStorage` writes
- `updatePattern` / `createPattern`
- Any notification system

### Result Fields

| Field | Description |
|-------|-------------|
| `fixtureId` | Fixture identifier |
| `matchLabel` | "Home x Away" |
| `matched` | Whether the evaluator matched this fixture |
| `signalState` | ready_to_alert, strong_candidate, watch_only, blocked, insufficient_data, out_of_scope |
| `rawConfidence` | Confidence before precision adjustments |
| `adjustedConfidence` | Confidence after data quality caps and momentum |
| `dataQuality` | rich, partial, poor |
| `momentumSource` | timed_events, mixed, stats_proxy, insufficient |
| `blockers` | Reasons preventing alert |
| `reasons` | Evidence supporting the signal |
| `recentEventsUsed` | Timed events in the momentum window |
| `wouldAlert` | Whether this would trigger an alert |
| `wouldNotify` | Whether this would send a notification |

### Validation

Before running, the engine validates:
- Pattern has a name
- Pattern has at least one condition
- Pattern has a valid scope

If validation fails, errors are shown inline without running the dry-run.

### UI Integration

- **CustomPatternModal**: "Testar ao vivo" button in footer, available on all steps
- **TemplateConfigModal**: "Testar template agora" button in footer
- **PatternDryRunPanel**: Full-screen overlay with summary cards, filters, and expandable result rows

### Filters

- Todos (all matched)
- Prontos (ready_to_alert)
- Candidatos (strong_candidate)
- Bloqueados (blocked + watch_only)
- Sem dados (insufficient_data)

### Scope Respect

Dry-run respects all scope and exclusion settings:
- scope / scopeFilter
- matches / excludeMatches
- excludeLeagues / excludeTeams
- requireRichData / onlyLive / onlyPreMatch

### Performance Limits

- Capped at 50 fixtures (prioritizes live matches)
- Uses the same fixture/stats/events data already loaded by CommandCenterPage
- No additional network requests

### How to Use for Calibration

1. Create or edit a pattern
2. Click "Testar ao vivo" to see which current matches would trigger
3. If too many blocked → relax conditions or lower minConfidence
4. If too many ready_to_alert → tighten conditions or raise minConfidence
5. Check momentum source and data quality to understand signal strength
6. Adjust scope/exclusions based on which matches appear


## Auto-Discovery Precision Integration (V11)

### Problem

Before V11, auto-discovery operated as a parallel flow with weaker validation:
- Used raw confidence without data quality caps
- No momentum validation
- No temporal evidence
- No anti-duplicate with manual patterns
- Could register alerts with poor data

### Solution

Auto-discovery now passes through `autoDiscoveryPrecisionGate.ts` before any alert is registered. The gate applies the same precision checks as manual patterns.

### Architecture

```
autoDiscoveryEngine.ts → AutoDiscovery[]
                              ↓
autoDiscoveryPrecisionGate.ts
├── buildAutoDiscoveryCandidate(discovery, config)
├── validateAutoDiscoveryCandidate(candidate, fixture, stats, events, config, manualAlertIds)
└── validateAllAutoDiscoveries(discoveries, statsMap, eventsMap, config, manualAlertIds)
                              ↓
CommandCenterPage (only registers if validation.wouldAlert === true)
```

### Candidate Validation

Each auto-discovery is converted to an `AutoDiscoveryCandidate` with a synthetic pattern-like object, then validated through:

1. **Data quality assessment** — same as manual patterns (rich/partial/poor)
2. **Confidence caps** — rigor-specific caps per data quality level
3. **Hard gates** — requireRichData, live check, finished check, suggest_only check
4. **Anti-duplicate** — checks if manual pattern already alerted for same fixture
5. **Momentum validation** — for offensive discovery types (pressure, dominance, open_game, final_phase)
6. **Momentum source caps** — timed_events: 90, mixed: 80, stats_proxy: 60, insufficient: 45
7. **Conservative rigor gates** — attention-level discoveries require timed events
8. **Final confidence check** — must meet minConfidence after all adjustments

### States

| State | Meaning |
|-------|---------|
| `ready_to_alert` | All gates passed, will register alert |
| `suggestion` | Close to threshold, shown as suggestion only |
| `watch_only` | Confidence too low or minor blockers |
| `blocked` | Hard gate failed (suggest_only, finished, manual duplicate) |
| `insufficient_data` | Data quality too poor for validation |

### Rigor Levels

| Level | Rich Cap | Partial Cap | Poor Cap | Requires Timed for Attention |
|-------|----------|-------------|----------|------------------------------|
| Conservative | 85 | 60 | 40 | Yes |
| Balanced | 90 | 68 | 50 | No |
| Aggressive | 95 | 75 | 55 | No |

**Copy**: "Modo agressivo aumenta quantidade de sinais, não aumenta certeza."

### Temporal Evidence

When auto-discovery registers an alert, it now includes full `temporalEvidence`:
- `momentumSource` — how momentum was determined
- `recencyConfidence` — confidence in recency of activity
- `windowMinutes` — momentum window used
- `recentEventsUsed` — actual timed events in the window

This makes auto-discovery alerts auditable in the same way as manual pattern alerts.

### Anti-Duplicate with Manual Patterns

Before registering, the gate checks if any manual pattern already has a pending alert for the same fixture. If so, the auto-discovery is blocked to avoid polluting the alert stream.

### Performance Separation

Auto-discovery alerts use `patternId = "auto_{type}"` (e.g., `auto_pressure`, `auto_final_phase`). The Performance Analytics engine can distinguish these from manual patterns by the `auto_` prefix, allowing separate performance tracking.

### Risks and Limits

- Auto-discovery depends on the same providers and events available to manual patterns
- Aggressive mode increases suggestion quantity, not certainty
- History remains local (localStorage) without backend
- Anti-duplicate only checks pending alerts, not resolved ones
- Momentum validation requires ESPN timed events for full accuracy


## Content-Aware Duplicate Guard (V12)

### Problem

The previous anti-duplicate mechanism only checked pending alerts with a simple 5-minute window per pattern+fixture. This allowed:
- Re-alerting after a previous alert was resolved (unknown/partial)
- Spam when auto-discovery runs repeatedly on the same context
- Duplicate alerts from different patterns covering the same situation

### Solution: `alertDuplicateGuard.ts`

A content-aware duplicate guard that examines the actual context of alerts, not just their pending status.

### Duplicate Signature

Each alert candidate generates a signature:
```
AlertDuplicateSignature {
  fixtureId, source, patternId, discoveryType?,
  score, minuteBucket, momentumSource?, side?, keyContext
}
```

`minuteBucket` groups minutes into ranges: 0-15, 16-30, 31-45, 46-60, 61-75, 76-90, 90+

### Check Levels

| Level | Condition | Result |
|-------|-----------|--------|
| `exact` | Same pattern + fixture + score + within window | Blocked |
| `similar_context` | Same fixture + same type + same score + same bucket | Blocked |
| `none` | Context is genuinely different | Allowed |

### Dedupe Windows by Type

| Type | Window (minutes) |
|------|-----------------|
| pressure | 10 |
| final_phase | 10 |
| favorite_risk | 12 |
| open_game | 12 |
| dominance | 10 |
| global_live | 15 |
| starting_soon | 30 |
| default (manual) | 10 |
| unknown/expired previous | 12 (stronger) |

### Unknown Spam Protection

If a previous alert for the same pattern+fixture was resolved as `unknown` or `expired`, a stronger 12-minute window applies. This prevents the system from repeatedly alerting when the provider can't deliver resolution data.

### Context Change Detection

A new alert is allowed even within the window if context genuinely changed:
- Score changed (new goal)
- Minute bucket changed by 2+ levels (significant time passed)

### Integration Points

1. **Manual pattern flow** (CommandCenterPage): checked after precision passes, before `registerCommandAlert`
2. **Auto-discovery flow** (CommandCenterPage): checked after precision gate passes, before `registerCommandAlert`
3. **Dry-run** (patternDryRunEngine): checked to show accurate `wouldAlert` status with duplicate blockers

### Invariants

The Precision Engine enforces these invariants across all alert paths:

1. `suggest_only` patterns never register alerts
2. `disabled` engine never registers alerts
3. `paused` patterns never register alerts
4. `autoDiscovery` with `userConfigured: false` never registers alerts
5. Dry-run never registers alerts or mutates storage
6. All alerts have adjusted confidence (never raw)
7. All alerts have `source: 'command_center'`
8. All alerts have `temporalEvidence` when momentum data is available
9. All alerts pass the content-aware duplicate guard
10. No path exists that bypasses precision validation
