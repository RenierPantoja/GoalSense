# GoalSense — Estratégia de Cobertura Gratuita Multi-Provider

## Por que salada mista gratuita?

Nenhuma API gratuita cobre 100% dos jogos ao vivo com todas as informações necessárias. A solução é combinar múltiplas fontes gratuitas, cada uma contribuindo com o que faz melhor.

## Providers Ativos

| Provider | Cobertura | Dados | Limite |
|----------|-----------|-------|--------|
| ESPN (pública) | MLS, ligas europeias, algumas sul-americanas | Placar, eventos, stats, narração, lineups, logos | Sem limite |
| football-data.org | Brasileirão, Premier League, La Liga, Serie A, Bundesliga | Placar, gols, cartões, substituições, calendário | 10 req/min |
| API-Football | Global (incluindo Brasileirão) | Stats completas, eventos, lineups, odds | 7.500 req/dia (2 keys = 15.000) |
| TheSportsDB | Global | Logos, badges, metadados de times | Sem limite prático |
| ScoreBat | Global | Highlights em vídeo (quando disponíveis) | Sem limite |

## O que cada um fornece

### ESPN
- Melhor para: scores ao vivo, narração play-by-play, stats por partida, logos HD
- Fraqueza: não cobre Brasileirão consistentemente no endpoint `/all/summary`

### football-data.org (free tier)
- Melhor para: calendário do Brasileirão, placar ao vivo, gols com goleador
- Fraqueza: sem stats detalhadas (posse, finalizações), delay de 1-2min no status

### API-Football
- Melhor para: stats completas do Brasileirão (posse, chutes, escanteios), lineups, eventos
- Fraqueza: quota limitada (7.500/dia por key)

### TheSportsDB
- Melhor para: logos/badges de alta qualidade
- Fraqueza: sem dados ao vivo

### ScoreBat
- Melhor para: vídeos de highlights pós-jogo
- Fraqueza: não tem todos os jogos

## Como canonicalMatchId evita bug de ID

Cada provider usa IDs internos diferentes. Um ID numérico da football-data (ex: 554903) pode coincidir com um event ID da ESPN que é de outro jogo.

**Solução**: canonicalMatchId = `data:nomeNormalizadoHome:nomeNormalizadoAway`

Exemplo: `2026-05-23:gremio:santos`

Esse ID é INDEPENDENTE de provider. A deduplicação usa este ID + `teamsAreSame()` para fuzzy matching.

## Como o GoalSense evita abrir jogo errado

1. Ao clicar num jogo, o fixture completo é salvo em `sessionStorage` + `location.state`
2. A match page lê o fixture salvo e usa como base IMEDIATA
3. Tenta enriquecer com ESPN/API-Football por team name search
4. Antes de aceitar enriquecimento, valida com `isSameMatchStrict(expected, candidate)`
5. Se validação falha → mantém dados do fixture clicado
6. NUNCA substitui o jogo por outro

## Riscos

- football-data.org free tier tem delay no status (1-2 min)
- API-Football pode esgotar quota em dias de muitos jogos
- ESPN pode não ter dados de ligas menores
- Times com nomes muito incomuns podem não normalizar corretamente

## Por que não usamos scraping

- SofaScore/Flashscore bloqueiam scraping com rate limiting e CAPTCHAs
- Viola termos de uso
- Instável em produção
- Não é necessário — a combinação de APIs gratuitas cobre bem

## Limitações reais

1. Brasileirão sem stats quando API-Football está com quota esgotada e ESPN não cobre
2. football-data.org free tier tem delay de 1-2 minutos para status IN_PLAY
3. Jogos de ligas muito pequenas podem ter apenas placar básico
4. Escalações só disponíveis via ESPN ou API-Football
5. Narração play-by-play só via ESPN

## Como configurar envs

```env
# Obrigatórias
API_FOOTBALL_KEYS=key1,key2
FOOTBALL_DATA_API_KEY=your_key

# Já configuradas (sem key necessária)
THESPORTSDB_API_KEY=3
ESPN_BASE_URL=https://site.api.espn.com/apis/site/v2/sports/soccer
SCOREBAT_BASE_URL=https://www.scorebat.com/video-api/v1
```
