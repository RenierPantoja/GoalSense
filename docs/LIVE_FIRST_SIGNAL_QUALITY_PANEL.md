# Live-First Signal Quality Panel — B68

`LiveFirstSignalQualityPanel.tsx` (Backstage) renders the latest review from
`GET /api/worker-control-plane/signal-quality`:
sample size, grade counts (reliable/useful/noisy/insufficient/misleading/pending),
top useful/noisy signals, momentum noise findings, governance feedback, recommendations.
Shows "observe only" + small-sample disclaimer. No odds, no probability, no accuracy promise. Empty review is not a failure.
