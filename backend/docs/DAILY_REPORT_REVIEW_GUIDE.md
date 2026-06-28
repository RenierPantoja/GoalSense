# DAILY REPORT REVIEW GUIDE

O Daily Validation Report é o artefato mais importante do fim de cada dia. Ao revisar o relatório gerado, o operador deve focar nos seguintes pontos:

## 1. Fixtures Planejadas vs Analisadas
- Todas as selecionadas foram analisadas? Se houve *drop*, foi erro não-fatal na governança ou bloqueio crítico?

## 2. Domain Coverage e Manual Intake
- Quantos domínios foram resolvidos via provider e quantos via Intake Manual?
- Se a proporção de Intake Manual for muito alta para domínios essenciais, revise os mapeamentos de identidade (`blocked_missing_mapping`).

## 3. Governance e Holds
- Quantos *holds* foram gerados? Quais foram os *wait reasons* mais comuns (ex: `wait_for_lineup`)?
- A governança foi excessivamente restrita (`too strict`)?

## 4. Causal Learning e Not Evaluable
- Partidas `not_evaluable` indicam falta de dados no desfecho (post-match). O endpoint `post_match_stats` do provider falhou?

## 5. Limitações e Custos
- Revise as requisições estimadas ao Firebase e ao Provider para garantir que não ultrapassemos as cotas locais.

## Decisão Diária
- Anexe o report à Campanha. Se as métricas estiverem estáveis, siga para o dia seguinte sem alterar código. Se houver crashes repetidos, corrija a ingestão do provider.
