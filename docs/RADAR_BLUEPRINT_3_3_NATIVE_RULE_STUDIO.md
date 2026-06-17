# Radar Blueprint 3.3 — Native Rule Studio

Reconstrução visual sobre a lógica 3.1 (motor intocado). Foco: experiência
nativa premium, sem painel fixo e sem CTA confuso.

## Por que o Engine Panel fixo foi removido

A coluna lateral fixa "Prontidão do motor" ocupava ~30% da tela e dava cara de
dashboard web. A informação não foi perdida — foi redistribuída:
- **status compacto no header** (`maturityLabel · N filtros · N sinais · estado`);
- **pendências/avisos inline** no canvas (`ReadinessInline`), logo abaixo da regra;
- **compatibilidade** no contrato (modo revisão).

Tudo continua derivado de `getRadarReadiness` + `compileRadarContract`.

## Por que "Validar no motor" saiu do footer

Como CTA fixo, competia com Salvar/Revisar/Ativar e confundia (toda análise do
GoalSense já é ao vivo). Agora é **ação secundária e contextual**, dentro do modo
revisão: "Verificar com partidas atuais →". Continua read-only (endpoint
`POST /api/patterns/diagnose`): não cria alerta, não salva, não envia Telegram,
não altera snapshot/fixture.

## Estrutura do modal (ampliado)

- `max-w-[1360px]`, conteúdo centralizado (`max-w-[880px]`) para leitura editorial.
- Sem stepper lateral, sem Engine Panel fixo, sem 3ª coluna.
- Header (status) · Native Rule Studio (canvas) · ReadinessInline · Footer progressivo.
- Modo revisão substitui o canvas pelo contrato executável.

## Native Rule Studio (`canvas/NativeRuleCanvas.tsx`)

A regra como composição viva, linhas editoriais + chips + controles inline:
- **Radar** — nome editorial inline (sem input pesado) + severidade (segmented) + nota.
- **Monitorar** — pill → sheet de escopo (reusa `ScopePicker`; listas nunca no canvas).
- **Avaliar quando** — chips de filtro + `+ filtro`.
- **Disparar se** — chips de sinal real + `+ sinal real` (+ `receita`).
- **Então** — pill → sheet de ação.
- **Rigor** — pill → sheet com presets (Sensível/Equilibrado/Rigoroso) + slider.

Chips premium tonalizados por capacidade (eligibility/signal/partial/unsupported),
editáveis (sheet de parâmetros) e removíveis.

## Command Sheets

- **Escopo**: sheet contido com `ScopePicker` (modos + busca/chips internos),
  Cancelar/Concluir. Listas longas nunca aparecem no canvas.
- **Condições**: sheet contido com busca + **abas (Executáveis · Parciais · Não
  executáveis)** + categorias + cards compactos + editor de parâmetros. Aberto por
  contexto (`+ filtro` mostra elegibilidade; `+ sinal real` mostra sinais).
- **Receitas**: sheet com marcação "Executável pelo backend" / "Contém condição
  não executável" / "Sem sinal real".

Nota: os command sheets são implementados como overlays contidos dentro do
`NativeRuleCanvas` (não como arquivos `ScopeSelectionSheet.tsx`/
`ConditionCommandSheet.tsx` separados). O comportamento pedido (busca, abas,
selecionados, editor inline, listas fora do canvas) está atendido.

## ReadinessInline (`canvas/ReadinessInline.tsx`)

Bloco compacto e elegante (não card vermelho pesado):
- "Falta para ativar" (requisitos) quando bloqueado;
- "Pronto para revisão · Regra executável pelo backend · Resolução automática"
  quando válido;
- avisos discretos; dependências de dados em chips.

## Footer progressivo

- Incompleto: Cancelar · Salvar rascunho · Revisar radar (disabled c/ motivo).
- Válido não revisado: Cancelar · Salvar pausado · Revisar radar.
- Revisão: Cancelar · Salvar pausado · Editar regra · Ativar radar.
- Sem "Validar no motor" e sem "Criar e ativar" precoce.

## Revisão como contrato focado

"Revisar radar" troca para `RadarContractView` (o que o motor fará) + ação
secundária de diagnóstico. Ativar só no modo revisão e se `canActivate`.

## Limpeza de dormentes

- Removidos: `inspector/EngineReadinessPanel.tsx` (substituído por ReadinessInline).
- Já removidos na 3.2: `BlueprintNav`, `BlueprintSummary`, `ComposerNav`.
- Mantidos (usados pelo `TemplateConfigModal`): `WizardProgressRail`,
  `WizardStepHeader`, `ConditionsEditor`, `RadarInspectorPanel`, `RadarPreview`.

## Preservado

`getRadarReadiness`, `compileRadarContract`, capability matrix, endpoint de
diagnóstico, `buildData`/payload, `CustomPatternModalProps`, PatternsView,
Command Center, workers. Backend não tocado.

## Limitações reais restantes

- Command sheets vivem dentro do `NativeRuleCanvas` (não em arquivos próprios).
- `TemplateConfigModal` ainda usa o layout wizard antigo (fora do escopo).
- "Salvar rascunho" e "Salvar pausado" geram o mesmo `status: paused` (sem `draft`).
- Diagnóstico avalia todos os jogos ao vivo (sem filtro de escopo específico).
- Sheet de escopo reusa `ScopePicker` (3 colunas dedicadas — Todos/Favoritos/...,
  resultados, selecionados — é refinamento visual futuro).
