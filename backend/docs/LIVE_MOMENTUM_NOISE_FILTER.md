# Live Momentum Noise Filter — B68

`liveMomentumNoiseFilter.service.ts` separates real pressure from variance.
Categories: sustained_pressure, event_driven_pressure, score_effect_noise, stale_snapshot_noise, low_sample_noise, normal_match_variance, unknown.
Rules: single-snapshot spike is not strong; sustained needs >=3 snapshots + stats/timeline; losing side pressing = score_effect_noise; post goal/card = event_driven; stale = unreliable. Momentum is never a probability.
