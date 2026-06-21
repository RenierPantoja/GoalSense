# Assumption Invalidation (B47 / Bloco 4)

`governance/assumptionInvalidation.service.ts`. Detects when a previous (pre-match)
reading no longer holds, so the system stops treating pre-match as static. Observational
only; never alerts, never changes alert results; persists an auditable record.

## Mapped triggers → invalidated assumption
- `lineup_confirmed` → "escalação provável assumida" (recheck).
- `lineup_changed` → "escalação anterior assumida" (recheck, strong_caution).
- `red_card` → "11 contra 11 assumido" (live_confirmation, critical).
- `substitution` → "jogadores em campo assumidos" (recheck).
- `injury_event` → "elenco saudável assumido" (recheck).
- `domain_refreshed` → "dado crítico ausente assumido" (recheck).
- `manual_record_created` → "dado de provider assumido" (recheck).
- `mapping_confirmed` → "mapping pendente assumido" (recheck).
- `goal` → "placar anterior assumido" (recheck).

## Record (`AssumptionInvalidation`)
id, fixtureId, patternId, governanceResultId, invalidatedAssumption, trigger, severity,
recommendedAction (recheck / downgrade / cancel_hold / stay_out / live_confirmation /
post_match_only), reason, evidenceRefs, createdAt.

Persisted to Firebase `assumptionInvalidations`; Noop under Prisma.
