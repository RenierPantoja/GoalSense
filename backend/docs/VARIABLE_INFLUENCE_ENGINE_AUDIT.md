# Variable Influence — Reality Map (B46 / Bloco 3)

Audit of every variable the GoalSense already has BEFORE assigning weights. Rule: no
weight is invented before the real variable is mapped, and influence is never a
probability of winning.

## Variables the GoalSense already knows (and their source)

| Variable group | Where it comes from | Source class | Honest state today |
|---|---|---|---|
| Lineup window / status | `squadAvailabilityEngine` (V1/V2), `lineupWindowEngine` | derived_context / provider / manual | lineup not collected → temporal window only; manual via intake |
| Injuries | `squadAvailabilityV2` (manual + `preMatchDataStore` snapshot) | manual_data / provider_data | usually `unavailable` → unknown ≠ "sem lesão" |
| Suspensions | same | manual_data / provider_data | usually `unavailable` → unknown ≠ "sem suspensão" |
| Player importance | `playerImportance.service` | derived_context | mostly unknown (no squads endpoint) |
| Match context (importance/volatility/knockout/rivalry) | `matchContextEngine` | derived_context | partial; rivalry usually unknown (never invented) |
| Standings / table pressure | `preMatchDataStore` (B44 unlock) | provider_data | only when API-Football env+mapping unlocked |
| Tactical matchup / tempo / card risk | `tacticalMatchupEngine` | live_state / derived_context | live-based, low reliability |
| Team fundamental memory | B45 `teamFundamentalMemory` | internal_memory | sample-quality gated |
| Matchup memory (H2H) | B45 `matchupFundamentalMemory` / `headToHeadIntelligence` | internal_memory | usually `insufficient_data` (never a tabu) |
| Pattern×context memory | B45 `contextualPatternMemory` | internal_memory | sample-quality gated |
| Taboos / constraints | B45 `tabooIntelligence` | internal_memory | mostly NOT usable |
| Similar scenarios | B45 `similarScenarioRetrieval` | internal_memory | retrieval, not prediction |
| Provider/domain readiness | B44 Domain Unlock Matrix V2, Endpoint Catalog, Readiness V5/V6 | provider_quality / data_readiness | blocked ≠ failure |
| Live events (red card, goals, tempo) | live snapshots (ESPN) | live_state | only when live + stats present |
| Post-match outcome | B39/B44/B45 PostMatchExplanation V1–V4 | post_match_learning | unknown/not_evaluable ≠ failed |
| Signal ledger / alert outcomes | B12+ | internal_memory / backtest | feeds memory + post-match |

## Which can be positive / negative / blocking / wait

- **Positive (supportive)**: defesa adversária desfalcada (clean-sheet contra), memória favorável forte, contexto histórico favorável (pattern×context `use_with_confidence`), manual high-reliability confirmando ausência relevante, derby/knockout para cartões.
- **Negative (contradictory)**: ataque desfalcado para padrão de gols, memória contradiz padrão, contexto `stay_out`, taboo `supported`.
- **Blocking**: conflito provider × manual não resolvido, dado crítico ausente + sem manual.
- **Wait**: escalação ainda não saiu (janela), domínio crítico `stale`/`blocked_missing_mapping`, jogo ao vivo sem stats (live_confirmation_required).
- **Uncertain**: lesão/suspensão `unknown`, rivalidade `unknown`, amostra fraca.

## Pattern-specific vs contextual

Critical variables differ per pattern family (goals/btts/clean_sheet/cards/late_goal/…).
Lineup + key-player importance are critical for goal/clean-sheet families; card memory +
derby/knockout are critical for card families; everything else is contextual. A pattern
without a sensitivity profile MUST fall back to a conservative default.

## Sufficient data vs weak sample vs do-not-use-yet

- **Sufficient**: live events when stats present; provider data when domain unlocked.
- **Weak sample**: most internal memory early (insufficient_history); H2H (insufficient_data).
- **Do not use yet**: injuries/suspensions/squads/probable lineups (no documented endpoint),
  rivalry/referee (not collected) → stay `unknown`, never become a fact.

## False-confidence risks

- Treating `unknown` absence as "no injury/suspension".
- Treating a tiny memory sample as a strong tendency.
- Treating H2H insufficiency as a tabu.
- Treating provider `blocked` as a negative signal.
- Treating `confidenceOfAssessment` / `influenceScore` as a probability of the result.

## Conclusion

Build a deterministic, advisory influence layer: taxonomy → pattern sensitivity →
extraction (from MatchIntelligencePackage V4) → rule engine → aggregator → conflict
engine → ledger, then surface via Package V5, Readiness V7, Precheck V7 (observe),
PostMatch V5 and a Backstage panel. Influence is operational weight + assessment
confidence, never a win probability; it never changes score/confidence/patterns/alerts.
