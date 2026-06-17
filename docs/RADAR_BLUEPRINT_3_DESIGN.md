# Radar Blueprint 3.0 — Logic-first Native Composer

Substitui o Radar Composer 2.0. Esta fase é **logic-first**: a prontidão e o
contrato do radar vêm antes da estética. Auditoria: `RADAR_BLUEPRINT_3_AUDIT.md`.

## Por que 2.0 não bastava

- `canSave`/`canActivate` liberavam cedo (nome + `is_live` já habilitava ativar).
- Defaults (escopo "todos", ação "registrar", rigor 50%) eram tratados como decisões.
- Elegibilidade (`is_live`, `minute_between`) contava como sinal.
- "Testar ao vivo" não comunicava o que fazia.
- Nada garantia que o motor (worker) conseguia executar as condições.

## Nova lógica (fonte única de verdade)

`src/features/command/intelligence/radarReadiness.ts` (puro, testável):

- **`classifyConditionKind(condition)`** → `eligibility | signal | blocker | context`.
  - eligibility: `is_live`, `is_pre_live`, `minute_between`, `is_final_phase`.
  - context: `favorite_involved`.
  - signal: placar/pressão/controle/escanteios/disciplina.
- **`compileRadarContract(draft)`** → contrato canônico (escopo, elegibilidade,
  sinais, ação, confiança, severidade, resolutionMode, dependências de dados,
  compatibilidade de backend). Deriva do draft; NÃO altera o payload salvo.
- **`getRadarReadiness(draft, flags)`** → `{ status, canSaveDraft, canSavePaused,
  canActivate, canRunEngineDiagnostic, errors, warnings, requirements,
  dataDependencies, backendCompatibility, maturityLabel, primaryMessage, counts }`.

Status: `empty · draft · incomplete · valid_paused · ready_for_review ·
ready_to_activate · blocked`.

Regras-chave:
- **≥ 1 sinal real** é obrigatório para `canSavePaused` e `canActivate`.
- `is_live`/`minute_between` sozinhos NÃO ativam.
- Defaults não confirmados viram **warnings** (flags `*Touched`).
- `canActivate` exige `reviewed` (contrato revisado).
- **Compatibilidade de backend**: condição fora do avaliador do worker
  (`favorite_involved`, `is_pre_live`, `home/away_goals_gte`, `yellow/red_cards_gte`,
  `shots_recent_gte`) → `blocked`, ativação impedida com motivo nomeado.

## Compatibilidade com o motor (backend)

`BACKEND_SUPPORTED_CONDITIONS` espelha exatamente o switch de
`backend/src/modules/command/commandEvaluation.service.ts`. Ajuste mínimo no
backend: `score_diff_lte` agora lê `params.maxDiff ?? params.value ?? 1`
(corrige mismatch maxDiff↔value; retrocompatível; sem mudança de schema).

## CTAs corrigidos (footer contextual)

- Incompleto: **Cancelar · (Validar no motor) · Salvar rascunho · Revisar (bloqueado)**.
- Tecnicamente válido, não revisado: **Cancelar · Validar no motor · Salvar pausado · Revisar radar**.
- Revisado e pronto: **Cancelar · Validar no motor · Salvar pausado · Ativar radar**.
- "Criar e ativar" não aparece cedo. "Revisar radar" é o CTA antes da revisão.
- `Pattern.status` não tem `draft`; "Salvar rascunho" persiste `paused` (mesmo
  payload). A diferença é só o gate/label (documentado).

## "Validar no motor" (ex-"Testar ao vivo")

- Diagnóstico **local** (client-side, `runPatternDryRun`). Não cria alerta, não
  salva, não manipula snapshot/fixture. Tooltip deixa claro que é diagnóstico local.

## Nova arquitetura visual

- **Esquerda — Mapa de maturidade** (`BlueprintNav`): status reais por seção
  (vazio/padrão/definido/incompleto/inválido/pronto/bloqueado), Elegibilidade e
  Sinal separados com contagem. Não há check verde para default sem maturidade.
- **Centro — Blueprint** (`BlueprintSummary`): a regra como frase clicável
  (Radar · Monitorar · Avaliar quando · Disparar se · Então · Com rigor) +
  editor da seção ativa abaixo.
- **Direita — Prontidão do motor** (`EngineReadinessPanel`): bloqueado/atenção/
  pronto, contagem de filtros vs sinais, "Falta para ativar", "O motor vai…",
  avisos, dependências de dados, compatibilidade de backend.
- **Revisão — Contrato executável** (`RadarContractView`): "o motor avaliará
  quando…", "o alerta será disparado se…", "ao disparar…".

## Payload preservado

`buildData` idêntico ao 2.0. `CustomPatternModalProps` inalterado. Reset em
reopen preservado. `useScopeLookups` antes do early-return.

## Acessibilidade / teclado

- Esc fecha sheet antes do modal (sheets do TriggerComposer) e, no modal, pede
  confirmação se houver alterações.
- Cmd/Ctrl+S salva (pausado se válido, senão rascunho).
- Cmd/Ctrl+Enter ativa só se `canActivate`.
- `aria-invalid` no nome, `aria-current` na seção ativa, foco visível, disabled com motivo.

## Arquivos

Criados: `intelligence/radarReadiness.ts`, `shell/BlueprintNav.tsx`,
`preview/BlueprintSummary.tsx`, `preview/RadarContractView.tsx`,
`inspector/EngineReadinessPanel.tsx`, `docs/RADAR_BLUEPRINT_3_AUDIT.md`, este doc.

Alterados: `modals/CustomPatternModal.tsx` (reescrito logic-first),
`backend/src/modules/command/commandEvaluation.service.ts` (fix score_diff_lte).

Dormentes (preservados): `ComposerNav.tsx`, `ConditionsEditor.tsx`,
`WizardProgressRail.tsx`, `WizardStepHeader.tsx`, `RadarInspectorPanel.tsx`,
`RadarPreview.tsx`.

## Limitações reais restantes

- Ligas/times/partidas ainda usam os pickers inline no módulo Escopo (já com
  busca/chips); drawer dedicado é refinamento futuro.
- O editor de condições (`TriggerComposer`) lista todas as condições juntas; a
  separação elegibilidade/sinal aparece no Blueprint e no Engine Readiness, não
  dentro do editor.
- "Salvar rascunho" e "Salvar pausado" geram o mesmo `status: paused` (o modelo
  não tem `draft`).
- "Validar no motor" continua client-side; não há endpoint de diagnóstico no
  backend que rode a regra contra os snapshots reais (refinamento futuro).

---

## 3.1 — Engine Capability Matrix + Real Diagnostic

Extensão do 3.0. Detalhes em `RADAR_ENGINE_CAPABILITY_MATRIX.md` e
`RADAR_ENGINE_CAPABILITY_AUDIT.md`.

- **Matriz central** `radarConditionCapabilities.ts` vira a fonte única de
  verdade (kind, backendSupport, activationAllowed, dependências, params).
  `radarReadiness`/`compileRadarContract`/`TriggerComposer`/`EngineReadinessPanel`
  passam a derivar daí.
- **Editor capability-aware**: o sheet "Adicionar condição" agrupa em
  Disponíveis · Parcialmente suportadas · Ainda não executável pelo backend.
  Receitas mostram "Executável pelo backend" ou alerta de condição não executável.
- **Diagnóstico real**: novo endpoint read-only `POST /api/patterns/diagnose`
  reaproveita o evaluator do worker contra snapshots reais, sem escrever nada.
  "Validar no motor" usa o backend (com fallback local rotulado).
- **Engine Readiness** mostra suporte real + resumo do último diagnóstico.
- **Backend**: `score_diff_lte` já lia `maxDiff ?? value` (3.0); 3.1 exporta
  `evaluateCondition` (puro) e adiciona `radarDiagnostic.service.ts`. Sem mudança
  de schema. `buildData`/payload preservados — capability é só guia de UI.
- Resolve a limitação do 3.0: o item "Validar no motor continua client-side"
  deixa de valer quando há backend configurado.

---

## 3.2 — Native Rule Canvas

Reconstrução de layout (mantendo toda a lógica 3.1). Detalhes em
`RADAR_BLUEPRINT_3_2_NATIVE_RULE_CANVAS.md`.

- Removida a navegação lateral fixa (duplicava o canvas). Status real agora é uma
  linha compacta no header (de `getRadarReadiness`).
- Layout 2 áreas: **Rule Canvas** (≈70%) + **Engine Panel** (≈30%); sem 3ª coluna.
- `canvas/NativeRuleCanvas.tsx`: a regra como frase editável inline — Radar (nome
  editorial + severidade + nota), Monitorar (sheet de escopo), Avaliar quando
  (chips de filtro), Disparar se (chips de sinal real), Então (sheet de ação), Com
  rigor (sheet com presets + slider). Chips premium tonalizados por capacidade.
- Sheets de adicionar condição separados por contexto (filtro vs sinal) e
  agrupados por capacidade; receitas marcadas como executáveis ou não.
- Revisão vira modo do canvas (`RadarContractView`); footer progressivo.
- Dormentes removidos: `BlueprintNav`, `BlueprintSummary`, `ComposerNav`.
  Mantidos (usados pelo TemplateConfigModal): `WizardProgressRail`,
  `WizardStepHeader`, `ConditionsEditor`, `RadarInspectorPanel`, `RadarPreview`.
- Payload/readiness/capabilities/diagnóstico preservados. Backend não tocado.

---

## 3.3 — Native Rule Studio

Reconstrução visual premium (lógica 3.1 intocada). Detalhes em
`RADAR_BLUEPRINT_3_3_NATIVE_RULE_STUDIO.md`.

- **Engine Panel fixo removido**: status no header, pendências/avisos inline no
  canvas (`ReadinessInline`), compatibilidade no contrato.
- **"Validar no motor" sai do footer** e vira ação secundária no modo revisão
  ("Verificar com partidas atuais →"), ainda read-only.
- **Modal ampliado** (`max-w-[1360px]`, conteúdo centralizado), coluna única.
- **Native Rule Studio**: nome editorial, severidade segmented, escopo/ação/rigor
  como controles inline com sheets; filtros e sinais separados; chips premium.
- **Sheet de condições com abas** (Executáveis/Parciais/Não executáveis) + editor inline.
- **Footer progressivo** sem CTA confuso; revisão como contrato focado.
- Removido dormente: `EngineReadinessPanel`. Mantidos os usados pelo TemplateConfigModal.

---

## 3.4 — Premium Interaction System + Dedicated Selection Sheets

Interação premium e organização de componentes (lógica 3.1 intocada). Detalhes em
`RADAR_BLUEPRINT_3_4_PREMIUM_INTERACTIONS.md`.

- **ScopeSelectionSheet** dedicada (3 colunas: modos · resultados com busca ·
  selecionados; snapshot temp com Aplicar/Cancelar; avançado reusa pickers).
- **ConditionCommandSheet** dedicada (addFilter/addSignal/edit/recipes; abas
  Executáveis/Parciais/Não executáveis; editor de params; receitas com suporte).
- **RadarConditionChip** premium; **SheetShell** extraído (ESC fecha sheet antes do modal).
- Linguagem corrigida: removido "Salvar rascunho" (modelo não tem `draft`); só
  "Salvar pausado" (desabilitado com motivo quando inválido).
- **ReadinessInline** refinado (3 estados); diagnóstico segue secundário na revisão.
- Diagnóstico não filtra escopo específico → aviso honesto exibido.
- Removido dormente: `TriggerComposer`. Mantidos os usados pelo TemplateConfigModal.
