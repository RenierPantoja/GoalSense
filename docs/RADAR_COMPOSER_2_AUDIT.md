# Radar Composer 2.0 — Auditoria do modal atual

Documento de mapeamento ANTES de qualquer redesign. Objetivo: preservar o
contrato funcional (payload + validações + chamadas) enquanto a UI é
redesenhada.

## 1. Arquivos encontrados e responsabilidades

Raiz: `src/features/command/components/pattern-studio/`

| Arquivo | Responsabilidade |
|---|---|
| `modals/CustomPatternModal.tsx` | **Modal principal** (wizard de 6 passos). Dono de todo o estado do rascunho, `buildData()`, validações, dry-run e save. |
| `shell/ModalShell.tsx` | Wrapper do modal (portal, scroll-lock, ESC, backdrop, header, footer). |
| `shell/WizardProgressRail.tsx` | Stepper horizontal segmentado (a ser substituído por navegação lateral). |
| `shell/WizardStepHeader.tsx` | Cabeçalho de cada passo (kicker/título/descrição). |
| `shell/Section.tsx`, `shell/ToggleSettingRow.tsx`, `shell/PremiumToggle.tsx` | Primitivos de UI reutilizáveis. |
| `scope/ScopePicker.tsx` | Seletor de escopo + filtros avançados (include/exclude + flags). |
| `scope/LeaguePicker.tsx` / `TeamPicker.tsx` / `MatchPicker.tsx` | Pickers de liga/time/partida (busca + chips internos). |
| `scope/EntityAvatar.tsx`, `scope/scopeShared.ts` | Avatares/util compartilhado. |
| `triggers/ConditionsEditor.tsx` | **Trigger Lab**: condições ativas + biblioteca categorizada + receitas (sempre visíveis = pesado). |
| `triggers/ParamField.tsx` | Input numérico com clamp por `paramBounds`. |
| `form-controls/SeverityPicker.tsx` | Picker de severidade. |
| `form-controls/ActionCardPicker.tsx` | Picker de ação (register_alert / suggest_only / highlight). |
| `form-controls/ConfidenceSlider.tsx` | Slider de minConfidence. |
| `inspector/RadarInspectorPanel.tsx` | Painel lateral direito (status, key/value, fluxo, pronto). |
| `inspector/InspectorPrimitives.tsx` | Primitivos do inspector. |
| `preview/RadarPreview.tsx` | Resumo em linguagem humana (passo Revisão). |
| `dryrun/PatternDryRunPanel.tsx` | Resultado do "Testar ao vivo". |

Catálogo de dados (puro, sem React):
- `intelligence/triggerLibrary.ts` — `TRIGGER_LIBRARY`, `TRIGGER_BY_TYPE`, labels/tones de categoria/coverage/mode.
- `intelligence/triggerRecipes.ts` — `TRIGGER_RECIPES`.
- `intelligence/patternDryRunEngine.ts` — `runPatternDryRun`, `validateDryRunPattern`.
- `utils/commandFormatters.ts` — `formatConditionHuman`, `COND_LABELS`.
- `utils/patternStudioHelpers.ts` — `useScopeLookups`, `clampParam`, `PARAM_CLAMP`, `normalizeText`.

Integração / consumidor:
- `components/views/patterns/PatternsView.tsx` instancia `CustomPatternModal` via `lazy()` com props:
  `open, initial, onClose, onSave, availableMatches, availableLeaguesRich, availableTeamsRich, fixtures, statsMap, eventsMap, isFavoriteTeam, isAdvanced, commandAlerts`.
- `onSave` → `handleCustomSave` → write-through (`createPatternWT` / `updatePatternWT`) → backend/localStorage.

## 2. Contrato de dados (NÃO ALTERAR)

Tipos: `Pattern`, `PatternCondition`, `PatternConditionType` em `types/commandTypes.ts`.

`buildData(status)` retorna `Omit<Pattern, 'id' | 'createdAt' | 'updatedAt'>`:

```
name, description, conditions, severity, status,
isTemplate, templateId,
scope, scopeFilter, matches,
excludeLeagues, excludeTeams, excludeMatches,
requireRichData, onlyLive, onlyPreMatch,
minConfidence, action,
maxTriggersPerMatch, antiDuplicateWindow
```

Regras de payload preservadas:
- `scopeFilter` só enviado para `specific_leagues`/`specific_teams` quando `length > 0`, senão `undefined`.
- `matches` / `excludeLeagues` / `excludeTeams` / `excludeMatches` → `undefined` quando vazios.
- `requireRichData` / `onlyLive` / `onlyPreMatch` → `undefined` quando `false`.
- `maxTriggersPerMatch` (default 2) e `antiDuplicateWindow` (default 5) preservados do `initial`.
- `isTemplate` / `templateId` preservados do `initial`.

## 3. Fluxo de dados

Estado local do modal (useState): name, desc, severity, scope, scopeFilter,
matchesFilter, excludeLeagues, excludeTeams, excludeMatches, requireRichData,
onlyLive, onlyPreMatch, minConf, action, conditions, step, visitedSteps,
showDryRun, dryRunResults, dryRunErrors.

Reset em `open`/`initial` via `useEffect`.

## 4. Validações

- `hasName = name.trim().length > 0`
- `hasConditions = conditions.length > 0`
- `canSave = hasName && hasConditions`
- (antigo) `canActivate = canSave && allStepsVisited` — exigia visitar os 6 passos.
- Dry-run: `validateDryRunPattern(draft)` antes de rodar.

## 5. Backend / persistência

- O modal NÃO chama backend diretamente. Apenas `onSave(payload)`.
- A persistência (write-through → repo Firebase/Prisma) é responsabilidade do
  Command Center. Logo, preservar o shape de `buildData` garante zero diferença
  de contrato no backend.

## 6. Riscos de regressão

1. Alterar `buildData` → quebra contrato backend/sync. **Mitigação: copiar verbatim.**
2. Alterar `CustomPatternModalProps` → quebra `PatternsView`. **Mitigação: manter interface.**
3. Quebrar reset em reopen → estado vazado entre criações. **Mitigação: manter useEffect.**
4. Remover validações obrigatórias (nome/condições) → radar inválido salvo. **Mitigação: manter `canSave`.**
5. Dry-run criar dados → proibido. O engine é client-side e não persiste; preservado.
6. Regras de Hooks: `useScopeLookups` é chamado antes do early-return. **Mitigação: manter ordem.**

## 7. Diagnóstico UX (motivação do redesign)

- Stepper horizontal + conteúdo single-column → muita rolagem.
- Trigger Lab mostra biblioteca inteira + receitas sempre → ocupa muito espaço.
- Inspector lateral repete informação do resumo.
- Pickers de liga/time inline deixam o passo Escopo longo.
- Sensação de "formulário web" em vez de ferramenta nativa.
