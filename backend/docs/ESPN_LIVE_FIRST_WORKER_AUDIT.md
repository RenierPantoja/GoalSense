# ESPN LIVE FIRST WORKER AUDIT — B59

## Auditoria B59 — Persistent Worker Readiness

Este documento audita o estado atual do ESPN Live-First para transição de runner síncrono para worker persistente.

### O Que Hoje Depende de Memória do Processo

**Runner atual (B57/B58):**
- `espnLiveFirstMonitoringRunner.service.ts` mantém sessões em `activeSessions` Map()
- `intervalHandle` criado via `setInterval()` no processo atual
- `fixtureStates` armazenados em memória por sessão
- Sem persistência de `startedAt`, `snapshotsCaptured`, etc. entre restarts

**Componentes que sobrevivem processo:**
- `liveMonitoringSessions` no Firebase (criados no B57)
- `liveMonitoringFixtureStates` no Firebase (criados no B57)
- `liveSnapshots` no Firebase (criados via `captureLiveSnapshot`)

**Componentes que NÃO sobrevivem processo:**
- `espnLiveFirstMonitoringRunner.service.ts` activeSessions Map
- `setInterval` handles
- In-memory fixture states para polling controle
- Progress tracking de sessões em execução

### O Que Já Está Persistido (B57)

**Firebase Collections:**
- `liveMonitoringSessions` — Metadados da sessão (startedAt, status, fixtures, etc.)
- `liveMonitoringFixtureStates` — Estado por fixture (snapshots, lastStatus, eventsDetected)
- `liveSnapshots` — Snapshots reais capturados
- `signalLedger`, `alertOutcomes`, `causalLearningCases` — Para causal cases

### O Que Acontece Se o Processo Cai No Meio Do Jogo?

**Hoje (B57/B58):**
1. Script termina → `setInterval` cancelado
2. Sessão fica "órfã" no Firebase (status=running, mas sem heartbeat)
3. Fixture states não atualizados (última atualização antes do crash)
4. Sem recheces disparados após crash
5. Post-match nunca rodou (nenhuma partida terminou)

**Riscos:**
- Jogos ao vivo não monitorados após crash
- governance evaluations perdidas
- momentum assessments não atualizados
- causal cases não criados para jogos finalizados durante crash

### Como Identificar Sessão Órfã?

**Definição de sessão órfã:**
```typescript
{
  status: 'running',
  heartbeatAt < now - LEASE_TTL_SECONDS * 1000,
  workerRunId: null ou desaparecido
}
```

**Indicadores de órfão:**
1. `liveMonitoringSession.status === 'running'`
2. `heartbeatAt` antigo (> TTL segundos atrás)
3. Nenhum `liveMonitoringFixtureState` atualizado recentemente
4. Nenhum `espLiveFirstWorkerRun` encontrado para a sessão
5. `liveMonitoringFixtureState` com lease expirado

### Como Retomar Sessão?

**Fluxo de recuperação:**
1. Detectar sessão órfã
2. Verificar se fixture ainda está live ( ESPN feed)
3. Se live: criar novo `workerRun`, adquirir leases, retomar polling
4. Se FT: fechar sessão, mandar para post-match sweeper
5. Se unavailable: completar com warnings

**O que precisa ser recuperado:**
- Session ID e metadata
- Fixture IDs que estavam sendo monitoradas
- Estado atual de cada fixture (lastSnapshot, lastStatus, etc.)
- Snapshot diffs pendentes
- Events pendentes para governance recheck

### Como Evitar Dois Workers Monitorando a Mesma Fixture?

**Lease/Lock Service (B59):**
```typescript
interface EspnLiveFirstFixtureLease {
  fixtureId: string
  sessionId: string
  workerRunId: string
  acquiredAt: string
  heartbeatAt: string
  leaseExpiresAt: string
  status: 'active' | 'released' | 'expired' | 'completed' | 'orphaned'
  owner: string // processId + hostId
  limitations: string[]
}
```

**Regras:**
- Lease TTL = 120 segundos (configurável)
- Heartbeat a cada 30 segundos (configurável)
- Se heartbeat atrasar → lease expira
- Lease expirado → pode ser adquirido por outro worker
- Se lease ativo e diferente workerRunId → bloquear

**Firebase collection:**
- `espnLiveFirstFixtureLeases`

### Como Parar Polling Quando Full-Time?

**Detecção de full-time:**
1. ESPN fixture status = 'FT', 'AET', 'PEN'
2. `liveMonitoringFixtureState.completed = true`
3. Release lease
4. Sessão completa quando todos fixtures completos

**Fluxo:**
```typescript
if (fixture.status in ['FT', 'AET', 'PEN']) {
  await stopMonitoringSession(sessionId, 'All fixtures completed')
  await runPostMatchSweeperForSession(sessionId)
}
```

### Como Rodar Post-Match Depois Do Fim?

**Post-Match Sweeper (B59):**
1. Encontrar sessões com status completed
2. Para cada fixture:
   - Capturar snapshot final (se disponível)
   - Resolver outcome (vencedor, resultado exato, etc.)
   - Linkar governance evaluations ao outcome
   - Criar causal case live-first
   - Classificar: evaluable / not_evaluable
3. Atualizar daily report

**Fluxo:**
```typescript
function findCompletedLiveFirstFixtures() {
  // Sessões completed
  // Fixtures com status FT/AET/PEN
  // Snapshots disponíveis
}

function runLiveFirstPostMatchForFixture(fixtureId) {
  // Build final snapshot
  // Resolve outcome
  // Create causal case
  // Update daily report
}
```

### Quais Dados Precisam de Heartbeat?

**Heartbeat fields (atualizados a cada poll):**
```typescript
EspnLiveFirstWorkerRun {
  heartbeatAt: string
  lastSnapshotAt?: string
  lastRecheckAt?: string
  lastEventDetectionAt?: string
  lastGovernanceEvaluationAt?: string
}
```

**Lease heartbeat fields:**
```typescript
EspnLiveFirstFixtureLease {
  heartbeatAt: string
  leaseExpiresAt: string // heartbeatAt + TTL
}
```

### Quais Riscos de Custo/Polling Existem?

**Riscos mitigados (B57/B58):**
- ✓ Provider budget guard (`guardProviderCall`)
- ✓ Poll interval mínimo (30s)
- ✓ Fixture cap (5 fixtures)
- ✓ Max session duration (180m)
- ✓ Backoff em erros consecutivos

**Riscos adicionais (B59):**
- Multiple workers potential (mitigated por lease)
- Snapshot burst (mitigated por `shouldStoreSnapshot`)
- Summary enrichment budget (mitigated por `guardProviderCall`)

### Quais Limites Devem Ser Configuráveis?

**Environment variables (B59):**
```
ESPN_LIVE_FIRST_LEASE_TTL_SECONDS=120
ESPN_LIVE_FIRST_HEARTBEAT_SECONDS=30
ESPN_LIVE_FIRST_MAX_FIXTURES=5
ESPN_LIVE_FIRST_MAX_SESSION_MINUTES=180
ESPN_LIVE_FIRST_STOP_ON_FULL_TIME=true
ESPN_LIVE_FIRST_ENABLE_POST_MATCH_SWEEPER=true
ESPN_LIVE_FIRST_POST_MATCH_SWEEP_INTERVAL_SECONDS=300
ESPN_LIVE_FIRST_LEASE_RECOVERY_INTERVAL_SECONDS=60
```

### Componentes Atuais (B57/B58)

**Implementados:**
- ✓ ESPN Football Provider Adapter
- ✓ Live Monitor Service
- ✓ Live Monitor Worker
- ✓ Live Monitoring Sessions (Firebase)
- ✓ Live Fixture Discovery
- ✓ Snapshot Diff Detection
- ✓ Polling Loop Runner
- ✓ Governance Recheck Bridge
- ✓ Live First Intelligence Loop
- ✓ Post-Match Review Script

**Limitações:**
- ✗ No persistência de polling state entre restarts
- ✗ No lease/lock para evitar duplicidade
- ✗ No orphan recovery
- ✗ No post-match sweeper automático
- ✗ No worker run tracking
- ✗ No heartbeat tracking

### Próximos Passos B59

1. Criar contratos de worker persistente
2. Implementar lease/lock service
3. Criar persistent worker runner
4. Implementar orphan session recovery
5. Criar post-match sweeper
6. Criar CLI scripts para worker
7. Atualizar daily report/campaign
8. Criar WorkerPanel frontend
9. Implementar smoke tests
10. Documentar nova arquitetura

Status: **READY FOR B59 IMPLEMENTATION**