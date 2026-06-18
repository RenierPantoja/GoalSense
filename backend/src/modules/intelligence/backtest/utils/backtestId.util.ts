/**
 * Deterministic-ish ids for backtest/replay runs (Phase B14).
 * ─────────────────────────────────────────────────────────────────────────────
 * Replay ids are deterministic per (pattern, fixture) so re-running overwrites
 * rather than duplicates. Backtest run ids are time-ordered (each run is a new
 * measurement). Signal-result ids are deterministic per (run, fixture).
 */
function slug(s: string): string {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
}

export function backtestRunId(): string {
  return `bt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function replayRunId(patternId: string, fixtureId: string): string {
  return `rp_${slug(patternId)}__${slug(fixtureId)}`
}

export function backtestSignalResultId(runId: string, fixtureId: string): string {
  return `bsr_${slug(runId)}__${slug(fixtureId)}`
}
