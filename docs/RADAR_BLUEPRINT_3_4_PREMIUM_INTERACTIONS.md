# Radar Blueprint 3.4 — Premium Interaction System + Dedicated Selection Sheets

Interação premium e organização de componentes sobre a lógica 3.1 (motor intocado).

## ScopeSelectionSheet (novo · `scope/ScopeSelectionSheet.tsx`)

Sheet dedicada premium de escopo, em 3 colunas:
- **Esquerda**: modos (Todos / Favoritos / Ligas / Times / Partidas).
- **Centro**: busca em tempo real + lista compacta com logos e metadados
  (país/temporada para ligas; liga para times; liga/status para partidas).
- **Direita**: selecionados (contador + chips + limpar seleção).
- **Filtros avançados** (disclosure): toggles `onlyLive`/`onlyPreMatch`/
  `requireRichData` + exclusões (reusa `LeaguePicker`/`TeamPicker`/`MatchPicker`).
- Trabalha em **snapshot temporário**: "Aplicar escopo" commita; "Cancelar"/ESC
  descarta. Listas longas nunca aparecem no canvas.

## ConditionCommandSheet (novo · `canvas/ConditionCommandSheet.tsx`)

Sheet command-palette para condições, modos `addFilter | addSignal | edit | recipes`:
- Busca + categorias + **abas Executáveis / Parciais / Não executáveis**.
- `+ sinal real` prioriza sinais; `+ filtro` prioriza elegibilidade.
- Unsupported só aparece na aba própria com aviso (não como opção normal).
- Editor de parâmetros no próprio sheet (modo edit).
- Receitas mostram **filtros e sinais** que aplicam + suporte backend
  ("Executável pelo backend" / "Contém condição não executável" / "Sem sinal real"
  / "cobertura variável").

## RadarConditionChip (novo · `canvas/RadarConditionChip.tsx`)

Chip premium tonalizado por capacidade (eligibility/signal/partial/unsupported),
editar ao clicar (quando tem params), remover discreto no hover, foco por teclado,
tooltip/microcopy. Menos cara de badge genérica.

## SheetShell (novo · `canvas/SheetShell.tsx`)

Overlay de sheet contido (não portal) com header/subtítulo/footer consistentes e
ESC que fecha o sheet **antes** do modal (captura + stopPropagation).

## Linguagem "rascunho" vs "pausado" (corrigida)

O modelo `Pattern` não tem `draft`. Removemos "Salvar rascunho" (que prometia algo
inexistente). Agora:
- Incompleto: **Cancelar · Salvar pausado (desabilitado, com motivo) · Revisar (desabilitado)**.
- Válido: **Cancelar · Salvar pausado · Revisar radar**.
- Revisado: **Cancelar · Salvar pausado · Editar regra · Ativar radar**.
`Cmd/Ctrl+S` só salva pausado quando válido (nunca salva incompleto).

## ReadinessInline (refinado)

Strip sutil (sem card pesado), 3 estados:
- "Falta para ativar" (requisitos) quando bloqueado;
- "Regra executável · revise antes de ativar" quando válido;
- "Contrato confirmado · pronto para ativar" quando revisado.
Avisos discretos + dependências em chips.

## RadarContractView (revisão)

Mantém o contrato executável (Monitorar / Avaliar quando / Disparar se / Então /
rigor / compatibilidade). Diagnóstico é **ação secundária** ("Verificar com
partidas atuais →"), nunca no footer; continua read-only.

## Diagnóstico e escopo (honestidade)

O diagnóstico read-only avalia os jogos ao vivo disponíveis e **não aplica o
filtro de escopo específico** (liga/time/partida). Quando o escopo é específico,
o painel mostra: *"Diagnóstico avalia os jogos ao vivo disponíveis; o filtro de
escopo específico é aplicado pelo motor no runtime."* (limitação documentada,
sem enganar o usuário).

## Limpeza de componentes dormentes

- Removido nesta fase: `triggers/TriggerComposer.tsx` (substituído por
  NativeRuleCanvas + ConditionCommandSheet).
- Já removidos antes: `BlueprintNav`, `BlueprintSummary`, `ComposerNav`,
  `EngineReadinessPanel`.
- Mantidos (usados pelo `TemplateConfigModal`): `ScopePicker`, `ConditionsEditor`,
  `WizardProgressRail`, `WizardStepHeader`, `RadarInspectorPanel`, `RadarPreview`.

## Preservado

`getRadarReadiness`, `compileRadarContract`, capability matrix, endpoint
`/api/patterns/diagnose`, `buildData`/payload, `CustomPatternModalProps`,
PatternsView, Command Center, workers. Backend não tocado.

## Limitações reais restantes

- Diagnóstico não filtra escopo específico (aviso exibido; aplicado no runtime do motor).
- `TemplateConfigModal` ainda usa o layout wizard antigo (fora do escopo).
- O modelo não tem `draft` persistido — "pausado" é o único estado não-ativo.
- Em telas muito estreitas, as sheets rolam internamente; drawer mobile dedicado é refinamento futuro.
- Sem virtualização de lista nas sheets (as listas vêm do scope KB local, tamanho moderado).
