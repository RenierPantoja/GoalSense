# Auto Engine Cockpit UI — Foundation (Phase B20)

The first premium interface for the **Motor Automático** (Auto Engine), living as a
dedicated tab in the Command Center. It lets the user see what the engine observes,
ranks, blocks and explains — consuming the read-only B19 backend. **No mock, no
invented data, no odds, no auto-bet, no Telegram, no real alert created.**

> Opportunity ≠ alert. Score is signal-QUALITY, not a probability or a promise.
> `unknown`/missing data is a **block reason**, never a failure. Blocked
> opportunities are shown on purpose — they prove the engine is conservative.

## Where it lives
- Tab `'autoengine'` (icon `Cpu`, label "Motor Automático") in
  `src/features/command/CommandCenterPage.tsx`. Cross-links to the Backtest and
  Alertas tabs via `setActiveTab`.
- View root: `src/features/command/components/views/autoengine/AutoEngineCockpit.tsx`.

## Rotas consumidas (`src/services/autoEngineApi.ts`)
Mirrors `backtestApi`'s tagged `ApiResult<T>` + `request<T>` (never throws; **403 →
`disabled`**). All under `/api/intelligence/auto-engine`:
- `getStatus()` → `AutoEngineStatusDto`
- `runScan({dryRun,limit,persist})` → `AutoEngineRunDto` (403 when engine off)
- `listRuns(limit)` → `AutoEngineRunDto[]`
- `getRun(runId)` · `getOpportunity(id)`
- `listOpportunities({status,type}, limit)` → server filters status/type; the rest
  (league/team/score/band/dataQuality/blockReason/query) applied client-side.
- `listFixtureOpportunities(fixtureId, limit)`

Types: `src/features/command/intelligence/autoEngineTypes.ts` (frontend mirror of
the B19 contracts + label/tone maps; missing fields treated as unknown/null).

## Componentes
- **AutoEngineCockpit** — header, offline/disabled banners, counters strip
  (total/strong/watch/candidate/blocked), status + scan panels, segmented control
  (Visão geral / Oportunidades / Bloqueadas), drawer host. Loads status+runs+
  opportunities on mount; a scan updates the list in place (dry-run results are
  shown even when WRITE is off, since nothing is persisted).
- **AutoEngineStatusPanel** — flag pills (motor / write / scheduler / **auto→alertas
  sempre bloqueado nesta fase**), config (maxFixtures, minScore, minSampleQuality,
  maxOppsPerFixture from `lastRun.config`), last run, limitations. No big red card.
- **AutoEngineScanPanel** — limite de jogos, persistir (only when WRITE=true),
  "Rodar scan". States: disabled/running/completed/failed/empty. Reminders: scan
  não cria alerta, não envia Telegram, não usa odds; oportunidade ≠ aposta.
- **AutoOpportunitiesList** — rows with status chip, fixture, league, type, score,
  confidence band, evidence/risk chips, "Ver análise". Filters: status, sinal
  (band), qualidade de dados, liga, score mínimo, busca. `blockedOnly` mode for the
  Bloqueadas segment. Sober tones — never betting green/red.
- **AutoOpportunityDrawer** — the Opportunity Inspector (right-side, `max-w-[720px]`,
  Escape-to-close), 6 tabs:
  - **Resumo** — score, band, headline, why-now; disclaimer "não é alerta nem aposta".
  - **Evidências** — live stats used, recent offensive events, data quality,
    passed signals, missing data, `dataAvailability` chips, match context (flags
    heuristic). Unavailable stats shown as indisponível, never invented.
  - **Score** — the **Score Ledger**: base / live / pattern-learning / competition /
    team / minute-window / data-quality / risk-penalty → final, plus scoring notes.
    "Score mede qualidade relativa do sinal, não é probabilidade."
  - **Riscos / Bloqueios** — allowed, finalDecision, block reasons (humanized),
    warnings, penalties. "Dados ausentes são bloqueio, nunca falha — unknown ≠ failed."
  - **Contexto histórico** — matched learning contexts + sample quality + source;
    enriches with the related pattern's B13 profile (usefulRate/failedRate/
    unknownRate/sampleQuality) via `alertIntelligenceApi.getPatternLearningProfile`.
    Honest "sem histórico suficiente" when absent.
  - **Aprendizado** — explanation historical context + related-pattern note + cross
    links: "Rodar backtest do padrão relacionado", "Ver alertas parecidos". No action
    creates an alert, changes a radar or applies a recommendation.

## Estados honestos
Backend não conectado, backend offline (último estado conhecido), motor desabilitado
(scans 403 — oportunidades já registradas ainda visíveis), write desabilitado (modo
leitura), sem oportunidades, sem oportunidades bloqueadas, scan failed, dados
limitados/ausentes na API. Nada parece bug; limitações sempre visíveis.

## Diferença oportunidade × alerta
Um **alerta** é um sinal emitido por um radar configurado (B12+), com ledger,
outcome e ciclo de vida. Uma **oportunidade** é uma leitura analítica read-only do
Motor Automático sobre um jogo ao vivo: explicável, ranqueada por qualidade de
sinal, sem disparo, sem Telegram, sem aposta. A B20 nunca converte uma na outra
(`ENABLE_AUTO_ENGINE_TO_ALERTS` permanece desligado e não-wired — B20/B21).

## Checks
`npm run check:encoding` ✓ · `npx tsc --noEmit` ✓ · `npx vite build` ✓. Backend
não foi tocado nesta fase.

## Próximos passos
Auto → Alertas com confirmação humana (B21), auth nas rotas do Auto Engine, contexto
de competição estruturado (tier de liga) quando houver fonte confiável.

## B21 — Opportunity actions + promotion workflow

The cockpit is now interactive: an action bar in the drawer (save / dismiss / useful /
not-useful / create-radar), a feedback + notes panel, saved/ignored/feedback/note/proposal
badges and filters in the list, and an Opportunity Promotion Panel that opens
`CustomPatternModal` PRE-FILLED (never auto-saving). "Abrir jogo no Command Center" is
resolved via the new fixture-context lookup + team-name matching. Server-side search
(`/opportunities/search`) backs the list with a client fallback. Feedback is observational
("não altera o motor automaticamente"); no alert/odds/bet/Telegram; opportunity ≠ alert.
See `docs/AUTO_OPPORTUNITY_ACTIONS_UI.md` and `backend/docs/AUTO_OPPORTUNITY_ACTIONS.md`.

---

## B22 — Promote to monitored alert (extension)

The cockpit now hosts the manual alert-promotion flow. The opportunity drawer's action bar
shows **"Promover p/ alerta"** for strong/watch opportunities (or **"Abrir alerta"** once
promoted); the cockpit opens `AutoOpportunityAlertPromotionPanel`, and `userStates` are
updated with `promotedAlertId` on success so list badges/filters refresh immediately.
Full UI contract: [`AUTO_OPPORTUNITY_ALERT_PROMOTION_UI.md`](./AUTO_OPPORTUNITY_ALERT_PROMOTION_UI.md).
Human-confirmed only — no automatic alert, no Telegram, no odds.

---

## B24 — "Calibração" segment (extension)

The cockpit now has a fourth segment, **Calibração** (`AutoEngineCalibrationPanel`), showing the
Auto Engine's observational learning profile from promoted-alert outcomes: maturity headline,
per-opportunity-type useful/unknown rates, score-bucket calibration, data-quality and risk-gate
breakdowns, recommendations (by strength), and limitations — plus an env-gated "Recalcular"
button. The overview also gains an engine-maturity card. Observational only; never auto-tunes the
engine or rewrites scores. See [`AUTO_ENGINE_CALIBRATION_UI.md`](./AUTO_ENGINE_CALIBRATION_UI.md).

---

## B25 — "Políticas" segment (extension)

A fifth cockpit segment, **Políticas** (`AutoAlertPolicyPanel` + `AutoAlertPolicyOverviewPanel` +
`AutoAlertPolicyEditor`), exposes the Auto Alert Policy Engine: automation flags, decision tallies,
policy CRUD (config-flag gated), and recent shadow/blocked/auto decisions. The opportunity drawer
gains a "Política automática" section with an "Avaliar política agora" action. Shadow-first: the UI
never implies a real alert unless the decision is `auto_created`. See
[`AUTO_ALERT_POLICY_UI.md`](./AUTO_ALERT_POLICY_UI.md).

---

## B26 — permission-aware cockpit (extension)

A lightweight `useAuth()` hook + guard components (`PermissionGate`, `DangerousActionGuard`,
`AdminOnlyBadge`) let cockpit panels disable actions the backend would refuse, with honest reasons.
In local dev (`ENABLE_AUTH=false`) the UI resolves to owner so nothing changes. First wired into
the "Políticas" segment (admin-gated config + auto-create). See
[`AUTH_GUARDRAILS_UI.md`](./AUTH_GUARDRAILS_UI.md).
