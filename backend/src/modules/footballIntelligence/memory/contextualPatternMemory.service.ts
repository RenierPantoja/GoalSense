/**
 * Contextual Pattern Memory (B45 / Bloco 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Remembers how each PATTERN behaved under each CONTEXT (knockout, high-importance,
 * late game, etc.) from internal observations. confirmed/confirmed_partial/failed/
 * unknown/not_evaluable kept distinct: confirmed_partial = partial-useful; unknown &
 * not_evaluable are NEVER failures. Small samples never conclude; misleading samples
 * are flagged stay-out. No prediction, only observed behavior with sample discipline.
 */
import { createRepositories } from '../../../repositories/index.js'
import { env } from '../../../env.js'
import { evaluatePatternContextQuality } from './memorySampleQuality.service.js'
import type { HistoricalPatternContextProfile, MemoryOrigin } from './fundamentalMemory.types.js'

function norm(s: string): string { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() }
function recencyDays(): number { return Number(env.HISTORICAL_MEMORY_RECENCY_DAYS ?? 730) }

const CONTEXTS: Array<{ key: string; label: string; test: (e: any) => boolean }> = [
  { key: 'knockout', label: 'Mata-mata', test: e => e?.matchContext?.isKnockout === true },
  { key: 'high_importance', label: 'Alta importância', test: e => ['high', 'critical'].includes(e?.matchContext?.importanceLevel) },
  { key: 'late_game', label: 'Fim de jogo (75\'+)', test: e => Number(e?.minute ?? e?.matchContext?.minute ?? 0) >= 75 },
  { key: 'first_half', label: 'Primeiro tempo', test: e => Number(e?.minute ?? e?.matchContext?.minute ?? 99) < 45 },
  { key: 'high_volatility', label: 'Alta volatilidade', test: e => e?.matchContext?.volatilityRisk === 'high' },
]

interface Cell { patternKey: string; patternName: string; contextKey: string; contextLabel: string; c: number; cp: number; f: number; u: number; ne: number; recent: number }

async function loadCells(filter?: (e: any) => boolean): Promise<Map<string, Cell>> {
  const repos = createRepositories()
  let ledger: any[] = []
  let outcomes: any[] = []
  try { ledger = await repos.intelligence.listAllSignalLedgerEntries(3000) } catch { /* noop */ }
  try { outcomes = await repos.intelligence.listAllAlertOutcomes(3000) } catch { /* noop */ }
  const ledgerByAlert = new Map<string, any>()
  for (const e of ledger) if (e.alertId) ledgerByAlert.set(e.alertId, e)

  const now = Date.now()
  const windowMs = recencyDays() * 86400000
  const cells = new Map<string, Cell>()

  for (const o of outcomes) {
    const e = o.alertId ? ledgerByAlert.get(o.alertId) : null
    if (!e) continue
    if (filter && !filter(e)) continue
    const patternKey = e.patternId || e.patternKey || 'unknown'
    const patternName = e.patternName || patternKey
    const recent = (() => { const t = new Date(o.resolvedAt || o.createdAt || e.createdAt).getTime(); return Number.isFinite(t) && (now - t) <= windowMs ? 1 : 0 })()
    for (const ctx of CONTEXTS) {
      if (!ctx.test(e)) continue
      const key = `${patternKey}__${ctx.key}`
      if (!cells.has(key)) cells.set(key, { patternKey, patternName, contextKey: ctx.key, contextLabel: ctx.label, c: 0, cp: 0, f: 0, u: 0, ne: 0, recent: 0 })
      const cell = cells.get(key)!
      switch (o.result) {
        case 'confirmed': cell.c++; break
        case 'confirmed_partial': cell.cp++; break
        case 'failed': cell.f++; break
        case 'unknown': case 'expired': cell.u++; break
        default: cell.ne++; break
      }
      cell.recent += recent
    }
  }
  return cells
}

function toProfile(cell: Cell): HistoricalPatternContextProfile {
  const sample = evaluatePatternContextQuality({ confirmed: cell.c, confirmedPartial: cell.cp, failed: cell.f, unknown: cell.u, notEvaluable: cell.ne, recentSample: cell.recent })
  const evaluable = cell.c + cell.cp + cell.f
  let classification: HistoricalPatternContextProfile['classification']
  let recommendation: HistoricalPatternContextProfile['recommendation']
  if (evaluable === 0) { classification = 'not_evaluable'; recommendation = 'insufficient' }
  else if (sample.quality === 'weak' || sample.quality === 'insufficient') { classification = 'not_enough_data'; recommendation = 'monitor_only' }
  else if (sample.quality === 'misleading_risk') { classification = 'mixed'; recommendation = 'use_with_caution' }
  else if (cell.f > cell.c + cell.cp && sample.quality === 'strong') { classification = 'failed_context'; recommendation = 'stay_out' }
  else if (cell.c >= cell.cp + cell.f && sample.quality === 'strong') { classification = 'confirmed_strong'; recommendation = 'use_with_confidence' }
  else if (cell.cp > 0 && cell.cp + cell.c > cell.f) { classification = 'confirmed_partial_useful'; recommendation = 'use_with_caution' }
  else { classification = 'mixed'; recommendation = 'use_with_caution' }

  return {
    id: `hpc_${cell.patternKey}__${cell.contextKey}`,
    patternKey: cell.patternKey, patternName: cell.patternName,
    contextKey: cell.contextKey, contextLabel: cell.contextLabel,
    builtAt: new Date().toISOString(),
    sample,
    confirmed: cell.c, confirmedPartial: cell.cp, failed: cell.f, unknown: cell.u, notEvaluable: cell.ne,
    classification, recommendation,
    note: classification === 'not_evaluable' ? 'Apenas unknown/not_evaluable — não avaliável (≠ falha).' : 'Comportamento padrão×contexto observacional; amostra pequena não conclui.',
    limitations: ['confirmed_partial = parcial-útil; unknown/not_evaluable ≠ falha; amostra pequena não conclui.'],
    source: 'goalsense_internal_memory' as MemoryOrigin,
  }
}

export async function buildPatternContextProfile(patternKey?: string, contextKey?: string): Promise<HistoricalPatternContextProfile[]> {
  const cells = await loadCells()
  let profiles = [...cells.values()].map(toProfile)
  if (patternKey) profiles = profiles.filter(p => p.patternKey === patternKey)
  if (contextKey) profiles = profiles.filter(p => p.contextKey === contextKey)
  return profiles.sort((a, b) => (b.confirmed + b.failed) - (a.confirmed + a.failed)).slice(0, 60)
}

export async function getPatternMemoryForTeam(teamId: string): Promise<HistoricalPatternContextProfile[]> {
  const target = norm(teamId)
  const cells = await loadCells(e => norm(e.homeTeam) === target || norm(e.awayTeam) === target)
  return [...cells.values()].map(toProfile).sort((a, b) => (b.confirmed + b.failed) - (a.confirmed + a.failed)).slice(0, 40)
}

export async function getPatternMemoryForFixture(fixtureId: string): Promise<HistoricalPatternContextProfile[]> {
  const repos = createRepositories()
  const fixture = await repos.fixtures.findById(fixtureId).catch(() => null)
  if (!fixture) return []
  const home = norm(fixture.homeName || '')
  const away = norm(fixture.awayName || '')
  const cells = await loadCells(e => [home, away].includes(norm(e.homeTeam)) || [home, away].includes(norm(e.awayTeam)))
  return [...cells.values()].map(toProfile)
}

export async function findStrongContexts(): Promise<HistoricalPatternContextProfile[]> {
  return (await buildPatternContextProfile()).filter(p => p.classification === 'confirmed_strong')
}

export async function findStayOutContexts(): Promise<HistoricalPatternContextProfile[]> {
  return (await buildPatternContextProfile()).filter(p => p.recommendation === 'stay_out')
}

export async function findMisleadingContexts(): Promise<HistoricalPatternContextProfile[]> {
  return (await buildPatternContextProfile()).filter(p => p.sample.quality === 'misleading_risk')
}

export async function explainPatternContext(patternKey: string, contextKey: string): Promise<string> {
  const list = await buildPatternContextProfile(patternKey, contextKey)
  if (list.length === 0) return `Sem memória de ${patternKey} no contexto ${contextKey} (not_enough_data).`
  const p = list[0]
  return `${p.patternName} em ${p.contextLabel}: ${p.confirmed}c/${p.confirmedPartial}cp/${p.failed}f (${p.sample.quality}) → ${p.recommendation}.`
}
