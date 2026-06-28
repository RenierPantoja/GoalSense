# REAL ESPN LIVE MONITORING AUDIT

## Auditoria B57 — Real Live Monitoring Readiness

Este documento audita o sistema backend atual para execução real ESPN Live-First com dados ao vivo.

### ESPN Live Discovery
- **Jogos ao vivo descobertos**: Via ESPN all/scoreboard endpoint
- **Endpoint/fonte**: `${ESPN_BASE_URL}/all/scoreboard` (público, sem API key)
- **Status considerados live**: `['1H', '2H', 'HT', 'ET', 'P', 'BT']`
- **Filtros aplicados**: Live + FT recentes apenas
- **Rate limiting**: 8s timeout, backoff em erro consecutivo

### Snapshot Capture
- **Como snapshot é capturado**: `captureLiveSnapshot()` em liveMonitor.service.ts
- **Triggering**: Mudança de status, placar, minuto, ou novos eventos
- **Persistência**: Via repository layer (Firebase ou Prisma)
- **Enriquecimento**: ESPN summary para stats/eventos (opcional, com budget guard)

### Freshness & Delay
- **Freshness calculado**: Por comparação timestamp vs última atualização ESPN
- **Delay estimado**: Baseado no poll interval (padrão 45s)
- **Polling interval**: ENV LIVE_WORKER_INTERVAL_MS (mín 30s)

### Real vs Simulado
- **B56 simulado**: Mockado fixtures, artificially created snapshots
- **B57 real**: ESPN live feed, real score changes, real events
- **Separação**: Via flags `liveFirstReal=true` em reports

### Snapshot Persistência
- **Onde salvos**: Collections `liveSnapshots` via repository
- **Retenção**: Controlada por snapshot lifecycle B32
- **Deduplicação**: Via `shouldStoreSnapshot()` logic

### Live Recheck
- **Como disparado**: Via LiveRecheckBridge B50 em mudanças reais
- **Triggers**: Score change, status change, new events
- **Safety**: Observe mode only, rate limited, never sends alerts

### Polling Safety
- **Evita polling agressivo**: Min interval 30s, backoff em erros consecutivos
- **Provider budget**: Consulta guardProviderCall() antes de cada call
- **Fixture cap**: Limitado por LOCAL_VALIDATION_MAX_FIXTURES

### Causal Cases Post-Jogo
- **Criação**: Via post-match outcome resolution
- **Critérios**: Jogo finalizado + outcome disponível + sufficient data
- **Classificação**: live_best_effort_correct/limited/insufficient

### Dados ESPN Suficientes
- **Placar**: ✓ Sempre disponível
- **Minuto**: ✓ Para jogos live
- **Status**: ✓ Mapeado para estados internos
- **Stats**: ✓ Via summary endpoint (possession, shots, cards, etc.)
- **Eventos**: ✓ Via keyEvents/details (goals, cards, subs)

### Limitações Permanentes
- **Missing pre-match**: ESPN não tem lineup/injuries/suspensions pré-jogo
- **Stats coverage**: Nem todos jogos têm stats completas
- **Event timing**: Pode ter delay de 1-2 minutos
- **Rate limits**: Público, mas throttled em uso intenso

### Componentes Implementados (B56)
✓ ESPN Football Provider Adapter
✓ Live Monitor Service
✓ Live Monitor Worker
✓ ESPN Live Snapshot Normalizer (via service)
✓ Live Momentum Interpreter (via intelligence loop)
✓ Best Available Data Policy (via adapter)
✓ Live Recheck Bridge (B50)
✓ Local Validation Runner
✓ Daily Validation Report
✓ Causal Learning Runner
✓ Alert Decision Governance
✓ Influence Engine
✓ Match Intelligence Package V5
✓ Firebase repositories
✓ Noop fallback

### Componentes Frontend (B56)
✓ ESPN Live First Panel (basic)
✗ Backstage Match Intelligence Panel (needs real mode)
✗ Local Validation Panel (needs real session tracking)
✗ Daily Validation Report Panel (needs simulated vs real)
✗ Causal Learning Panel (needs live-first cases)
✗ Alert Governance Panel (needs live recheck display)

### Missing for B57 Real Execution
✗ Real live fixture discovery service
✗ Live monitoring session contracts
✗ Safe polling loop with session tracking
✗ Snapshot diff/event detection
✗ Live governance recheck with real events
✗ Live-first intelligence loop integration
✗ Real live-first daily report separation
✗ Post-match live-first outcome resolution
✗ ESPN Live-First Panel real mode
✗ Operational scripts
✗ Smoke tests for real scenarios

### Próximos Passos B57
1. Implementar contratos LiveMonitoringSession
2. Criar espnLiveFixtureDiscovery.service.ts
3. Implementar polling loop seguro com sessão rastreável
4. Adicionar snapshot diff detection
5. Integrar com governance recheck real
6. Atualizar daily reports para separar real vs simulado
7. Implementar post-match resolution
8. Atualizar frontend panels para modo real
9. Criar scripts operacionais
10. Implementar smoke tests

Status: **READY FOR B57 IMPLEMENTATION**