import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const API_KEY = env.API_FOOTBALL_KEY || ''
  const API_BASE = 'https://v3.football.api-sports.io'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      port: 3000,
      proxy: {
        // Local dev: proxy Netlify Function calls to API-Football directly
        '/.netlify/functions/api-football-live': {
          target: API_BASE,
          changeOrigin: true,
          rewrite: () => '/fixtures?live=all',
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => { req.setHeader('x-apisports-key', API_KEY) })
          },
        },
        '/.netlify/functions/api-football-fixture': {
          target: API_BASE,
          changeOrigin: true,
          rewrite: (p) => {
            const url = new URL(p, 'http://localhost')
            const id = url.searchParams.get('id')
            return `/fixtures?id=${id}`
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => { req.setHeader('x-apisports-key', API_KEY) })
          },
        },
        '/.netlify/functions/api-football-fixtures': {
          target: API_BASE,
          changeOrigin: true,
          rewrite: (p) => {
            const url = new URL(p, 'http://localhost')
            const date = url.searchParams.get('date')
            return `/fixtures?date=${date}`
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => { req.setHeader('x-apisports-key', API_KEY) })
          },
        },
        '/.netlify/functions/api-football-leagues': {
          target: API_BASE,
          changeOrigin: true,
          rewrite: () => '/leagues?current=true',
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => { req.setHeader('x-apisports-key', API_KEY) })
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
            proxy.on('proxyReq', (req) => { req.setHeader('x-apisports-key', API_KEY) })
          },
        },
      },
    },
  }
})
