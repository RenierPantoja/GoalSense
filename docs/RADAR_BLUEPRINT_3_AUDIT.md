# Radar Blueprint 3.0 — Auditoria do estado atual (pós 2.0)

Auditoria antes do redesign logic-first. Base: Radar Composer 2.0.

## Componentes envolvidos

| Arquivo | Papel atual |
|---|---|
| `modals/CustomPatternModal.tsx` | Modal 3 colunas (nav · canvas · preview). Dono do draft, `buildData`, save/activate. |
| `shell/ComposerNav.tsx` | Nav lateral com check/contagem simples. |
| `triggers/TriggerComposer.tsx` | Builder conditions-first (cards 1 linha + sheets de biblioteca/receitas). |
| `inspector/RadarInspectorPanel.tsx` | "Preview do radar" (status, key/value, fluxo, pronto). |
| `triggers/ConditionsEditor.tsx` | Dormente (substituído por TriggerComposer). |
| `shell/WizardProgressRail.tsx`, `shell/WizardStepHeader.tsx` | Dormentes. |
| `preview/RadarPreview.tsx` | Resumo humano (passo Revisão). |
| `dryrun/PatternDryRunPanel.tsx` | Resultado de "Testar ao vivo" (client-side). |

## Contrato salvo atual (NÃO ALTERAR)

`buildData(status)` → `Omit<Pattern,'id'|'createdAt'|'updatedAt'>`:
`name, description, conditions, severity, status('active'|'paused'),
isTemplate, templateId, scope, scopeFilter, matches, excludeLeagues,
excludeTeams, excludeMatches, requireRichData, onlyLive, onlyPreMatch,
minConfidence, action, maxTriggersPerMatch, antiDuplicateWindow`.

`Pattern.status` só admite `active | paused | archived` — **não existe `draft`**.

## Como funciona hoje

- **Validações**: `hasName`, `hasConditions`, `canSave = hasName && hasConditions`,
  `canActivate = canSave` (2.0 removeu o gate de visitar passos).
- **Checks laterais**: `ComposerNav` mostra `complete` (check) / `count` / `error`,
  calculados inline no modal a partir de `hasName`/`conditions.length`/`canSave`.
- **"Pronto para salvar"**: vem de `canSave` (só nome + ≥1 condição) → aparece cedo demais.
- **"Testar ao vivo"**: chama `runPatternDryRun` (client-side). Não consulta backend,
  não cria alerta, não persiste. Nome confuso (tudo já é "ao vivo").
- **Condições**: catálogo `triggerLibrary.ts` + `triggerRecipes.ts`. Sem classificação
  operacional — `is_live` (elegibilidade) conta igual a `shots_on_target_gte` (sinal).

## Problemas de lógica (motivam o 3.0)

1. `canSave`/`canActivate` liberam cedo: nome + `is_live` já habilita "Criar e ativar".
2. Defaults (escopo "todos", ação "registrar", rigor 50%) tratados como confirmados.
3. `is_live`/`minute_between` (elegibilidade) tratados como sinal suficiente.
4. "Testar ao vivo" não comunica se consulta backend / simula / salva / cria alerta.
5. Nada garante que o backend consegue executar as condições escolhidas
   (ex.: `favorite_involved`, `yellow_cards_gte` não existem no avaliador do worker).
6. Preview lateral é descritivo, não responde "o motor pode executar com segurança?".

## Condições suportadas pelo motor (backend `commandEvaluation.service.ts`)

Suportadas: `is_live, minute_between, score_tied, score_diff_lte, goals_total_gte,
goals_total_lte, possession_gte, shots_on_target_gte, corners_gte, cards_gte,
is_final_phase, shots_total_gte, home_shots_on_target_gte, away_shots_on_target_gte,
home_possession_gte, away_possession_gte, home_corners_gte, away_corners_gte`.

NÃO suportadas pelo worker: `is_pre_live, favorite_involved, shots_recent_gte,
home_goals_gte, away_goals_gte, yellow_cards_gte, red_cards_gte`.

Mismatch de parâmetro: `score_diff_lte` — UI grava `maxDiff`, worker lia `params.value`
(default 1). Corrigido nesta fase com leitura `maxDiff ?? value ?? 1` (ajuste mínimo, retrocompatível).

## Riscos de regressão

- Alterar `buildData`/props → quebra `PatternsView`/backend. Mitigação: preservar verbatim.
- Inventar status `draft` → quebra modelo. Mitigação: "Salvar rascunho" persiste `paused`.
- Bloquear ativação por incompatibilidade pode surpreender; mitigação: mensagem clara
  nomeando a condição não suportada.

## O que não pode quebrar

Criação/edição de radar, payload salvo, `PatternsView`, Command Center, workers,
regras de precisão, dry-run client-side (sem persistir / sem alerta fake).
