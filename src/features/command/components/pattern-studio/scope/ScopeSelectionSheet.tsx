/**
 * ScopeSelectionSheet — Radar Blueprint 3.4 dedicated scope selection sheet
 * ─────────────────────────────────────────────────────────────────────────────
 * Premium 3-column scope picker (modes · searchable results · selected) that
 * replaces the inline ScopePicker inside the Rule Studio. Works on a temporary
 * snapshot: "Aplicar escopo" commits, "Cancelar"/ESC discards. Long lists never
 * touch the canvas. Advanced filters (state flags + exclusions) live in a
 * full-width disclosure that reuses the existing tested pickers.
 */
import { useMemo, useState } from 'react'
import { Search, X, Check } from 'lucide-react'
import type { PatternScope } from '../../../types/commandTypes'
import type { ScopeKbLeague, ScopeKbMatch, ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'
import { SheetShell } from '../canvas/SheetShell'
import { ToggleSettingRow } from '../shell/ToggleSettingRow'
import { LeaguePicker } from './LeaguePicker'
import { TeamPicker } from './TeamPicker'
import { MatchPicker } from './MatchPicker'

export interface ScopeSelectionValue {
  scope: PatternScope
  scopeFilter: string[]
  matches: string[]
  excludeLeagues: string[]
  excludeTeams: string[]
  excludeMatches: string[]
  requireRichData: boolean
  onlyLive: boolean
  onlyPreMatch: boolean
}

interface ScopeSelectionSheetProps extends ScopeSelectionValue {
  availableMatches: ScopeKbMatch[]
  availableLeaguesRich: ScopeKbLeague[]
  availableTeamsRich: ScopeKbTeam[]
  onApply: (next: ScopeSelectionValue) => void
  onClose: () => void
}

const MODES: { v: PatternScope; label: string; hint: string }[] = [
  { v: 'all', label: 'Todos os jogos', hint: 'Qualquer partida disponível' },
  { v: 'favorites_only', label: 'Favoritos', hint: 'Apenas times favoritos' },
  { v: 'specific_leagues', label: 'Ligas', hint: 'Uma ou mais ligas' },
  { v: 'specific_teams', label: 'Times', hint: 'Um ou mais times' },
  { v: 'specific_matches', label: 'Partidas', hint: 'Partidas específicas' },
]

export function ScopeSelectionSheet(props: ScopeSelectionSheetProps) {
  const [scope, setScope] = useState<PatternScope>(props.scope)
  const [scopeFilter, setScopeFilter] = useState<string[]>(props.scopeFilter)
  const [matches, setMatches] = useState<string[]>(props.matches)
  const [excludeLeagues, setExcludeLeagues] = useState<string[]>(props.excludeLeagues)
  const [excludeTeams, setExcludeTeams] = useState<string[]>(props.excludeTeams)
  const [excludeMatches, setExcludeMatches] = useState<string[]>(props.excludeMatches)
  const [requireRichData, setRequireRichData] = useState(props.requireRichData)
  const [onlyLive, setOnlyLive] = useState(props.onlyLive)
  const [onlyPreMatch, setOnlyPreMatch] = useState(props.onlyPreMatch)
  const [query, setQuery] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(
    props.excludeLeagues.length > 0 || props.excludeTeams.length > 0 || props.excludeMatches.length > 0 || props.requireRichData || props.onlyLive || props.onlyPreMatch,
  )

  const apply = () => {
    props.onApply({ scope, scopeFilter, matches, excludeLeagues, excludeTeams, excludeMatches, requireRichData, onlyLive, onlyPreMatch })
    props.onClose()
  }

  const isList = scope === 'specific_leagues' || scope === 'specific_teams' || scope === 'specific_matches'
  const q = query.trim().toLowerCase()

  const leagueRows = useMemo(() => props.availableLeaguesRich.filter(l => !q || l.name.toLowerCase().includes(q)), [props.availableLeaguesRich, q])
  const teamRows = useMemo(() => props.availableTeamsRich.filter(t => !q || t.name.toLowerCase().includes(q)), [props.availableTeamsRich, q])
  const matchRows = useMemo(() => props.availableMatches.filter(m => !q || `${m.homeTeam} ${m.awayTeam} ${m.league || ''}`.toLowerCase().includes(q)), [props.availableMatches, q])

  const toggle = (arr: string[], set: (a: string[]) => void, key: string) => set(arr.includes(key) ? arr.filter(x => x !== key) : [...arr, key])

  const selected = scope === 'specific_matches' ? matches : (scope === 'specific_leagues' || scope === 'specific_teams') ? scopeFilter : []
  const selectedLabels = scope === 'specific_matches'
    ? matches.map(id => { const m = props.availableMatches.find(x => x.canonicalMatchId === id); return { id, label: m ? `${m.homeTeam} × ${m.awayTeam}` : id } })
    : selected.map(s => ({ id: s, label: s }))

  const removeSelected = (id: string) => {
    if (scope === 'specific_matches') setMatches(matches.filter(x => x !== id))
    else setScopeFilter(scopeFilter.filter(x => x !== id))
  }

  const Row = ({ active, logo, square, title, sub, onClick }: { active: boolean; logo?: string | null; square?: boolean; title: string; sub?: string; onClick: () => void }) => (
    <button type="button" onClick={onClick} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-colors ${active ? 'border-cyan-400/30 bg-cyan-500/[0.07]' : 'border-transparent hover:bg-white/[0.03]'}`}>
      {logo ? <img src={logo} alt="" className={`h-5 w-5 object-contain shrink-0 ${square ? '' : 'rounded-full'}`} /> : <span className="h-5 w-5 rounded-full bg-white/[0.06] shrink-0" />}
      <span className="min-w-0 flex-1"><span className="block text-[12px] text-white/85 truncate">{title}</span>{sub && <span className="block text-[10px] text-white/40 truncate">{sub}</span>}</span>
      {active && <Check size={13} className="text-cyan-300 shrink-0" />}
    </button>
  )

  return (
    <SheetShell
      title="Onde monitorar"
      subtitle="Escolha o universo de partidas que este radar pode avaliar"
      onClose={props.onClose}
      footer={<>
        <button onClick={props.onClose} type="button" className="px-4 py-2 rounded-lg text-[12px] font-medium text-white/65 border border-white/[0.08] hover:text-white/90 hover:border-white/[0.14] transition-colors">Cancelar</button>
        <button onClick={apply} type="button" className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white bg-white/[0.12] border border-white/[0.18] hover:bg-white/[0.18] transition-colors">Aplicar escopo</button>
      </>}
    >
      <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)_220px] gap-3 min-h-[300px]">
        {/* Left: modes */}
        <div className="space-y-1">
          {MODES.map(m => (
            <button key={m.v} type="button" onClick={() => setScope(m.v)} aria-pressed={scope === m.v} className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${scope === m.v ? 'border-white/[0.16] bg-white/[0.05]' : 'border-transparent hover:bg-white/[0.025]'}`}>
              <span className={`block text-[12.5px] font-medium ${scope === m.v ? 'text-white/95' : 'text-white/70'}`}>{m.label}</span>
              <span className="block text-[10px] text-white/40 leading-tight mt-0.5">{m.hint}</span>
            </button>
          ))}
        </div>

        {/* Center: results */}
        <div className="min-w-0 flex flex-col">
          {!isList ? (
            <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-white/[0.08] px-6 py-10 text-center">
              <p className="text-[12px] text-white/50 max-w-[280px]">{scope === 'favorites_only' ? 'O radar avaliará apenas partidas com um time favorito envolvido.' : 'O radar avaliará todas as partidas disponíveis. Escolha Ligas, Times ou Partidas para restringir.'}</p>
            </div>
          ) : (
            <>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input value={query} onChange={e => setQuery(e.target.value)} autoFocus placeholder={`Buscar ${scope === 'specific_leagues' ? 'liga' : scope === 'specific_teams' ? 'time' : 'partida'}...`} className="w-full h-9 pl-8 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] text-white/90 placeholder:text-white/30 outline-none focus:border-white/25" />
              </div>
              <div className="flex-1 overflow-y-auto sidebar-scroll space-y-0.5 pr-1 max-h-[300px]">
                {scope === 'specific_leagues' && (leagueRows.length === 0 ? <Empty /> : leagueRows.map(l => <Row key={l.id} active={scopeFilter.includes(l.name)} logo={l.logo} square title={l.name} sub={[l.country, l.season].filter(Boolean).join(' · ')} onClick={() => toggle(scopeFilter, setScopeFilter, l.name)} />))}
                {scope === 'specific_teams' && (teamRows.length === 0 ? <Empty /> : teamRows.map(t => <Row key={t.id} active={scopeFilter.includes(t.name)} logo={t.logo} title={t.name} sub={t.league} onClick={() => toggle(scopeFilter, setScopeFilter, t.name)} />))}
                {scope === 'specific_matches' && (matchRows.length === 0 ? <Empty /> : matchRows.map(m => <Row key={m.canonicalMatchId} active={matches.includes(m.canonicalMatchId)} logo={m.leagueLogo} square title={`${m.homeTeam} × ${m.awayTeam}`} sub={[m.league, m.status].filter(Boolean).join(' · ')} onClick={() => toggle(matches, setMatches, m.canonicalMatchId)} />))}
              </div>
            </>
          )}
        </div>

        {/* Right: selected */}
        <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.01] p-3 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Selecionados</span>
            <span className="text-[10px] tabular-nums text-white/45 ml-auto">{selectedLabels.length}</span>
          </div>
          {selectedLabels.length === 0 ? (
            <p className="text-[11px] text-white/35 flex-1">{isList ? 'Nada selecionado ainda.' : scope === 'favorites_only' ? 'Favoritos' : 'Todos os jogos'}</p>
          ) : (
            <div className="flex-1 overflow-y-auto sidebar-scroll space-y-1 max-h-[240px]">
              {selectedLabels.map(s => (
                <div key={s.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.07]">
                  <span className="text-[11px] text-white/80 truncate flex-1">{s.label}</span>
                  <button type="button" onClick={() => removeSelected(s.id)} aria-label="Remover" className="h-4 w-4 rounded flex items-center justify-center text-white/40 hover:text-rose-300"><X size={11} /></button>
                </div>
              ))}
            </div>
          )}
          {selectedLabels.length > 0 && <button type="button" onClick={() => (scope === 'specific_matches' ? setMatches([]) : setScopeFilter([]))} className="mt-2 text-[10.5px] text-white/40 hover:text-white/70 transition-colors">Limpar seleção</button>}
        </div>
      </div>

      {/* Advanced disclosure */}
      <div className="mt-4 pt-3 border-t border-white/[0.05]">
        <button type="button" onClick={() => setShowAdvanced(v => !v)} className="text-[11px] font-semibold text-white/60 hover:text-white/90 flex items-center gap-1.5 transition-colors">
          <span>{showAdvanced ? '▾' : '▸'}</span>Filtros avançados
          {(excludeLeagues.length + excludeTeams.length + excludeMatches.length > 0 || requireRichData || onlyLive || onlyPreMatch) && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300">ativos</span>}
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] px-4 py-2">
              <ToggleSettingRow title="Apenas jogos com dados ricos" description="Limita ao provedor ESPN ou jogos com estatísticas em tempo real." checked={requireRichData} onChange={setRequireRichData} />
              <ToggleSettingRow title="Apenas ao vivo" description="Avalia somente partidas em andamento." checked={onlyLive} onChange={v => { setOnlyLive(v); if (v) setOnlyPreMatch(false) }} />
              <ToggleSettingRow title="Apenas pré-jogo" description="Avalia somente partidas que ainda não começaram." checked={onlyPreMatch} onChange={v => { setOnlyPreMatch(v); if (v) setOnlyLive(false) }} />
            </div>
            <LeaguePicker mode="exclude" options={props.availableLeaguesRich} selected={excludeLeagues} onChange={setExcludeLeagues} />
            <TeamPicker mode="exclude" options={props.availableTeamsRich} selected={excludeTeams} onChange={setExcludeTeams} />
            <MatchPicker mode="exclude" options={props.availableMatches} selected={excludeMatches} onChange={setExcludeMatches} />
          </div>
        )}
      </div>
    </SheetShell>
  )
}

function Empty() {
  return <p className="text-center text-[11px] text-white/35 py-6">Nada encontrado. A biblioteca cresce conforme você usa o app.</p>
}
