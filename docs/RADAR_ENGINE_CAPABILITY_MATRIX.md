# Radar Engine Capability Matrix (Phase 3.1)

Documento de referência da matriz central de capacidades + diagnóstico real.

## Fonte única de verdade

`src/features/command/intelligence/radarConditionCapabilities.ts`
exporta `CONDITION_CAPABILITIES`, `getCapability`, `classifyConditionKind`,
`BACKEND_EXECUTABLE`, `unsupportedConditionsOf`.

Consumida por:
- `radarReadiness.ts` (getRadarReadiness / compileRadarContract)
- `TriggerComposer.tsx` (agrupamento supported/partial/unsupported + receitas)
- `EngineReadinessPanel.tsx` (suporte real + último diagnóstico)
- `RadarContractView.tsx` (via contract)

## Estrutura `ConditionCapability`

```
type, label, kind, backendSupport,
activationAllowed, diagnosticAllowed,
dataDependencies[], requiredParams[],
resolutionSupported, reasonIfUnsupported?, warningIfPartial?
```

## Regras derivadas

- `activationAllowed = backendSupport !== 'unsupported'`.
- Radar com qualquer condição `unsupported` → `getRadarReadiness.status = blocked`,
  ativação impedida com motivo nomeado.
- `partial` → ativa permitido + aviso "cobertura variável".
- ≥ 1 `signal` real exigido para salvar pausado e ativar (eligibility não conta).

## Diagnóstico real (read-only)

Endpoint: `POST /api/patterns/diagnose` (`backend/.../radarDiagnostic.service.ts`).
- Reaproveita `evaluatePatternAgainstInput` + `evaluateCondition` + `buildPatternInput`
  (mesma lógica do worker) contra os snapshots reais ao vivo.
- Escreve NADA: sem alerta, sem pattern, sem resolution, sem performance, sem Telegram,
  sem alterar snapshot/fixture.
- Códigos: `OK · NO_LIVE_FIXTURES · DATA_INSUFFICIENT · UNSUPPORTED_CONDITION`.
- Saída: evaluatedFixtures, eligibleFixtures, sufficientDataFixtures, wouldTrigger,
  blockedReasons (por condição), unsupportedConditions, dataDependencies,
  sampleFixtures, warnings.

Frontend: "Validar no motor" chama o backend quando há URL configurada
(`isBackendEnabled`); sem backend, cai para diagnóstico LOCAL claramente rotulado.

## Condições ainda unsupported (pendências de suporte futuro no worker)

| condição | suporte recomendado |
|---|---|
| is_pre_live | adicionar avaliação pré-jogo + janela temporal no worker |
| home_goals_gte / away_goals_gte | adicionar casos no evaluator (já há score por mando no input) |
| shots_recent_gte | derivar finalizações recentes via timed events |
| yellow_cards_gte / red_cards_gte | separar amarelos/vermelhos no evaluator (stats já têm os campos) |
| favorite_involved | exigiria sincronizar favoritos do usuário no backend |

## Verificação real executada

`POST /api/patterns/diagnose` com {is_live, minute_between 55–90, score_diff_lte,
shots_on_target_gte 4} retornou (dado ao vivo real, sem escrever nada):
`evaluatedFixtures:1, eligibleFixtures:1, sufficientDataFixtures:1, wouldTrigger:1`
(Fortaleza vs América-MG, 82', Série B, dataQuality rich).
