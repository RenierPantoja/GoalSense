# Live Radar Integrity Guard

## Por que existe

Providers de dados (ESPN, API-Football, football-data.org) podem retornar fixtures com status inconsistente:
- ESPN retorna TODAS as fixtures do dia (pre/in/post), não apenas live.
- Respostas cacheadas por CDN podem conter jogos de ontem com status stale.
- Jogos suspensos (`SUSP`/`INT`) de dias atrás podem persistir em feeds.
- Status vazio ou desconhecido não deve ser tratado como live.

Sem validação temporal, jogos antigos apareciam na aba /app/live.

## Módulo

`src/lib/liveFixtureGuard.ts`

### API

```ts
isTrulyLiveFixture(fixture: LiveFixture, now?: Date): boolean
getLiveFixtureValidation(fixture: LiveFixture, now?: Date): LiveFixtureValidation
filterTrulyLiveFixtures(fixtures: LiveFixture[], now?: Date): { live, rejected }
```

## Status aceitos como live

| Status | Categoria | Aceito? |
|--------|-----------|---------|
| 1H, 2H, LIVE, IN_PLAY | live | Sim (com janela) |
| HT, HALFTIME, PAUSED | halftime | Sim (com janela) |
| ET, BT, P | extra_time / penalties | Sim (com janela) |
| SUSP, INT | suspended | Condicional (< 3h) |

## Status rejeitados

| Status | Categoria | Motivo |
|--------|-----------|--------|
| FT, AET, PEN, AWD, WO | finished | Jogo encerrado |
| NS, TBD, SCHEDULED | scheduled | Ainda não começou |
| PST, CANC, ABD | cancelled/postponed | Não vai acontecer |
| (vazio), unknown | unknown | Sem informação confiável |

## Janela temporal

- **Máximo desde kickoff**: 5 horas (cobre prorrogação + pênaltis)
- **Máximo no futuro**: 1 hora (cobre edge cases de timezone)
- **Suspensos**: aceitos apenas se kickoff < 3h atrás

### Edge cases

| Cenário | Decisão |
|---------|---------|
| Kickoff ontem 23:30, agora 00:30, status 2H | Aceito (dentro de 5h) |
| Kickoff ontem 18:00, status LIVE | Rejeitado (> 5h) |
| Kickoff hoje, status FT | Rejeitado (finished) |
| Sem data, elapsed 45, status LIVE | Aceito (elapsed plausível) |
| Sem data, sem elapsed, status LIVE | Rejeitado |
| Status SUSP, kickoff 8h atrás | Rejeitado (> 3h) |
| Status SUSP, kickoff 2h atrás | Aceito (pode retomar) |

## Fluxo no /app/live

```
raw fixtures (ESPN + football-data + API-Football)
  → filterTrulyLiveFixtures(fixtures, now)
    → { live, rejected }
  → liveFixtures = live
  → sortByFeaturedRanking(liveFixtures)
    → hero = ranked[0]
  → sortByAttention(filtered)
    → rest of list
```

## Diagnóstico

- **Dev mode** (`import.meta.env.DEV`): `console.debug` com fixtures rejeitadas e motivos.
- **Modo avançado** (UI): strip "Live filter: X recebidas · Y rejeitadas · Z ao vivo" no header.

## Limitações

- Se provider informar status LIVE incorretamente E a data estiver dentro da janela de 5h, o fixture passará.
- Timezone depende de `fixture.date` ser ISO 8601 confiável (todos os 3 providers usam ISO).
- Jogos com kickoff exatamente 5h atrás em prorrogação poderiam ser cortados (raro).
- Não há validação cruzada entre providers (se ESPN diz live e API-Football diz FT para o mesmo jogo, o primeiro a chegar no merge vence).

## Como debugar rejeições

1. Abrir DevTools → Console.
2. Procurar `[LiveRadar] Rejected X fixtures:`.
3. Cada entrada mostra `{ name, reasons }`.
4. Ou ativar modo avançado na UI para ver o strip de contagem.
