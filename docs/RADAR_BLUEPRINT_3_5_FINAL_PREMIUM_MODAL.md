# Radar Blueprint 3.5 (final) — Premium Native Modal Rebuild

Consolidação definitiva do modal "Criar radar". Lógica 3.1 intocada (readiness,
contract, capability matrix, diagnóstico read-only, payload).

## Problemas corrigidos

- **Painel lateral "Resumo do motor" removido** — ocupava ~30% da largura, cortava
  conteúdo e tinha scroll vertical próprio. A informação foi para uma **strip
  integrada** abaixo da regra (`RuleReadinessStrip`).
- **Modal maior** — `max-w-[1460px]`, altura `min(91vh,900px)`; foco total na regra.
- **Layout em coluna única** — sem coluna lateral concorrente; conteúdo centralizado.
- **Sheets grandes** — agora preenchem todo o corpo do modal (não mais cardzinhos
  contidos no canvas estreito); header/busca fixos, scroll só na lista.
- **Sem abas/categorias vazias** — o ConditionCommandSheet só mostra categorias
  com itens, só mostra abas (Executáveis/Parciais/Não executáveis) com conteúdo,
  e cai na primeira aba não-vazia. Mensagens úteis quando não há resultado.
- **"Validar no motor" não é CTA** — é ação secundária dentro da revisão.

## Componentes

- `canvas/RuleStudioShell.tsx` — casca calma e ampla (sem grid/glow).
- `canvas/NativeRuleCanvas.tsx` — superfície única: card de identidade + lista
  agrupada (tiles com gradiente/profundidade + ícones semânticos: Telescope,
  Timer, Crosshair, BellRing, Gauge) + `RuleReadinessStrip`. Scroll próprio;
  sheets cobrem todo o corpo.
- `canvas/RuleReadinessStrip.tsx` — readiness integrada (status, pendências,
  avisos, dependências, compatibilidade) em strip horizontal, sem painel cortado.
- `canvas/SheetShell.tsx` — sheet que preenche o corpo (header/conteúdo/footer).
- `canvas/ConditionCommandSheet.tsx` — adicionar filtro/sinal/editar/receitas,
  sem vazios, com tabs e categorias dinâmicas, grid 3 colunas em desktop.
- `scope/ScopeSelectionSheet.tsx` — escopo em 3 áreas (modos · resultados ·
  selecionados) + avançado; "Todos os jogos"/"Favoritos" mostram explicação, não
  lista vazia.
- `preview/RadarContractView.tsx` — revisão como contrato (com ação secundária de
  diagnóstico).

## Footer honesto

- Incompleto: Cancelar · Salvar pausado (desabilitado, com motivo) · Revisar (desabilitado).
- Válido: Cancelar · Salvar pausado · Revisar radar.
- Revisado: Cancelar · Salvar pausado · Editar regra · Ativar radar.
- Sem "Criar e ativar" precoce; sem "Validar no motor" no footer; primário em
  teal da marca. Não há "rascunho" falso (modelo só tem `paused`).

## Identidade visual GoalSense

Dark graphite + acento **teal `#2DD4BF`/`#13B8A6`** (precisão), âmbar para atenção,
vermelho só para bloqueio; tiles com profundidade própria; hierarquia editorial;
inspirado em Apple/Linear/Raycast/Stripe sem cópia literal.

## Limpeza de dormentes

- Removido: `canvas/EngineConsole.tsx` (substituído pela strip).
- Já removidos antes: `BlueprintNav`, `BlueprintSummary`, `ComposerNav`,
  `EngineReadinessPanel`, `ReadinessInline`, `TriggerComposer`.
- Mantidos (usados pelo `TemplateConfigModal`): `ScopePicker`, `ConditionsEditor`,
  `WizardProgressRail`, `WizardStepHeader`, `RadarInspectorPanel`, `RadarPreview`.

## Limitações reais restantes

- `TemplateConfigModal` ainda usa o layout wizard antigo (fora do escopo).
- Diagnóstico não filtra escopo específico (aviso honesto exibido na revisão).
- Modelo `Pattern` não tem `draft` (só "pausado").
- `ScopeSelectionSheet` foi mantida com esse nome (atende ao "ScopeSelectionStudio"
  pedido: 3 áreas, busca, selecionados, estados vazios inteligentes).
