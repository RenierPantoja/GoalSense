# B72 Human Review Adjudication + Campaign Window Continuation — Audit

## Goal
Continue the multi-window campaign and work the human review queue with a
conservative, observe-only adjudication flow. No threshold study yet; no policy,
score, confidence, or runtime change.

## What ran
- One real 20-minute campaign window on `sqcamp_1782778410284_akj92v` (live fixture
  available: Netherlands vs Morocco). Window completed; sample grew to ~62–63 cases.
- Review → triage → conservative adjudication → readiness V3 → sanitized publish.

## Triage (37 raw items)
- requiresHumanReview: 5 · duplicateClusters: 11 · insufficientDataBucket: 15 ·
  patternWatch: 5 · criticalReview: 0.

## Adjudication (the 5 real items)
All 5 are `pattern_watch`, `partially_aligned` (no strong+aligned, no missing
context, no clear noise), so the conservative engine assigned:
- needs_more_samples: 5
- insufficient_evidence / duplicate / confirmed_noise / confirmed_useful_signal: 0
- conservativeDefaultsApplied: 5
- pending: 37 → 32 (the 5 requires-review items moved to needs_more_data).

## Why so conservative
Sample is small and outcomes are only partially aligned. Confirming a useful signal
requires strong evidence AND an aligned outcome; confirming noise requires a clearly
noisy, contradicted case. Neither applies yet, so deferral is the correct call.

## Readiness
`not_ready_small_sample` (sample 63 < 200). No threshold study performed. Readiness
V3 also gates on triage + adjudication completeness, but the sample floor dominates.

## Safety
Observe only throughout. Reviewer private notes never published (public summary
exposes only `reviewerNotesWithheld: true` + aggregate counts). Raw collections stay
403-locked; `rawFallbackEnabled=false`; `controlPlaneDataMode=sanitized_read_model`.
