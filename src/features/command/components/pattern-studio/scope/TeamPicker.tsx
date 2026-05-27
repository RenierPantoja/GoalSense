/**
 * TeamPicker — premium team picker with logos, league hint and selected summary
 * ─────────────────────────────────────────────────────────────────────────────
 * Mirror of LeaguePicker shape: search + filters + grid of cards with avatars
 * and a sticky "selected" summary. Quick filters: Todos / Em jogos atuais /
 * Biblioteca.
 */
import { useMemo, useState } from 'react'
import type { ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'
import { normalizeText } from '../../../utils/patternStudioHelpers'
import { EntityAvatar } from './EntityAvatar'
import { SCOPE_PALETTE, type ScopeMode } from './scopeShared'

type TeamFilter = 'all' | 'live' | 'library'

interface TeamPickerProps {
  options: ScopeKbTeam[]
  selected: string[]
  onChange: (v: string[]) => void
  mode?: ScopeMode
}

export function TeamPicker({ options, selected, onChange, mode = 'include' }: TeamPickerProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<TeamFilter>('all')

  const lookup = useMemo(() => {
    const m = new Map<string, ScopeKbTeam>()
    for (const o of options) m.set(normalizeText(o.name), o)
    return m
  }, [options])

  const isSelected = (name: string) => selected.some(s => normalizeText(s) === normalizeText(name))
  const toggle = (name: string) => {
    if (isSelected(name)) onChange(selected.filter(s => normalizeText(s) !== normalizeText(name)))
    else onChange([...selected, name])
  }
  const addManual = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed || isSelected(trimmed)) return
    onChange([...selected, trimmed])
    setQuery('')
  }
  const clearAll = () => onChange([])

  const filtered = useMemo(() => {
    const q = normalizeText(query)
    let list = options
    if (filter === 'live') list = list.filter(t => t.lastSeen > Date.now() - 24 * 3600_000)
    else if (filter === 'library') list = list.filter(t => t.lastSeen > 0 && t.lastSeen < Date.now() - 24 * 3600_000)
    if (q) list = list.filter(t => normalizeText(t.name).includes(q) || normalizeText(t.league || '').includes(q))
    return list.slice(0, 80)
  }, [options, query, filter])

  const noResultsButQuery = filtered.length === 0 && query.trim().length > 0
  const palette = SCOPE_PALETTE[mode]
  const headline = mode === 'exclude' ? 'Excluir times' : 'Selecionar times'
  const description = mode === 'exclude'
    ? 'Estes times serão ignorados mesmo que outras regras batam. Exclusões têm prioridade.'
    : 'Escolha quais clubes este radar pode acompanhar.'
  const countLabel = mode === 'exclude'
    ? `${selected.length} ${selected.length === 1 ? 'excluído' : 'excluídos'}`
    : `${selected.length} ${selected.length === 1 ? 'selecionado' : 'selecionados'}`
  const clearLabel = mode === 'exclude' ? 'Limpar exclusões' : 'Limpar'

  const filterTabs: { key: TeamFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'live', label: 'Em jogos atuais' },
    { key: 'library', label: 'Biblioteca' },
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
            {selected.map(name => {
              const meta = lookup.get(normalizeText(name))
              return (
                <span key={name} className={`inline-flex items-center gap-1.5 rounded-lg border pl-1 pr-2 py-1 ${palette.pill}`}>
                  <EntityAvatar src={meta?.logo} name={name} size={18} />
                  <span className={`text-[11px] font-medium max-w-[140px] truncate ${mode === 'exclude' ? 'text-rose-100/90' : 'text-white/90'}`}>{name}</span>
                  {!meta && <span className="text-[9px] uppercase tracking-wider text-amber-300/75 font-medium">manual</span>}
                  <button onClick={() => toggle(name)} type="button" aria-label={`Remover ${name}`} className="text-white/40 hover:text-rose-300 transition-colors -mr-0.5">×</button>
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
          placeholder={mode === 'exclude' ? 'Buscar time para excluir' : 'Buscar time ou clube'}
          className="flex-1 h-10 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3.5 text-[13px] text-white/90 placeholder:text-white/30 outline-none focus:border-white/30 focus:bg-white/[0.04] transition-colors"
          aria-label="Buscar time"
        />
        <div className="flex items-center gap-1">
          {filterTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              type="button"
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${filter === t.key ? 'bg-white/[0.06] text-white/95 border border-white/[0.12]' : 'text-white/55 hover:text-white/85 border border-transparent hover:bg-white/[0.025]'}`}
            >{t.label}</button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-4 max-h-[360px] overflow-y-auto sidebar-scroll grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filtered.map(t => {
          const sel = isSelected(t.name)
          const isCurrent = t.lastSeen > Date.now() - 24 * 3600_000
          return (
            <button
              key={t.id + t.name}
              onClick={() => toggle(t.name)}
              type="button"
              aria-pressed={sel}
              className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-200 ${sel ? palette.cardActive : 'border-white/[0.06] bg-white/[0.012] hover:border-white/[0.12] hover:bg-white/[0.022]'}`}
            >
              <EntityAvatar src={t.logo} name={t.name} size={30} />
              <div className="flex-1 min-w-0">
                <p className={`text-[12.5px] font-semibold truncate leading-tight ${sel && mode === 'exclude' ? 'text-rose-100/95' : 'text-white/90'}`}>{t.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-white/45">
                  {t.league ? <span className="truncate">{t.league}</span> : <span className="text-white/30">Clube</span>}
                </div>
              </div>
              {sel && <span className={`text-[9px] font-medium uppercase tracking-wider ${mode === 'exclude' ? 'text-rose-200/80' : 'text-white/55'}`}>{palette.statusActiveLabel}</span>}
              {!sel && isCurrent && <span className="text-[9px] font-medium uppercase tracking-wider text-white/45">Atual</span>}
              <span aria-hidden className={`shrink-0 h-4 w-4 rounded-full border transition-colors ${sel ? palette.radioOn : 'border-white/25 bg-transparent group-hover:border-white/45'}`} />
            </button>
          )
        })}
        {noResultsButQuery && (
          <div className="col-span-full rounded-xl border border-dashed border-white/[0.08] bg-white/[0.005] px-4 py-4 text-center">
            <p className="text-[12px] text-white/65">Nenhum time encontrado</p>
            <button onClick={() => addManual(query)} type="button" className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-colors ${palette.primaryActionTone}`}>
              {palette.addLabel(query.trim())}
            </button>
            <p className="text-[10.5px] text-white/35 mt-2 leading-snug">Será usado por correspondência de nome.</p>
          </div>
        )}
        {options.length === 0 && !noResultsButQuery && (
          <div className="col-span-full rounded-xl border border-dashed border-white/[0.08] bg-white/[0.005] px-4 py-5 text-center">
            <p className="text-[12px] text-white/65">Biblioteca vazia</p>
            <p className="text-[10.5px] text-white/40 mt-1 leading-snug">Abra partidas no Live Radar para alimentar a biblioteca, ou digite um clube manualmente acima.</p>
          </div>
        )}
      </div>
    </div>
  )
}
