/**
 * Pattern Studio shared helpers
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure utilities used by the Trigger Lab, the Scope Picker family and the
 * Inspector panel. No React (except `useMemo` consumers, which import this
 * file and call hooks themselves).
 */
import { useMemo } from 'react'
import type { ScopeKbLeague, ScopeKbMatch, ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'

// ─── Param clamp bounds for safe numeric input ──────────────────────────────
export const PARAM_CLAMP: Record<string, { min: number; max: number }> = {
  value: { min: 0, max: 50 },
  min: { min: 0, max: 120 },
  max: { min: 0, max: 120 },
  maxDiff: { min: 0, max: 10 },
  minutes: { min: 5, max: 240 },
}

export function clampParam(key: string, raw: number, bound?: { min: number; max: number }): number {
  const fallback = PARAM_CLAMP[key] || { min: 0, max: 999 }
  const b = bound || fallback
  if (Number.isNaN(raw)) return b.min
  return Math.max(b.min, Math.min(b.max, Math.round(raw)))
}

// ─── Text normalization (NFD strip-accents + lowercase + trim) ──────────────
export function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// ─── Match status / date helpers shared by MatchPicker and similar UIs ──────
export function matchStatusBadge(status?: string): { label: string; tone: string } | null {
  if (!status) return null
  if (status === 'LIVE' || status === '1H' || status === '2H' || status === 'HT') {
    return { label: status === 'HT' ? 'Intervalo' : 'Ao vivo', tone: 'bg-emerald-500/10 text-emerald-200/85 border-emerald-400/20' }
  }
  if (status === 'NS' || status === 'TBD') return { label: 'Agendada', tone: 'bg-white/[0.04] text-white/55 border-white/[0.07]' }
  if (status === 'FT' || status === 'AET' || status === 'PEN') return { label: 'Encerrada', tone: 'bg-white/[0.04] text-white/55 border-white/[0.07]' }
  if (status === 'PST' || status === 'CANC' || status === 'ABD') return { label: status, tone: 'bg-rose-500/10 text-rose-200/85 border-rose-400/15' }
  return { label: status, tone: 'bg-white/[0.04] text-white/55 border-white/[0.07]' }
}

export function matchDateLabel(date?: string): string | null {
  if (!date) return null
  const d = new Date(date)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Hoje · ${time}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · ${time}`
}

// ─── Lookup hook used by the Inspector for mini avatars in exclusions ───────
export function useScopeLookups(leagues: ScopeKbLeague[], teams: ScopeKbTeam[], matches: ScopeKbMatch[]) {
  return useMemo(() => {
    const leagueLookup = new Map<string, ScopeKbLeague>()
    for (const l of leagues) leagueLookup.set(normalizeText(l.name), l)
    const teamLookup = new Map<string, ScopeKbTeam>()
    for (const t of teams) teamLookup.set(normalizeText(t.name), t)
    const matchLookup = new Map<string, ScopeKbMatch>()
    for (const m of matches) matchLookup.set(m.canonicalMatchId, m)
    return { leagueLookup, teamLookup, matchLookup }
  }, [leagues, teams, matches])
}
