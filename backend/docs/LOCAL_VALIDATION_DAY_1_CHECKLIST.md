# LOCAL VALIDATION DAY 1 CHECKLIST

## Pré-Requisitos
- [ ] O projeto compila sem erros (`npm run typecheck`, `npm run build`).
- [ ] Smoke test do fluxo passa (`node scripts/smokeFirstRealValidationWorkflow.mjs`).
- [ ] A chave da API-Football está no `.env` e NÃO no controle de versão.
- [ ] Credenciais do Firebase estão no disco local e referenciadas corretamente.

## Passo a Passo do Dia
- [ ] Rodar `checkLocalValidationEnv.mjs`. Resultado: "Safe to run validation: yes".
- [ ] Rodar `runFirstValidationPlan.mjs`. Confirmar a seleção de jogos (sem excessos).
- [ ] Rodar `runTodayIdentityAndMappingPrep.mjs`. **Ação:** Confirmar mapeamentos ambíguos via Backstage ou script.
- [ ] Rodar `runTodayCriticalAcquisition.mjs`. **Ação:** Preencher dados recomendados para *Manual Intake*.
- [ ] Rodar `buildTodayMatchIntelligence.mjs`. Revisar "Blocking Vars" e "Wait Reasons".
- [ ] Rodar `runTodayLocalValidation.mjs`. Deixar o runner ativo se for monitorar eventos live (se aplicável localmente).
- [ ] No fim do dia (após encerramento dos jogos selecionados), rodar `runTodayPostMatchCausalReview.mjs`.
- [ ] Gerar o Daily Validation Report via API ou Backstage e anexar à Campanha "Week 1".

## Regras
- **Não** habilite o enforce da governança.
- **Não** conecte o bot do Telegram.
- **Não** assuma premissas comerciais (ex: ROI); foque na cobertura de dados (coverage) e bloqueios de infraestrutura.
