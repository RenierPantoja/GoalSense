# Performance Backend Analytics

## Overview

Phase B5 introduces server-side performance analytics calculated from real alerts and resolutions persisted in the backend database. The frontend uses backend data when available, with graceful fallback to local localStorage-based analytics.

## Architecture

```
Frontend (PerformanceView)
  ├── useBackendPerformance hook
  │     └── GET /api/performance/patterns
  │     └── GET /api/performance/summary
  └── buildAllPerformanceReports (local fallback)
        └── commandAlerts from localStorage
```

## Metrics

### Per-Pattern Report
| Metric | Formula | Minimum Sample |
|--------|---------|----------------|
| confirmedRate | confirmed / resolved | 5 resolutions |
| usefulRate | (confirmed + partial) / resolved | 5 resolutions |
| failedRate | failed / resolved | 5 resolutions |
| unknownRate | unknown / total | 5 total alerts |
| averageConfidence | mean(confidence) | 1 alert |

Where `resolved = confirmed + confirmed_partial + failed`

### What Does NOT Count
- **Unknown ≠ Failed** — unknown means provider didn't deliver enough data
- **Pending** — not included in rate denominators
- **Expired** — not included in rate denominators

### Reliability Labels
| Label | Condition |
|-------|-----------|
| `insufficient_sample` | sampleSize < 5 |
| `preliminary` | sampleSize 5-29, rates not yet conclusive |
| `data_limited` | unknownRate > 40% |
| `underperforming` | failedRate > 50% |
| `noisy` | usefulRate < 40% AND failedRate > 35% |
| `reliable` | usefulRate >= 55% |
| `promising` | usefulRate >= 40% |

### Breakdowns
- **byMomentumSource** — timed_events, mixed, stats_proxy, insufficient
- **byDataQuality** — rich, partial, poor (from triggerSnapshot stats)
- **byProvider** — ESPN, API-Football, etc.
- **byResolutionType** — from AlertResolution table

## Recommendations (Server-Side)
Generated based on evidence, not invented:
- Sample < 5: "Amostra insuficiente para conclusão."
- unknownRate > 40%: "Provider não entrega dados suficientes."
- failedRate > 45%: "Aumente confiança mínima ou exija momentum confirmado."
- usefulRate > 60% + sample >= 30: "Padrão confiável com amostra significativa."
- stats_proxy vs timed_events: "Considere exigir eventos minutados."

## API Routes

### GET /api/performance/patterns
Returns array of `PatternPerformanceReport` for all non-archived patterns.

### GET /api/performance/patterns/:patternId
Returns single `PatternPerformanceReport` for specific pattern.

### GET /api/performance/summary
Returns `PerformanceSummary` with aggregate counts and reliability distribution.

## Frontend Hybrid Source

1. `useBackendPerformance(backendOnline)` fetches from backend when online
2. If backend returns data → `PerformanceView` uses backend reports
3. If backend offline/empty → falls back to `buildAllPerformanceReports` (local)
4. Source indicator shown in advanced mode: "Fonte: Backend" or "Fonte: Local"

## Limitations

- Brier score not implemented (requires calibrated probability + binary outcome)
- ROI/EV requires odds integration (future)
- Backend single-user/default (no multi-user yet)
- Performance only as good as alert sync coverage
- Historical local alerts not retroactively synced to backend

## Future (Not This Phase)

- Brier score with calibrated confidence
- ROI calculation with odds data
- Performance by competition/league
- Time-series performance trends
- Automated pattern tuning recommendations
- Worker-generated alerts feeding performance
