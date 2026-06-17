# Radar Blueprint 3.5 — Premium HUD Redesign (Tony-Stark-like)

Reconstrução puramente visual/experiência sobre a lógica 3.1 (motor, readiness,
contract, capability matrix, diagnóstico e payload intocados).

## Motivação

Feedback: o modal "ampliado" não usava o espaço horizontal, parecia planilha/web
genérica e simples, com mini-dropdowns. Pedido: uma central futurista, tecnológica,
premium e prática — estilo cockpit/HUD, Apple-like.

## O que mudou

- **RuleStudioShell** (`canvas/RuleStudioShell.tsx`): casca de modal bespoke
  (não mais o ModalShell compartilhado) com superfície em camadas — glow radial
  cyan/índigo, grid técnico sutil, hairline de acento no topo, header assinatura
  com tile de ícone (Radar) e selo "Rule Studio". Portal + scroll lock + ESC +
  backdrop preservados.
- **Layout em 2 zonas** que usa todo o espaço horizontal:
  `grid [minmax(0,1fr) · 380px]` → Rule Canvas (esquerda) + Engine Console (direita).
- **EngineConsole** (`canvas/EngineConsole.tsx`): HUD do motor — núcleo de status
  com glow por estado (bloqueado/atenção/pronto), gauges de Filtros e Sinais reais,
  "Falta para ativar" / "O motor vai", avisos, dependências, compatibilidade e
  dock de diagnóstico contextual (read-only) com resumo do último resultado.
  Indicador "live" pulsante. Substitui o ReadinessInline.
- **Cockpit modules** (`canvas/NativeRuleCanvas.tsx`): cada parte da regra é um
  módulo com tile de ícone (Radar/Globe/Clock/Crosshair/Bell/Gauge), label
  uppercase e valor como pill premium com chevron. Nome em campo editorial grande,
  severidade como segmented control colorido. "Disparar se" ganha destaque (accent)
  quando há sinal real. Chips premium (RadarConditionChip).
- **Sheets com ícones**: ConditionCommandSheet agora mostra um tile de ícone por
  categoria (Tempo/Placar/Pressão/Controle/Escanteios/Disciplina/Contexto) em cada
  card, com hover cyan. Abas Executáveis/Parciais/Não executáveis mantidas.
- **CTA premium**: "Ativar radar" com gradiente cyan e glow.

## Preservado

`getRadarReadiness`, `compileRadarContract`, capability matrix, endpoint
`/api/patterns/diagnose` (read-only), `buildData`/payload, `CustomPatternModalProps`,
PatternsView, Command Center, workers. Backend não tocado.

## Limpeza

- Removido dormente: `canvas/ReadinessInline.tsx` (substituído pelo EngineConsole).
- `ModalShell` continua usado por outros modais (AutoDiscovery/Template); só o
  CustomPatternModal passou a usar a casca HUD própria.

## Limitações reais restantes

- Em telas < lg o Engine Console empilha abaixo do canvas (borda lateral fica no
  topo do bloco); drawer mobile dedicado é refinamento futuro.
- `TemplateConfigModal` ainda usa o layout wizard antigo (fora do escopo).
- Diagnóstico não filtra escopo específico (aviso honesto exibido).
- Modelo `Pattern` não tem `draft` (só "pausado").
