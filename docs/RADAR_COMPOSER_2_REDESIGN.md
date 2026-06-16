# Radar Composer 2.0 — Redesign

Redesign do modal de criação/edição de radar do Command Center, de "wizard web
longo" para um composer nativo premium. Auditoria prévia: `RADAR_COMPOSER_2_AUDIT.md`.

## Diagnóstico do modal antigo

- Stepper horizontal + conteúdo em coluna única → muita rolagem.
- Trigger Lab exibia biblioteca inteira + receitas sempre abertas → pesado.
- Inspector lateral repetia o resumo.
- Pickers de liga/time inline alongavam o passo Escopo.
- Ativação exigia "visitar" os 6 passos (`allStepsVisited`), forçando idas e voltas.

## Nova arquitetura (3 colunas + footer fixo)

```
┌ Header compacto: Criar radar · status · fechar ──────────────────┐
├ Nav lateral │ Canvas modular           │ Preview do radar ───────┤
│ compacta    │ (uma seção por vez)      │ (linguagem humana)      │
├─────────────┴──────────────────────────┴─────────────────────────┤
│ Cancelar │ Testar ao vivo · Salvar pausado · Criar e ativar       │
└───────────────────────────────────────────────────────────────────┘
```

- **Nav lateral** (`ComposerNav`): vertical, compacta, qualquer seção é clicável.
  Indicadores por seção: ativo, check de completo, contagem (condições) ou marca
  de pendência. Em telas pequenas vira faixa horizontal rolável.
- **Canvas modular**: apenas a seção ativa é renderizada (sem scroll gigante).
  Seções: Identidade · Escopo · Condições · Ação · Rigor · Revisão.
- **Preview do radar** (`RadarInspectorPanel` com `heading="Preview do radar"`):
  status, severidade, escopo, ação, confiança, nº de condições, fluxo operacional
  em linguagem humana e estado "pronto para salvar".
- **Footer fixo**: Cancelar (esquerda) · Testar ao vivo · Salvar pausado · Criar e ativar.

## Trigger Lab → TriggerComposer (conditions-first)

Novo componente `triggers/TriggerComposer.tsx`:
- Condições ativas como **cards de uma linha** com edição de parâmetros inline e
  remoção on-hover.
- **"Adicionar condição"** abre um sheet contido (sem portal) com **busca** +
  **categorias** (Tempo, Placar, Pressão, Controle, Escanteios, Disciplina,
  Contexto). Adicionar não fecha o contexto; "Concluir" fecha.
- **"Usar receita"** abre um sheet com as receitas (`TRIGGER_RECIPES`), cada uma
  com chips das condições e botão Aplicar.
- Reusa o catálogo `triggerLibrary` + `triggerRecipes`, `ParamField` e `clampParam`,
  então o `PatternCondition[]` emitido é idêntico ao do editor antigo.

## Contrato preservado (zero diferença para o backend)

- `CustomPatternModalProps` inalterado → `PatternsView` continua funcionando.
- `buildData()` copiado verbatim (mesmos campos, mesmas regras de `undefined`).
- Validações preservadas: nome obrigatório, ≥1 condição (`canSave`).
- Reset em reopen preservado (`useEffect [open, initial]`).
- `useScopeLookups` segue antes de qualquer early-return (Rules of Hooks).
- Dry-run ("Testar ao vivo") segue client-side, sem persistir nada.

## Mudança de comportamento (intencional, sem afetar payload)

- Removido o gate `allStepsVisited` para ativar. Como o Preview do radar fica
  visível o tempo todo e qualquer seção é acessível direto, `canActivate = canSave`.
  O payload salvo é exatamente o mesmo; apenas não força o usuário a percorrer os
  6 passos antes de ativar.

## Acessibilidade / teclado

- `Esc` fecha (com confirmação se houver alterações — `isDirty()`).
- `Cmd/Ctrl+S` → Salvar pausado (quando válido).
- `Cmd/Ctrl+Enter` → Criar e ativar (quando válido).
- `aria-current` na seção ativa, `aria-label` em botões icônicos, foco visível,
  estados `disabled` com `title` explicando o motivo, labels nos campos.

## Componentes criados / alterados

Criados:
- `shell/ComposerNav.tsx` — navegação lateral compacta.
- `triggers/TriggerComposer.tsx` — builder conditions-first com sheets.
- `docs/RADAR_COMPOSER_2_AUDIT.md`, `docs/RADAR_COMPOSER_2_REDESIGN.md`.

Alterados:
- `modals/CustomPatternModal.tsx` — reescrito para o layout Composer 2.0
  (contrato/estado/buildData preservados).
- `inspector/RadarInspectorPanel.tsx` — prop opcional `heading` (default "Inspector").

Dormentes (mantidos, não removidos para evitar regressão):
- `triggers/ConditionsEditor.tsx`, `shell/WizardProgressRail.tsx`,
  `shell/WizardStepHeader.tsx` — não mais referenciados pelo modal, preservados.

## Builds

Frontend: `npm run check:encoding` ✓ · `npx tsc --noEmit` ✓ · `npx vite build` ✓.
Backend: não tocado nesta fase.

## Limitações / próximos refinamentos

- A seleção de ligas/times/partidas ainda usa os `LeaguePicker`/`TeamPicker`/
  `MatchPicker` inline dentro do módulo Escopo (já têm busca e chips). Migrar para
  um drawer dedicado é um refinamento futuro; hoje o "uma seção por vez" já elimina
  a sobrecarga de scroll do modal.
- O sheet "Adicionar condição"/"Usar receita" é um overlay contido no módulo
  (não portal). Em telas muito baixas pode rolar internamente.
- "Saúde da regra" no preview ainda é o indicador "pronto/pendências" do inspector;
  uma análise de dependência de estatística por condição (ex.: "depende de chutes
  no alvo") pode ser adicionada depois.
- Responsivo testado conceitualmente (nav vira faixa horizontal, preview some em
  telas < lg). Preview como drawer em telas pequenas é refinamento futuro.
