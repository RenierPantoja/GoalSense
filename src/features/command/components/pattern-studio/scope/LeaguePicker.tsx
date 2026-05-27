/**
 * LeaguePicker — premium league picker with cards, search and selected summary
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure presentational component. Behaves identically in include/exclude modes;
 * only the visual palette and copy change via SCOPE_PALETTE.
 */
import { useMemo, useState } from 'react'
import type { ScopeKbLeague } from '@/services/intelligence/scopeKnowledgeBase'
import { normalizeText } from '../../../utils/patternStudioHelpers'
import { EntityAvatar } from './EntityAvatar'
import { SCOPE_PALETTE, type ScopeMode } from './scopeShared'

interface LeaguePickerProps {
  options: ScopeKbLeague[]
  selected: string[]
  onChange: (v: string[]) => void
  mode?: ScopeMode
}

export function LeaguePicker({ options, selected, onChange, mode = 'include' }: LeaguePickerProps) {
  const [query, setQuery] = useState('')
  // Index for selected pills so they render with logos even if the list is huge.
  const lookup = useMemo(() => {
    const m = new Map<string, ScopeKbLeague>()
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
    if (!q) return options.slice(0, 60)
    return options.filter(o => normalizeText(o.name).includes(q) || normalizeText(o.country || '').includes(q)).slice(0, 60)
  }, [options, query])

  const noResultsButQuery = filtered.length === 0 && query.trim().length > 0
  const palette = SCOPE_PALETTE[mode]
  const headline = mode === 'exclude' ? 'Excluir ligas' : 'Selecionar ligas'
  const description = mode === 'exclude'
    ? 'Estas ligas serão ignoradas mesmo que outras regras batam. Exclusões têm prioridade.'
    : 'Escolha em quais competições este radar pode atuar. As ligas atuais aparecem primeiro.'
  const countLabel = mode === 'exclude'
    ? `${selected.length} ${selected.length === 1 ? 'excluída' : 'excluídas'}`
    : `${selected.length} ${selected.length === 1 ? 'selecionada' : 'selecionadas'}`
  const clearLabel = mode === 'exclude' ? 'Limpar exclusões' : 'Limpar'

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
                <span key={name} className={`inline-flex items-center gap-1.5 rounded-lg border pl-1.5 pr-2 py-1 ${palette.pill}`}>
                  <EntityAvatar src={meta?.logo} name={name} size={16} square />
                  <span className={`text-[11px] font-medium max-w-[160px] truncate ${mode === 'exclude' ? 'text-rose-100/90' : 'text-white/90'}`}>{name}</span>
                  {!meta && <span className="text-[9px] uppercase tracking-wider text-amber-300/75 font-medium">manual</span>}
                  <button onClick={() => toggle(name)} type="button" aria-label={`Remover ${name}`} className="text-white/40 hover:text-rose-300 transition-colors -mr-0.5">×</button>
                </span>
              )
            })}
            <button onClick={clearAll} type="button" className="ml-auto text-[10px] uppercase tracking-wider font-semibold text-white/45 hover:text-white/85 transition-colors">{clearLabel}</button>
          </div>
        )}
      </div>
      <div className="px-4 py-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManual(query) } }}
          placeholder={mode === 'exclude' ? 'Buscar liga para excluir' : 'Buscar liga ou país'}
          className="w-full h-10 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3.5 text-[13px] text-white/90 placeholder:text-white/30 outline-none focus:border-white/30 focus:bg-white/[0.04] transition-colors"
          aria-label="Buscar liga"
        />
      </div>
      <div className="px-4 pb-4 max-h-[320px] overflow-y-auto sidebar-scroll grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filtered.map(l => {
          const sel = isSelected(l.name)
          const isLive = l.lastSeen > 0
          return (
            <button
              key={l.id + l.name}
              onClick={() => toggle(l.name)}
              type="button"
              aria-pressed={sel}
              className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-200 ${sel ? palette.cardActive : 'border-white/[0.06] bg-white/[0.012] hover:border-white/[0.12] hover:bg-white/[0.022]'}`}
            >
              <EntityAvatar src={l.logo} name={l.name} size={32} square />
              <div className="flex-1 min-w-0">
                <p className={`text-[12.5px] font-semibold truncate leading-tight ${sel && mode === 'exclude' ? 'text-rose-100/95' : 'text-white/90'}`}>{l.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-white/45">
                  {l.country && <span className="truncate">{l.country}</span>}
                  {l.country && l.season && <span className="text-white/20">·</span>}
                  {l.season && <span className="tabular-nums">{l.season}</span>}
                  {!l.country && !l.season && <span className="text-white/30">Liga</span>}
                </div>
              </div>
              {sel && <span className={`text-[9px] font-medium uppercase tracking-wider ${mode === 'exclude' ? 'text-rose-200/80' : 'text-white/55'}`}>{palette.statusActiveLabel}</span>}
              {!sel && isLive && <span className="text-[9px] font-medium uppercase tracking-wider text-white/45">Atual</span>}
              <span aria-hidden className={`shrink-0 h-4 w-4 rounded-full border transition-colors ${sel ? palette.radioOn : 'border-white/25 bg-transparent group-hover:border-white/45'}`} />
            </button>
          )
        })}
        {noResultsButQuery && (
          <div className="col-span-full rounded-xl border border-dashed border-white/[0.08] bg-white/[0.005] px-4 py-4 text-center">
            <p className="text-[12px] text-white/65">Nenhuma liga encontrada</p>
            <button onClick={() => addManual(query)} type="button" className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-colors ${palette.primaryActionTone}`}>
              {palette.addLabel(query.trim())}
            </button>
            <p className="text-[10.5px] text-white/35 mt-2 leading-snug">Será usado por correspondência de nome.</p>
          </div>
        )}
        {options.length === 0 && !noResultsButQuery && (
          <div className="col-span-full rounded-xl border border-dashed border-white/[0.08] bg-white/[0.005] px-4 py-5 text-center">
            <p className="text-[12px] text-white/65">Biblioteca vazia</p>
            <p className="text-[10.5px] text-white/40 mt-1 leading-snug">Abra partidas no Live Radar para alimentar a biblioteca, ou digite uma liga manualmente acima.</p>
          </div>
        )}
      </div>
    </div>
  )
}
