# Control Plane Security Badge — B66

The `EspnLiveFirstWorkerPanel` shows a **Control Plane Data Mode** badge next to
the runtime badge, derived from `firebaseReadDiagnostic`:

| Badge | dataMode | Tone | Meaning |
|---|---|---|---|
| Sanitized Read Model | sanitized_read_model | green | Reading controlPlanePublicSummaries (minimal exposure) |
| Raw Fallback | raw_fallback | amber | Transitional raw read enabled |
| Public Summary Pending | missing_public_summary | neutral | Snapshot not published yet (not a failure) |
| Permission Denied | permission_denied | red | Rules deny sanitized read |

When raw fallback is active, an amber warning line is shown:
"Control Plane usando leitura bruta transitória. Recomenda-se publicar
controlPlanePublicSummaries."

The badge title also exposes `Public exposure: minimal | transitional_raw_read |
blocked | unknown`.

Security is now visible in the panel; no probability, no odds, and no
accuracy promises are rendered.
