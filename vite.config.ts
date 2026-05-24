import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const API_BASE = 'https://v3.football.api-sports.io'

  // Key rotation for local dev
  const keys = (env.API_FOOTBALL_KEYS || env.API_FOOTBALL_KEY || '').split(',').map(k => k.trim()).filter(Boolean)
  let currentKeyIndex = 0

  function getKey(): string {
    return keys[currentKeyIndex] || ''
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      port: 3000,
      proxy: {
        '/.netlify/functions/espn-live': {
          target: 'https://site.api.espn.com',
          changeOrigin: true,
          rewrite: () => '/apis/site/v2/sports/soccer/all/scoreboard',
        },
        '/.netlify/functions/football-data-matches': {
          target: 'https://api.football-data.org',
          changeOrigin: true,
          rewrite: (p) => {
            const url = new URL(p, 'http://localhost')
            const matchId = url.searchParams.get('matchId')
            const date = url.searchParams.get('date') || ''
            if (matchId) return `/v4/matches/${matchId}`
            return date ? `/v4/matches?date=${date}` : '/v4/matches'
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => {
              req.setHeader('X-Auth-Token', env.FOOTBALL_DATA_API_KEY || '')
            })
          },
        },
        '/.netlify/functions/api-football-live': {
          target: API_BASE,
          changeOrigin: true,
          rewrite: () => '/fixtures?live=all',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('x-apisports-key', getKey())
              proxyReq.removeHeader('accept-encoding')
            })
          },
        },
        '/.netlify/functions/api-football-fixture': {
          target: API_BASE,
          changeOrigin: true,
          rewrite: (p) => {
            const url = new URL(p, 'http://localhost')
            return `/fixtures?id=${url.searchParams.get('id')}`
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => { req.setHeader('x-apisports-key', getKey()); req.removeHeader('accept-encoding') })
          },
        },
        '/.netlify/functions/api-football-fixtures': {
          target: API_BASE,
          changeOrigin: true,
          rewrite: (p) => {
            const url = new URL(p, 'http://localhost')
            return `/fixtures?date=${url.searchParams.get('date')}`
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => { req.setHeader('x-apisports-key', getKey()); req.removeHeader('accept-encoding') })
          },
        },
        '/.netlify/functions/api-football-leagues': {
          target: API_BASE,
          changeOrigin: true,
          rewrite: () => '/leagues?current=true',
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => { req.setHeader('x-apisports-key', getKey()); req.removeHeader('accept-encoding') })
          },
        },
        '/.netlify/functions/api-football-standings': {
          target: API_BASE,
          changeOrigin: true,
          rewrite: (p) => {
            const url = new URL(p, 'http://localhost')
            return `/standings?league=${url.searchParams.get('league')}&season=${url.searchParams.get('season')}`
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => { req.setHeader('x-apisports-key', getKey()); req.removeHeader('accept-encoding') })
          },
        },
        '/.netlify/functions/futpythontrader-today': {
          target: 'https://api.futpythontrader.com',
          changeOrigin: true,
          rewrite: (p) => {
            const url = new URL(p, 'http://localhost')
            const source = url.searchParams.get('source') || 'footystats'
            const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]
            const league = url.searchParams.get('league')
            return league
              ? `/api/dados/jogos-do-dia/${source}/${date}/?league=${encodeURIComponent(league)}`
              : `/api/dados/jogos-do-dia/${source}/${date}/`
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => {
              req.setHeader('Authorization', `Token ${env.FUTPYTHONTRADER_TOKEN || ''}`)
              req.removeHeader('accept-encoding')
            })
          },
        },
        '/.netlify/functions/scorebat-videos': {
          target: 'https://www.scorebat.com',
          changeOrigin: true,
          rewrite: () => '/video-api/v1/',
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => { req.removeHeader('accept-encoding') })
          },
        },
      },
    },
  }
})
