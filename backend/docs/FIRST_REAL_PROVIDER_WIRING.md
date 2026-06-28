# FIRST REAL PROVIDER WIRING (B51)

## Objetivo
O bloco B51 consolida a integração do provedor real (API-Football) e a infraestrutura local para a primeira validação com dados quentes, respeitando a diretriz de **"nenhum segredo no repositório"**.

## Regras de Ouro
1. **Nunca comite a `API_FOOTBALL_KEY`**. Ela reside exclusivamente no `.env` local.
2. **Nunca comite o JSON do Firebase Service Account**.
3. A chave do provider habilita chamadas apenas aos endpoints **documentados e implementados** (skeleton honesty).
4. Domínios não implementados são marcados como `blocked_not_documented` ou `not_implemented` para forçar Intake Manual ou aguardar implementação segura.

## Fluxo de Liberação (Domain Unlock Matrix)
Um domínio crítico (ex: lineups, injuries) só é liberado se:
- O provider está configurado (`ENABLE_PROVIDER_API_FOOTBALL=true` + chave válida).
- O mapeamento de identidade da partida (`fixture`) e/ou liga/time está **confirmado** (`auto_confirmed` ou `manually_confirmed`). Mapeamentos ambíguos não liberam fetch.
- O endpoint está catalogado como seguro (`safe_to_call`).

## Consequências
Com o wiring concluído, o sistema passa de um estado simulado (mocks/shadow sem rede) para um estado de leitura real, preservando as métricas e o histórico da campanha local via persistência no Firebase.
