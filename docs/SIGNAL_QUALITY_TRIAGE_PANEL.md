# Signal Quality Triage Panel � B71

`SignalQualityCampaignPanel.tsx` adds a human-review triage section from
`/api/worker-control-plane/signal-quality` (data.triage): requires review, critical,
high value, pattern watch, duplicates, insufficient, pending outcome, monitor only.

Frontend computes nothing (no triage/readiness inference). Observe-only. No reviewer
notes, no raw payload, no odds, no probability.

## B72 additions

The panel now also renders (read-only aggregates from the same endpoint):
- `data.adjudication` — conservative adjudication: total adjudicated, pending
  before→after, counts per decision, conservative defaults, notes withheld.
- `data.windowComparison` — windows compared, cumulative cases, observational
  deltas, trend note.
- `data.readinessV3` — readiness, sample, queue pending/adjudicated, reason.

Frontend still computes nothing. Reviewer private notes are never sent to the
client (only `reviewerNotesWithheld: true`). Observe-only; no odds, no probability,
no runtime effect.
