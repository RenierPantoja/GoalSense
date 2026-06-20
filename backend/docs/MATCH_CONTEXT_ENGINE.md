# Match Context Engine

`matchContextEngine.service.ts` understands the NATURE of a match: competition type,
stage, knockout/final, importance, volatility, pressure. It reuses the existing
`deriveMatchContext` heuristic (competition name string) plus ESPN live state. It does
not collect rivalry/standings/lineups, so those are honestly `unknown`.

## Output — `MatchContextProfile`

- `importanceLevel`: low | medium | high | critical | unknown.
- `pressureLevel`, `volatilityRisk`: derived from importance + knockout.
- `rivalryLevel`: **always `unknown`** (rivalry/classic not collected — we never invent
  a classic).
- `rotationRisk`, `motivationAsymmetry`: `unknown` (need lineup/context).
- `competitionContext`: stage, isKnockout, isFinal, isSemiFinal (heuristic), aggregate
  `null`.
- `importance`: title/relegation/continental implications `unknown` (no standings).

## Honesty rules

- Unknown competition → `unknown` type, NOT a final, NOT knockout.
- Knockout/final only when the competition name explicitly indicates it.
- Importance is `partial`/`low` reliability — a heuristic, not provider data.
- Volatility is raised for knockouts (honest, structural), not invented per-team.

## Limitations

Rivalry, table position, title/relegation stakes, and rotation are not derivable from
the data collected. They are surfaced as `unknown` with explicit limitations, which is
itself a valid decision input (uncertainty).

## B40 note

Competition context can now also be acquired via the pre-match acquisition layer
(`competition_context` domain) when a provider is configured; without one it stays the
heuristic described above. See `PRE_MATCH_ACQUISITION.md`.
