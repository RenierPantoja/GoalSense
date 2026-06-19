# Alertas 2.0 — Scale UI (Phase B18)

Frontend for the scalable alert intelligence: server-side search list, paginated,
filtered, with cached overview info and CSV export. Read-only; honest fallbacks.

## What changed
- **`ServerAlertList`** — primary Sinais view when a backend is configured.
  Consumes `GET /api/intelligence/alerts/search` with server-side filters
  (q, result, severity, league, team, radar, data quality, minute window, with
  failure analysis), "Carregar mais" cursor pagination, "Busca server-side ativa"
  badge, and a **CSV export** button. "Ver análise" opens the Signal Ledger drawer.
- **Local fallback** — a "Sinais locais" toggle keeps the preserved `AlertsView`
  (local/hybrid/Telegram/odds). When no backend is configured, `AlertsView` is the
  default with the note "Exibindo filtros locais com base nos alertas carregados."
- **`AlertOverviewStrip`** — shows cache freshness ("atualizado há Xs", cacheHit)
  when the backend returns it; manual refresh.
- **Cross-links** — `RelatedAlertsPanel` and `LearningEventDrawer` get an
  "Abrir na lista filtrada →" action that pre-fills the server filters (by
  `patternId`) and switches to the Sinais server-side list. `PatternSignalQualityView`
  exposes the same from each radar's related alerts.

## API client (`alertIntelligenceApi.ts`)
`searchAlertIntelligence(filters, { limit, cursor, sortBy, sortDirection })` and
`exportAlertsCsv(filters)` (fetch → blob download; honest on 403/offline). Both
return data-or-null / tagged results; never throw.

## Honest states
"Busca server-side ativa" · "Exibindo filtros locais…" · "Resultado paginado
server-side · 50 por página" · "Exportação desabilitada (ENABLE_ALERT_EXPORT)" ·
backend offline · no results · alerts without ledger identifiable.

## Limitations
- The local `AlertsView` (Telegram/odds/hybrid) is the only place those advanced
  per-row actions live; the server list focuses on intelligence + "Ver análise".
- Export requires `ENABLE_ALERT_EXPORT=true`; otherwise the button surfaces the
  disabled note.
- Overview cache requires `ENABLE_ALERT_INTELLIGENCE_CACHE=true`; otherwise it
  recomputes (still correct, just not cached).
- Server search/overview reflect only ledger-backed alerts; local-only alerts use
  the local view.

## Next steps
- Saved filter presets; column sort UI; richer CSV (per-condition columns).
- Replace offset cursor with a keyset cursor when a paginated store lands.
