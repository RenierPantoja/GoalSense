# FIRST REAL VALIDATION WORKFLOW (B51)

## Visão Geral
Este documento descreve o fluxo de scripts a serem executados diariamente pelo operador durante a Fase 1 da Validação Local (Validation Campaign Week 1).

## Ordem de Execução

1. **Configuração e Segurança**
   ```bash
   node scripts/checkLocalValidationEnv.mjs
   ```
   *Garante que `enforce` está desligado, `Telegram` está desligado e a configuração básica está correta.*

2. **Planejamento**
   ```bash
   node scripts/runFirstValidationPlan.mjs
   ```
   *Gera o escopo do dia respeitando limites (ex: max 10 partidas).*

3. **Resolução de Identidade**
   ```bash
   node scripts/runTodayIdentityAndMappingPrep.mjs
   ```
   *Deriva mapeamentos, auto-confirma os seguros e lista ambíguos que requerem o operador.*

4. **Aquisição Crítica**
   ```bash
   node scripts/runTodayCriticalAcquisition.mjs
   ```
   *Busca lineups, injuries e standings APENAS para entidades com mapeamento confirmado.*

5. **Construção de Inteligência**
   ```bash
   node scripts/buildTodayMatchIntelligence.mjs
   ```
   *Monta o pacote V5, gera a influência e avalia a governança no modo `observe`.*

6. **Validação Local e Métricas**
   ```bash
   node scripts/runTodayLocalValidation.mjs
   ```
   *Executa a simulação contínua do dia, monitora as partidas e gera os relatórios de validação.*

7. **Pós-Jogo e Causal Learning**
   ```bash
   node scripts/runTodayPostMatchCausalReview.mjs
   ```
   *Após o término das partidas, roda o aprendizado causal e gera sugestões (não aplicadas automaticamente).*
