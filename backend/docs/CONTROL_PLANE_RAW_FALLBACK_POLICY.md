# Control Plane Raw Fallback Policy — B66

## Policy
- Production should run **read-model-first**: `ENABLE_PUBLIC_CONTROL_PLANE_READ_MODEL=true`.
- Raw fallback should be **off**: `ENABLE_RAW_CONTROL_PLANE_READ_FALLBACK=false` (default).
- If raw fallback is enabled, the read diagnostic surfaces
  `rawPublicExposureWarning` and the Backstage badge shows `Raw Fallback`
  (amber) with `publicExposure = transitional_raw_read`.

## States
| dataMode | meaning | exposure |
|---|---|---|
| sanitized_read_model | reading controlPlanePublicSummaries | minimal |
| missing_public_summary | sanitized snapshot not published yet (NOT a failure) | minimal |
| raw_fallback | reading raw collections (flag on) | transitional_raw_read |
| permission_denied | rules deny sanitized read | blocked |

## Empty vs failure
`missing_public_summary` (no snapshot yet) is **not** a failure — it means the
worker hasn't published a snapshot in this window. The panel shows a neutral
"Public Summary Pending" badge.

## Recommendation
Keep raw fallback permanently off once the sanitized model is confirmed
populated in production, then proceed with `FIREBASE_RULES_HARDENING_B66.md` to
lock the raw collections.
