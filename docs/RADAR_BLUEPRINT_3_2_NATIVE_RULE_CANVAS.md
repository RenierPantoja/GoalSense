# Radar Blueprint 3.2 — Native Rule Canvas

Reconstrução de layout/experiência sobre a lógica da 3.1 (sem reescrever o motor).

## Por que a lateral foi removida

A 3.1 tinha uma coluna esquerda (mapa de maturidade) listando Identidade/Escopo/
Elegibilidade/Sinal/Ação/Rigor/Revisão, enquanto o centro mostrava praticamente
os mesmos blocos no blueprint. Isso duplicava informação e reforçava sensação de
wizard. A lateral foi removida; o status real (de `getRadarReadiness`) virou uma
linha compacta no header.

## Nova arquitetura

```
┌ Header compacto + status inteligente ───────────────────────────┐
├ Rule Canvas (≈70%)                     │ Engine Panel (≈30%) ─────┤
│ regra como frase editável inline       │ prontidão do motor       │
├────────────────────────────────────────┴──────────────────────────┤
│ Footer progressivo                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

- Sem terceira coluna fixa. Sem stepper.
- Header: `Rascunho · 1 filtro · 0 sinais reais · bloqueado para ativar` (derivado
  de readiness: `maturityLabel · counts.eligibility · counts.signal · status`).

## Rule Canvas (`canvas/NativeRuleCanvas.tsx`)

A regra como sentença operacional editável inline:

- **Radar** — nome editorial inline (sem input pesado) + severidade em pills + nota/descrição sutil.
- **Monitorar** — pill de escopo → sheet com `ScopePicker` (padrão aparece como "padrão", não confirmado).
- **Avaliar quando** — chips de filtros (eligibility/context/blocker) + `+ filtro`.
- **Disparar se** — chips de sinais reais + `+ sinal real` (+ `receita`). Sem sinal → `+ adicionar sinal real` em âmbar.
- **Então** — pill de ação → sheet (`ActionCardPicker`).
- **Com rigor** — pill `50% · Equilibrado` → sheet com presets (Sensível/Equilibrado/Rigoroso) + `ConfidenceSlider`.

Chips premium tonalizados por capacidade: eligibility (neutro), signal (verde/cyan),
partial (âmbar), unsupported (vermelho com ícone). Editar abre sheet de parâmetros;
remover sinal pode bloquear ativação imediatamente.

Sheets de adicionar condição são **separados por contexto** (filtro vs sinal) e
agrupados por capacidade: Disponíveis · Parcialmente suportadas · Ainda não
executável pelo backend. Receitas marcam "Executável pelo backend" / "Contém
condição não executável" / "Sem sinal real".

## Engine Panel (`inspector/EngineReadinessPanel.tsx`)

Mantido da 3.1 (já era logic-first): status forte (Bloqueado/Atenção/Pronto),
contagem filtros vs sinais, "Falta para ativar" / "O motor vai…", avisos,
dependências de dados, compatibilidade de backend e resumo do último diagnóstico.

## Footer progressivo

- Incompleto: Cancelar · (Validar no motor) · Salvar rascunho · Revisar radar (disabled c/ motivo).
- Válido não revisado: Cancelar · Validar no motor · Salvar pausado · Revisar radar.
- Revisão: Cancelar · Validar no motor · Salvar pausado · Editar regra · Ativar radar.
- "Validar no motor" só aparece quando `canRunEngineDiagnostic`.

## Revisão como modo do canvas

"Revisar radar" troca o canvas para o `RadarContractView` (contrato executável).
"Editar regra" volta ao canvas. Ativar só no modo revisão e se `canActivate`.

## Diagnóstico do motor

Inalterado: usa o endpoint read-only `POST /api/patterns/diagnose` (3.1) quando há
backend configurado; fallback local rotulado. Não cria alerta, não salva, não
envia Telegram, não altera snapshot/fixture.

## Payload / lógica preservados

`buildData`, `CustomPatternModalProps`, `getRadarReadiness`, `compileRadarContract`,
capability matrix e o endpoint de diagnóstico — todos intactos. Backend não tocado.

## Limpeza de componentes dormentes

- Removidos (sem uso): `shell/BlueprintNav.tsx`, `preview/BlueprintSummary.tsx`,
  `shell/ComposerNav.tsx`.
- Mantidos (ainda usados pelo `TemplateConfigModal`): `WizardProgressRail`,
  `WizardStepHeader`, `ConditionsEditor`, `RadarInspectorPanel`, `RadarPreview`.

## Limitações reais restantes

- O `TemplateConfigModal` ainda usa o layout wizard antigo (não foi alvo desta fase).
- Em telas estreitas (< lg), o Engine Panel desce abaixo do canvas (stack), não vira
  drawer dedicado — refinamento futuro.
- "Salvar rascunho" e "Salvar pausado" continuam gerando `status: paused` (modelo sem `draft`).
- Diagnóstico ainda não aplica filtro de escopo específico (avalia todos os jogos ao vivo).
