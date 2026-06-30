# Signal Quality Campaign Panel — B70

`SignalQualityCampaignPanel.tsx` (Backstage) renders the sanitized public campaign summary from `/api/worker-control-plane/signal-quality` (data.campaign):
campaign status, windows completed/target, sample size, human review queue size, threshold study readiness, insufficient/not-evaluable ratios, top useful/noisy signals.

Observe-only. Frontend computes nothing. No odds, no probability, no accuracy promise.
