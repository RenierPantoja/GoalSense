# Command Center — QA Runtime Checklist

## Pre-flight

- [ ] `npm run check:encoding` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npx vite build` passes
- [ ] No console errors on load

## Navigation

- [ ] Open `/app/command`
- [ ] All 5 tabs render: Cockpit, Padrões, Scanner, Alertas, Performance
- [ ] Tab switching is instant
- [ ] Auto-refresh indicator works
- [ ] Manual refresh button works

## Pattern Studio (Padrões tab)

- [ ] "Criar radar" opens CustomPatternModal
- [ ] All 6 wizard steps navigate correctly
- [ ] Identity step: name required, severity picker works
- [ ] Scope step: all scope modes work (all, favorites, leagues, teams, matches)
- [ ] Conditions step: add/remove conditions, Trigger Lab renders
- [ ] Action step: register_alert / suggest_only / highlight
- [ ] Confidence step: slider works
- [ ] Review step: preview renders correctly
- [ ] "Salvar pausado" creates paused pattern
- [ ] "Criar e ativar" creates active pattern (gated by all steps visited)
- [ ] Edit existing radar pre-fills all fields
- [ ] Duplicate radar works
- [ ] Delete radar works
- [ ] Template toggle activates/pauses
- [ ] Template configure opens TemplateConfigModal
- [ ] Performance badge shows on configured radars (when data exists)
- [ ] Template without instance shows NO performance badge

## Dry-Run (Testar ao vivo)

- [ ] Button appears in CustomPatternModal footer
- [ ] Button appears in TemplateConfigModal footer
- [ ] Button disabled when no conditions
- [ ] Draft incompleto shows validation errors
- [ ] Valid pattern opens PatternDryRunPanel
- [ ] Summary cards show correct counts
- [ ] Filters work (Todos, Prontos, Candidatos, Bloqueados, Sem dados)
- [ ] Result rows expand on click
- [ ] Expanded view shows: evidences, blockers, momentum, events
- [ ] `wouldAlert` reflects real precision engine decision
- [ ] Duplicate blocker appears when existing alert matches
- [ ] After dry-run: /app/alerts has NO new alert
- [ ] After dry-run: localStorage alert keys unchanged

## Auto-Discovery

- [ ] Motor desligado by default (userConfigured: false)
- [ ] "Configurar motor" opens AutoDiscoveryConfigModal
- [ ] Rigor selector shows 3 options (Conservador/Equilibrado/Agressivo)
- [ ] "Salvar e ativar" sets enabled + userConfigured
- [ ] suggest_only mode: discoveries appear in Cockpit/Scanner but NO alert registered
- [ ] register_alert mode: only `ready_to_alert` discoveries register alerts
- [ ] Conservative mode blocks stats_proxy for attention-level discoveries
- [ ] Duplicate with manual pattern is blocked
- [ ] Auto-discovery alerts have temporalEvidence

## Scanner

- [ ] Only shows fixtures with hits/discoveries (not all fixtures)
- [ ] SignalState badges: Pronto, Candidato, Observação, Bloqueado
- [ ] DataQuality badge: rich/partial/poor
- [ ] MomentumSource badge when available
- [ ] Blockers appear in advanced mode
- [ ] Recent events appear when available
- [ ] Counters match the list

## Alertas tab

- [ ] Pending alerts appear
- [ ] Confirmed alerts appear with green indicator
- [ ] Confirmed_partial appears
- [ ] Failed appears with red indicator
- [ ] Unknown appears with amber indicator
- [ ] Expired appears
- [ ] Resolution reason shown
- [ ] Old alerts without temporalEvidence don't crash

## Resolution

- [ ] Goal within window → confirmed
- [ ] Shots on target within window → confirmed_partial
- [ ] No events + window expired → unknown (NOT failed)
- [ ] Match finished with no change → failed
- [ ] Alert > 2.5h → expired

## Performance tab

- [ ] Uses buildAllPerformanceReports (not heuristic)
- [ ] Sample < 5: shows "Amostra insuficiente", no fake rate
- [ ] Unknown does NOT count as failed
- [ ] usefulRate only appears with 5+ resolutions
- [ ] Reliability badges: Confiável, Promissor, Amostra insuficiente, Limitado por dados, Ruidoso, Subperformando
- [ ] Summary cards show correct counts per reliability
- [ ] Backtest local section has honest copy
- [ ] Recommendations appear when applicable
- [ ] Pattern Studio badge matches PerformanceView badge

## Duplicate Guard

- [ ] Same pattern + same fixture + same score within 10min → blocked
- [ ] Previous unknown alert → stronger 12min window
- [ ] Score change (new goal) → allows new alert
- [ ] Auto-discovery after manual alert on same fixture → blocked
- [ ] Dry-run shows duplicate blocker correctly

## Storage / Backward Compatibility

- [ ] App loads with empty localStorage (fresh user)
- [ ] App loads with old patterns (no rigor field) — defaults applied
- [ ] App loads with old alerts (no temporalEvidence) — no crash
- [ ] App loads with old alerts (no duplicateSignature) — no crash
- [ ] Clear all data works

## Advanced Mode

- [ ] Toggle advanced mode in settings
- [ ] PatternStatRow shows extra detail
- [ ] Scanner shows blockers and events
- [ ] Performance shows backtest table
- [ ] Dry-run shows technical details row

## Performance / Bundle

- [ ] Page loads in < 3s
- [ ] No infinite re-render loops (check React DevTools)
- [ ] Auto-refresh interval cleans up on unmount
- [ ] Dry-run doesn't run on every render (only on button click)
- [ ] useMemo prevents unnecessary recalculation
