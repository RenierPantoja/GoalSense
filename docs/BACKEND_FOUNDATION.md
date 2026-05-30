# Backend Foundation

## Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| Runtime | Node.js + Fastify | Fast, TypeScript native, lightweight |
| ORM | Prisma | Type-safe, migrations, PostgreSQL support |
| Database | PostgreSQL | Relational, reliable, free tier on Supabase/Railway |
| Validation | Zod | Already used in frontend, consistent |
| Deploy | Railway / Render / Fly.io | Simple, cheap, auto-deploy from Git |

## Structure

```
backend/
├── package.json
├── tsconfig.json
├── .env.example
├── prisma/
│   └── schema.prisma
└── src/
    ├── server.ts          # Fastify app entry
    ├── env.ts             # Zod-validated environment
    ├── db/
    │   └── client.ts      # Prisma client
    └── routes/
        └── health.routes.ts
```

## Database Schema

| Table | Purpose |
|-------|---------|
| Pattern | User-configured radar patterns |
| Fixture | Canonical match records |
| LiveSnapshot | Point-in-time match state (for history/backtest) |
| Alert | Triggered signals with evidence |
| AlertResolution | How alerts were resolved |
| PatternPerformance | Aggregated pattern metrics |
| ProviderHealth | Provider status tracking |
| AuditLog | Action audit trail |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| APP_ENV | No | development / production / test |
| PORT | No | Server port (default: 4000) |
| CORS_ORIGIN | No | Allowed origins (comma-separated) |
| API_FOOTBALL_KEY | No | For live monitoring worker |
| FOOTBALL_DATA_KEY | No | For live monitoring worker |

## Getting Started

```bash
cd backend
npm install
cp .env.example .env
# Fill in DATABASE_URL
npx prisma generate
npx prisma db push
npm run dev
# → http://localhost:4000/api/health
```

## Frontend Integration Strategy

| Phase | Action | Risk |
|-------|--------|------|
| B1 | Backend boots, health check works | None |
| B2 | Frontend reads backend status | Low |
| B3 | Patterns can be saved to backend (localStorage fallback) | Low |
| B4 | Alerts persist in backend | Medium |
| B5 | Performance uses backend history | Medium |

**Rule**: localStorage continues working until backend is proven stable. No breaking changes to frontend.

## Auth (Temporary)

Single-user mode with `userId = "default"` until auth is implemented. All tables have `userId` field ready for multi-user.

## What This Phase Does NOT Include

- Live monitoring worker (skeleton only)
- Telegram delivery
- Odds integration
- Multi-user auth
- Production deployment
- Frontend migration

## Next Steps

1. Set up PostgreSQL (Supabase free tier recommended)
2. Run `prisma db push` to create tables
3. Verify `/api/health` responds
4. Add patterns CRUD routes
5. Add alerts CRUD routes
6. Create live monitoring worker skeleton
