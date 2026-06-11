/**
 * Prisma → Firebase migration — DRY-RUN ONLY (Phase E7).
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads Prisma/Postgres (only if DATABASE_URL is set), validates record shapes,
 * counts rows per model, and reports id conflicts / invalid data. It does NOT
 * write to Firebase in this phase — real writes are intentionally not enabled.
 *
 * Usage:
 *   node scripts/migratePrismaToFirebase.mjs            # dry-run report
 *   node scripts/migratePrismaToFirebase.mjs --confirm  # still dry-run; real write is NOT implemented yet
 *
 * Requires (for reading): DATABASE_URL set and `npm run db:generate` already run.
 * If DATABASE_URL is absent, the script prints guidance and exits cleanly.
 */
import 'dotenv/config'
import { parseFlags } from './_firebase.mjs'

const flags = parseFlags(process.argv)

const MODELS = [
  { name: 'pattern', collection: 'patterns' },
  { name: 'alert', collection: 'alerts' },
  { name: 'alertResolution', collection: 'alertResolutions' },
  { name: 'fixture', collection: 'fixtures' },
  { name: 'liveSnapshot', collection: 'liveSnapshots' },
  { name: 'telegramChannel', collection: 'telegramChannels' },
  { name: 'signalDelivery', collection: 'signalDeliveries' },
  { name: 'oddsSnapshot', collection: 'oddsSnapshots' },
  { name: 'alertOddsContext', collection: 'alertOddsContexts' },
]

async function main() {
  console.log('\n=== Prisma → Firebase Migration (DRY-RUN) ===\n')

  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL is not set.')
    console.log('Nothing to read from Prisma/Postgres. This is expected for a clean Firebase start.')
    console.log('To inspect a Prisma DB: set DATABASE_URL, run `npm run db:generate`, then re-run this script.\n')
    console.log('Recommendation: for initial production, prefer a CLEAN Firebase start or a SELECTIVE')
    console.log('migration of important patterns + alert history only. Do NOT migrate QA/garbage data.\n')
    return
  }

  let PrismaClient
  try {
    ({ PrismaClient } = await import('@prisma/client'))
  } catch {
    console.log('@prisma/client not available. Run `npm run db:generate` first.\n')
    return
  }

  const prisma = new PrismaClient()
  try {
    console.log('Counts per model (read-only):\n')
    const idConflicts = []
    for (const m of MODELS) {
      let count = 0
      try { count = await prisma[m.name].count() } catch (e) { console.log(`  ${m.name}: <unavailable: ${e.message}>`); continue }
      console.log(`  ${m.name.padEnd(18)} → ${String(count).padStart(6)} rows  (→ Firestore '${m.collection}')`)
    }

    // Shape validation sample (first few patterns/alerts) — never writes.
    const samplePatterns = await prisma.pattern.findMany({ take: 3 })
    for (const p of samplePatterns) {
      if (!p.name) idConflicts.push(`pattern ${p.id} has empty name`)
      if (typeof p.conditionsJson !== 'string') idConflicts.push(`pattern ${p.id} conditionsJson not a string`)
    }
    const sampleAlerts = await prisma.alert.findMany({ take: 3 })
    for (const a of sampleAlerts) {
      if (typeof a.confidence !== 'number') idConflicts.push(`alert ${a.id} confidence not a number`)
    }

    console.log('\nValidation notes:')
    if (idConflicts.length === 0) console.log('  no shape issues found in sampled rows.')
    else idConflicts.forEach(c => console.log(`  ⚠️  ${c}`))

    console.log('\nNOTE: real writes to Firebase are NOT implemented in this phase (E7).')
    if (flags.confirm) console.log('--confirm acknowledged, but writing is intentionally disabled until the migration plan is approved.')
    console.log('See docs/FIREBASE_DATA_MIGRATION_PLAN.md.\n')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => { console.error('Migration dry-run failed:', err.message); process.exit(1) })
