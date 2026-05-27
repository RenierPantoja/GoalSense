/**
 * MatchPicker — premium match cards with home/away crests, status, date
 * ─────────────────────────────────────────────────────────────────────────────
 * Restricts a radar to a list of canonical matches. Selected pills show home
 * + away avatars side by side. Quick filters by status / day window.
 */
import { useMemo, useState } from 'react'
import type { ScopeKbMatch } from '@/services/intelligence/scopeKnowledgeBase'
import { matchDateLabel, matchStatusBadge, normalizeText } from '../../../utils/patternStudioHelpers'
import { EntityAvatar } from './EntityAvatar'
import { SCOPE_PALETTE, type ScopeMode } from './scopeShared'

type MatchFilter = 'all' | 'live' | 'today' | 'soon' | 'finished'

interface MatchPickerProps {
  options: ScopeKbMatch[]
  selected: string[]
  onChange: (v: string[]) => void
  mode?: ScopeMode
}

export function MatchPicker({ options, selected, onChange, mode = 'include' }: MatchPickerProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MatchFilter>('all')

  const lookup = useMemo(() => {
    const m = new Map<string, ScopeKbMatch>()
    for (const o of options) m.set(o.canonicalMatchId, o)
    return m
  }, [options])

  const isSelected = (id: string) => selected.includes(id)
  const toggle = (id: string) => {
    if (isSelected(id)) onChange(selected.filter(s => s !== id))
    else onChange([...selected, id])
  }
  const addManual = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed || selected.includes(trimmed)) return
    onChange([...selected, trimmed])
    setQuery('')
  }
  const clearAll = () => onChange([])

  const filtered = useMemo(() => {
    const q = normalizeText(query)
    let list = options
    if (filter === 'live') list = list.filter(m => m.status === 'LIVE' || m.status === '1H' || m.status === '2H' || m.status === 'HT')
    else if (filter === 'finished') list = list.filter(m => m.status === 'FT' || m.status === 'AET' || m.status === 'PEN')
    else if (filter === 'today' || filter === 'soon') {
      const now = Date.now()
      list = list.filter(m => {
        if (!m.date) return false
        const d = new Date(m.date).getTime()
        if (isNaN(d)) return false
        if (filter === 'today') return new Date(d).toDateString() === new Date(now).toDateString()
        return d > now && d - now < 6 * 3600_000
      })
    }
    if (q) list = list.filter(m => normalizeText(`${m.homeTeam} ${m.awayTeam} ${m.league || ''}`).includes(q))
    return list.slice(0, 80)
  }, [options, query, filter])

  const noResultsButQuery = filtered.length === 0 && query.trim().length > 0
  const palette = SCOPE_PALETTE[mode]
  const headline = mode === 'exclude' ? 'Excluir partidas' : 'Selecionar partidas'
  const description = mode === 'exclude'
    ? 'Estas partidas serão ignoradas mesmo que outras regras batam. Exclusões têm prioridade.'
    : 'Restrinja este radar a uma ou mais partidas individuais.'
  const countLabel = mode === 'exclude'
    ? `${selected.length} ${selected.length === 1 ? 'excluída' : 'excluídas'}`
    : `${selected.length} ${selected.length === 1 ? 'selecionada' : 'selecionadas'}`
  const clearLabel = mode === 'exclude' ? 'Limpar exclusões' : 'Limpar'

  const filterTabs: { key: MatchFilter; label: string }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'live', label: 'Ao vivo' },
    { key: 'soon', label: 'Em breve' },
    { key: 'today', label: 'Hoje' },
    { key: 'finished', label: 'Encerradas' },
  ]

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.008] overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{headline}</span>
          <span className="text-[11px] text-white/55">{countLabel}</span>
          <span className="ml-auto text-[10px] text-white/35">{options.length} disponíveis</span>
        </div>
        <p className="text-[11.5px] text-white/50 leading-snug">{description}</p>
        {selected.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {selected.map(id => {
              const meta = lookup.get(id)
              const label = meta ? `${meta.homeTeam} × ${meta.awayTeam}` : id
              return (
                <span key={id} className={`inline-flex items-center gap-1.5 rounded-lg border pl-1 pr-2 py-1 ${palette.pill}`}>
                  {meta && <span className="flex items-center"><EntityAvatar src={meta.homeLogo} name={meta.homeTeam} size={14} /><EntityAvatar src={meta.awayLogo} name={meta.awayTeam} size={14} /></span>}
                  <span className={`text-[11px] font-medium max-w-[200px] truncate ${mode === 'exclude' ? 'text-rose-100/90' : 'text-white/90'}`}>{label}</span>
                  {!meta && <span className="text-[9px] uppercase tracking-wider text-amber-300/75 font-medium">manual</span>}
                  <button onClick={() => toggle(id)} type="button" aria-label={`Remover ${label}`} className="text-white/40 hover:text-rose-300 transition-colors -mr-0.5">×</button>
                </span>
              )
            })}
            <button onClick={clearAll} type="button" className="ml-auto text-[10px] uppercase tracking-wider font-semibold text-white/45 hover:text-white/85 transition-colors">{clearLabel}</button>
          </div>
        )}
      </div>
      <div className="px-4 py-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManual(query) } }}
          placeholder={mode === 'exclude' ? 'Buscar partida para excluir' : 'Buscar por time, liga ou Home x Away'}
          className="flex-1 h-10 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3.5 text-[13px] text-white/90 placeholder:text-white/30 outline-none focus:border-white/30 focus:bg-white/[0.04] transition-colors"
          aria-label="Buscar partida"
        />
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
          {filterTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              type="button"
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${filter === t.key ? 'bg-white/[0.06] text-white/95 border border-white/[0.12]' : 'text-white/55 hover:text-white/85 border border-transparent hover:bg-white/[0.025]'}`}
            >{t.label}</button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-4 max-h-[420px] overflow-y-auto sidebar-scroll space-y-2">
        {filtered.map(m => {
          const sel = isSelected(m.canonicalMatchId)
          const status = matchStatusBadge(m.status)
          const date = matchDateLabel(m.date)
          return (
            <button
              key={m.canonicalMatchId}
              onClick={() => toggle(m.canonicalMatchId)}
              type="button"
              aria-pressed={sel}
              className={`group w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors duration-200 ${sel ? palette.cardActive : 'border-white/[0.06] bg-white/[0.012] hover:border-white/[0.12] hover:bg-white/[0.022]'}`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <EntityAvatar src={m.homeLogo} name={m.homeTeam} size={26} />
                <span className={`text-[12.5px] font-semibold truncate min-w-0 flex-1 ${sel && mode === 'exclude' ? 'text-rose-100/95' : 'text-white/90'}`}>{m.homeTeam}</span>
                <span className="text-[10px] text-white/30 font-medium tabular-nums">×</span>
                <span className={`text-[12.5px] font-semibold truncate min-w-0 flex-1 ${sel && mode === 'exclude' ? 'text-rose-100/95' : 'text-white/90'}`}>{m.awayTeam}</span>
                <EntityAvatar src={m.awayLogo} name={m.awayTeam} size={26} />
              </div>
              <div className="hidden sm:flex flex-col items-end shrink-0 gap-0.5 ml-2">
                {m.league && <span className="text-[10.5px] text-white/45 truncate max-w-[140px]">{m.league}</span>}
                <div className="flex items-center gap-1.5">
                  {sel && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${mode === 'exclude' ? 'bg-rose-500/[0.08] text-rose-200/85 border-rose-300/20' : 'bg-white/[0.06] text-white/85 border-white/[0.1]'}`}>{palette.statusActiveLabel}</span>}
                  {!sel && status && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${status.tone}`}>{status.label}</span>}
                  {date && <span className="text-[10px] text-white/40 tabular-nums">{date}</span>}
                </div>
              </div>
              <span aria-hidden className={`shrink-0 h-4 w-4 rounded-full border transition-colors ${sel ? palette.radioOn : 'border-white/25 bg-transparent group-hover:border-white/45'}`} />
            </button>
          )
        })}
        {noResultsButQuery && (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.005] px-4 py-4 text-center">
            <p className="text-[12px] text-white/65">Nenhuma partida encontrada</p>
            <button onClick={() => addManual(query)} type="button" className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-colors ${palette.primaryActionTone}`}>
              {palette.addLabelMatch(query.trim())}
            </button>
            <p className="text-[10.5px] text-white/35 mt-2 leading-snug">Será usada por correspondência textual.</p>
          </div>
        )}
        {options.length === 0 && !noResultsButQuery && (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.005] px-4 py-5 text-center">
            <p className="text-[12px] text-white/65">Biblioteca vazia</p>
            <p className="text-[10.5px] text-white/40 mt-1 leading-snug">Abra partidas no Live Radar ou em Partidas para alimentar a biblioteca, ou digite uma partida manualmente acima.</p>
          </div>
        )}
      </div>
    </div>
  )
}
