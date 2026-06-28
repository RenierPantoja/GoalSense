# ESPN LIVE-FIRST REALITY MAP AUDIT (B56)

## Análise da Realidade ESPN Live-First

1. **Quais dados reais a ESPN fornece hoje?**
   - Minuto, placar, status (in_progress, half_time, full_time).
   - Estatísticas de time (posse de bola, chutes, escanteios, faltas, cartões amarelos/vermelhos).
   - Eventos principais (gols, cartões, substituições).

2. **Quais campos são confiáveis?**
   - Placar, minuto, status da partida e eventos críticos (gols, vermelhos).

3. **Quais campos são parciais?**
   - Estatísticas avançadas (ataques perigosos) dependem do nível de cobertura da liga.

4. **Quais campos não existem ou não são confiáveis via ESPN local scraping?**
   - Lesões, suspensões detalhadas, táticas e contextos profundos pré-jogo (sem manual intake).

5. **Qual é o delay atual estimado?**
   - Tipicamente de 1 a 3 minutos em relação ao campo.

6. **Qual é a cadência atual de atualização?**
   - Em modo live, o sistema pode consultar a cada 1 ou 2 minutos de forma segura sem ser bloqueado.

7. **Onde o sistema está travando por falta de provider externo?**
   - Na camada de `MatchIntelligencePackage V5` e `AlertDecisionGovernance`, o sistema exige a resolução de domínios críticos (`blocked_missing_mapping`, `wait_for_domain_fetch`).

8. **Quais waits devem virar limitation em live mode?**
   - A falta de escalações, lesões e suspensões pré-jogo deve virar `limitation` (análise com dados parciais) e não um `wait` bloqueante quando o jogo já está ao vivo e temos um snapshot fresco.

9. **Quais dados live podem alimentar influência?**
   - Posse de bola extrema, diferença de chutes, cartões vermelhos (desbalanceamento) e gols recentes alterando o momentum.

10. **Quais dados live podem alimentar governança?**
    - Um `red_card` ou `goal_recent` deve desencadear reavaliação imediata. Pressão sustentada pode mudar de `observe` para `monitor` ou `allow_best_effort`.

11. **Quais dados live podem gerar reavaliação?**
    - Mudanças de status (ex: intervalo), mudanças de placar e cartões vermelhos.

12. **Como validar o backend ao vivo sem API completa?**
    - Usando o modo `live_espn_only` (Best Available Data Mode). Aceitar que a análise é parcial, mas provar que a esteira completa (Extração -> Readiness -> Precheck -> Governança -> Causal Learning) processa e reage ao vivo.
