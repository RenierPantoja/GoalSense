# VALIDATION CAMPAIGN WEEK 1 (B51)

## Identificação
**Nome:** GoalSense Local Validation — Week 1
**Target:** 7 a 14 dias de relatórios diários.
**Modo:** Local + Firebase Persistente + API-Football (Real).

## Objetivos da Semana 1
1. **Sobrevivência Operacional:** O sistema roda sem quebrar em dados malformados do provider.
2. **Resolução de Identidade:** Testar se o mapeamento derivado (Team/Competition) reduz o atrito manual dia após dia.
3. **Métricas Honestas:** Medir quantos domínios ficam "blocked_not_documented" ou "provider_not_supported" para dimensionar o esforço de Intake Manual.
4. **Governança Silenciosa:** O sistema registra *Holds* e *No-Go's* mas apenas observa, permitindo auditar por que uma partida foi rejeitada.

## Critérios de Sucesso para Avançar (Controlled Beta)
- Nenhum segredo vazado.
- 7 Daily Reports anexados à campanha.
- Causal Learning processando os *outcomes* sem aplicar sugestões cegamente.
- O relatório de prontidão (`ControlledBetaReadiness`) atinge métricas mínimas de cobertura e robustez para sinalizar uma possível transição.
