# Variáveis de Ambiente — Vercel

## Obrigatórias (Server-side, API routes)

| Variável | Descrição |
|----------|-----------|
| `API_FOOTBALL_KEY` | Chave da API-Football (v3.football.api-sports.io) |
| `API_FOOTBALL_KEYS` | Chaves múltiplas separadas por vírgula (rotação) |
| `API_FOOTBALL_BASE_URL` | Base URL (default: https://v3.football.api-sports.io) |
| `FOOTBALL_DATA_API_KEY` | Chave do football-data.org |
| `FOOTBALL_DATA_BASE_URL` | Base URL (default: https://api.football-data.org/v4) |

## Opcionais (Server-side)

| Variável | Descrição |
|----------|-----------|
| `THESPORTSDB_API_KEY` | Chave TheSportsDB (free tier: "3") |
| `THESPORTSDB_BASE_URL` | Base URL TheSportsDB |
| `SCOREBAT_BASE_URL` | Base URL ScoreBat videos |
| `FUTPYTHONTRADER_TOKEN` | Token FutPythonTrader |
| `FUTPYTHONTRADER_BASE_URL` | Base URL FutPythonTrader |
| `ESPN_BASE_URL` | Base URL ESPN (default: public, no key) |

## Frontend (prefixo VITE_)

| Variável | Descrição |
|----------|-----------|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_API_BASE_PATH` | Path base das APIs (default: /api) |

## Notas

- Variáveis sem prefixo VITE_ são usadas apenas nas API routes (server-side)
- ESPN não precisa de key (API pública)
- Na Vercel, configurar em Settings > Environment Variables
- Não expor keys no client bundle
