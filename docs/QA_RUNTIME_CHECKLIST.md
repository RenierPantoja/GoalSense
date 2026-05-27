# GoalSense — QA Runtime Checklist

Checklist prático para validar o app em browser real depois de mudanças grandes.
Não é teste automatizado: é a passagem manual recomendada antes de release ou
push para produção.

## Como rodar

```bash
npm install
npm run dev
```

Vite sobe em `http://localhost:3000` (ou 3001 se a porta estiver ocupada).
Abrir o DevTools antes de começar e deixar o painel **Console** visível.

Para validar a versão production:

```bash
npm run build
npm run preview
```

## O que observar no console

- Erros vermelhos: tratar como bloqueador.
- Warnings de chave React (`Each child in a list should have a unique "key" prop`).
- Warnings de hidratação ou de hooks fora de ordem.
- 4xx/5xx em requisições para `/api/*` (provider exausto ou rota Netlify quebrada).
- Erros de imagem 404 só são alarme se acontecerem em massa.

## Rotas para abrir

| Rota | O que abrir |
|---|---|
| `/app/live` | Live Radar |
| `/app/matches` | Central de Partidas |
| `/app/matches/:id` | Match Center (clicar num jogo da Central) |
| `/app/command` | Command Center |
| `/app/alerts` | Gerenciador de Alertas |
| `/app/favorites` | Favoritos |
| `/app/leagues` | Ligas |
| `/app/settings` | Configurações |
| `/app/dashboard` | redireciona para `/app/live` |
| `/app/pricing` | redireciona para `/app/settings` |

Cada rota deve carregar sem crash, exibir loading enquanto busca dados e
apresentar empty state honesto se não houver dados.

## Live Radar (`/app/live`)

- Lista de jogos ao vivo carrega.
- Buscar por time/liga/comando filtra a lista.
- Clicar num jogo navega para o Match Center.
- Favoritar um time (estrela) persiste após reload.
- Se não houver jogos ao vivo, a seção "Em breve" aparece com fixtures soon.

## Matches (`/app/matches`)

- Agenda do dia carrega. `Hoje`, navegação por data e input `<date>` funcionam.
- Filtros: Todos / Principais / Ao vivo / Próximos / Encerrados / Alta relevância /
  Em breve / Brasil / Europa / Placar definido / Favoritos — cada um filtra.
- Modos de visualização: Agenda / Destaques / Compacto.
- Em estado de erro de fetch, o botão `Tentar novamente` re-dispara os dois
  providers (football-data + ESPN). **Confirmar que retorna dados completos,
  não só metade.**
- Clicar num jogo abre Match Center com o `fixture` correto via state.

## Match Center (`/app/matches/:id`)

Testar pelo menos um jogo de cada estado, se houver:

### Scheduled
- Cabeçalho aparece com nomes/escudos/horário corretos.
- `PreMatchIntelligencePanel` carrega.
- Botão `Análise avançada` expande/colapsa.
- Botão `Criar radar para esta partida` navega para `/app/command` com
  `prefilledDraft` (matches=[canonicalId]).

### Live
- Stats aparecem se provider for ESPN.
- Eventos da timeline aparecem.
- Filtros de eventos (Todos / Gols / Cartões / Subst. / Fin.) funcionam.
- `LivePressureGraph` aparece se houver dados.
- Narração e filtros de narração aparecem se houver.

### Finished
- Score final correto.
- `IntelligenceTimelinePanel` aparece se houver dados de KB.
- `PostMatchIntelligencePanel` aparece com leitura.
- Recarregar a página mantém o estado (KB persistiu o jogo finalizado).

## Command Center (`/app/command`)

### Cockpit
- Sem radar configurado: onboarding com até 4 templates clicáveis.
- Com radar configurado e sem sinal: mostra "Nenhum sinal detectado agora".
- Com sinal: mostra cartão de Decisão Agora + lista de padrões batendo.

### Pattern Studio (Padrões)
- Header mostra contadores (Ativos, Pausados, Templates, Motor auto, Disparos hoje).
- Toggle do motor automático abre o modal na primeira ativação.
- Botão `Criar radar` abre `CustomPatternModal`.
- Wizard de 6 passos: Identidade → Escopo → Trigger Lab → Ação → Confiança → Revisão.
- Visitar todos os passos pelo menos uma vez antes de tentar `Criar e ativar`.
- Tentar ativar antes de visitar todos os passos: botão deve ficar desabilitado
  com tooltip "Visite todos os passos antes de ativar".
- Salvar pausado: pattern aparece em "Radares configurados" com toggle off.
- Editar / Duplicar / Excluir: cada ação confirma.
- Configurar template: abre `TemplateConfigModal` com 5 passos.
- Configurar motor automático: abre `AutoDiscoveryConfigModal`. Toggle "Registrar
  alerta automaticamente" muda copy do banner de Segurança.

### Scanner
- Sem radar configurado: empty state com CTA para Pattern Studio.
- Com radar: lista APENAS partidas com hit ou descoberta. **Nunca jogos comuns.**
- Filtros: Todos / Críticos / Atenção / Favoritos / Ao vivo / Em breve / Dados ricos.
- Cada linha tem chip de escopo audit no modo avançado.
- Clicar abre Match Center.

### Alertas
- Filtros por status: Todos / Pendentes / Confirmados / Parciais / Falhados / Expirados.
- Badge "Command Center" e badge "Jornada" aparecem onde apropriado.
- Botão `Ver em /app/alerts` navega para o gerenciador externo.

### Performance
- Header mostra contadores e Taxa de acerto.
- Taxa só aparece com >= 5 resoluções (confirmadas + falhadas).
- Lista "Por padrão" com banda de barras (verde/cyan/rose).
- Sidebar "Critérios de cálculo" sempre visível.
- Empty state honesto sem padrões configurados.

## Alerts (`/app/alerts`)

- Alertas locais (regras criadas pelo usuário) aparecem.
- Alertas do Command Center aparecem com badge.
- Limpar: confirmar que após limpar nenhum alerta fantasma sobra.

## Settings (`/app/settings`)

- Modo: Básico ↔ Avançado persiste no localStorage.
- Favoritos: contadores de Times / Ligas / Partidas.
- Limpar todos os favoritos: confirmação dupla, sucesso esperado.
- Alertas: contadores de regras criadas / ativas.
- Limpar todos os alertas: confirmação, sucesso esperado.
- Dados locais: stats de Cache / Favoritos / Padrões / Alertas / Cmd Alerts /
  Outcomes.
- **Após qualquer limpeza, todos os contadores atualizam juntos** (V4.2).
- Limpar cache expirado, pré-jogo, KB, outcomes, alertas disparados.
- Limpar tudo: confirmação dupla, depois disso o app deve voltar ao estado
  inicial sem crash.
- Biblioteca de escopo (Scope KB): contadores de Ligas / Times / Partidas.
- Atualizar stats: re-lê do localStorage.
- Limpar biblioteca de escopo: confirma e remove.

## Favorites (`/app/favorites`)

- Times / ligas / partidas favoritas aparecem agrupadas.
- Remover individual funciona.
- Empty state com CTAs para Matches/Live/Leagues.

## Leagues (`/app/leagues`)

- Lista de competições do football-data carrega.
- Filtros: Todas / Brasil / Europa / Favoritas.
- Clicar numa liga abre detalhes com classificação se o provider entregar.
- Em erro: o botão `Tentar novamente` (V4.2) re-faz o fetch.

## Mobile / Responsivo

DevTools → Toggle device toolbar.

- 390px (mobile): sidebars colapsam, header não ultrapassa, modais usam
  largura total com scroll interno.
- 768px (tablet): grids colapsam para 2 colunas onde aplicável.
- 1366px (notebook): layouts principais usam 2 colunas.
- 1920px+ (desktop): max-w-* contém o layout sem esticar demais.

Telas críticas para validar em mobile:

- Match Center (header, stats, eventos)
- Command Center → Pattern Studio (wizard, ScopePicker, Trigger Lab)
- Settings (todos os botões clicáveis)
- Alerts (lista + filtros)

## Storage (validação real)

1. Criar um radar via Pattern Studio.
2. Recarregar a página.
3. Confirmar que o radar persiste em "Radares configurados".
4. Settings → Limpar Scope KB.
5. Confirmar que padrões e alertas continuam intactos.
6. Settings → Limpar alertas disparados.
7. Confirmar que a aba Alertas do Command Center fica vazia.
8. Settings → Limpar tudo do GoalSense.
9. Recarregar.
10. Confirmar que app volta ao estado inicial sem erro de console.

## Checks de qualidade antes de commit

```bash
npm run check:encoding
npx tsc --noEmit
npx vite build
```

Os três precisam passar. Encoding flagra mojibake (`Ã`, `Â`, `â€`).
TypeScript flagra qualquer erro de tipo. Build flagra import quebrado.
