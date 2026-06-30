# Signal Quality Triage Panel — B71

`SignalQualityCampaignPanel.tsx` adds a human-review triage section from
`/api/worker-control-plane/signal-quality` (data.triage): requires review, critical,
high value, pattern watch, duplicates, insufficient, pending outcome, monitor only.

Frontend computes nothing (no triage/readiness inference). Observe-only. No reviewer
notes, no raw payload, no odds, no probability.
