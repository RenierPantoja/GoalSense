/**
 * ScopePicker — radar scope mode selector + advanced filters
 * ─────────────────────────────────────────────────────────────────────────────
 * Owns the top-level scope mode (all / favorites_only / specific_leagues /
 * specific_teams / specific_matches) and the advanced filters disclosure with
 * include/exclude pickers + state flags (requireRichData / onlyLive /
 * onlyPreMatch). All sub-pickers are pure presentational and live in this
 * scope folder.
 */
import { useState } from 'react'
import type { ScopeKbLeague, ScopeKbMatch, ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'
import { ToggleSettingRow } from '../shell/ToggleSettingRow'
import { LeaguePicker } from './LeaguePicker'
import { TeamPicker } from './TeamPicker'
import { MatchPicker } from './MatchPicker'

type Scope = 'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams' | 'specific_matches'

interface ScopePickerProps {
  scope: Scope
  scopeFilter: string[]
  matches: string[]
  excludeLeagues: string[]
  excludeTeams: string[]
  excludeMatches: string[]
  requireRichData: boolean
  onlyLive: boolean
  onlyPreMatch: boolean
  availableMatches: ScopeKbMatch[]
  availableLeaguesRich: ScopeKbLeague[]
  availableTeamsRich: ScopeKbTeam[]
  onScopeChange: (s: Scope) => void
  onScopeFilterChange: (s: string[]) => void
  onMatchesChange: (s: string[]) => void
  onExcludeLeaguesChange: (s: string[]) => void
  onExcludeTeamsChange: (s: string[]) => void
  onExcludeMatchesChange: (s: string[]) => void
  onAdvancedToggle: (key: 'requireRichData' | 'onlyLive' | 'onlyPreMatch', v: boolean) => void
}

export function ScopePicker({
  scope, scopeFilter, matches, excludeLeagues, excludeTeams, excludeMatches,
  requireRichData, onlyLive, onlyPreMatch,
  availableMatches, availableLeaguesRich, availableTeamsRich,
  onScopeChange, onScopeFilterChange, onMatchesChange,
  onExcludeLeaguesChange, onExcludeTeamsChange, onExcludeMatchesChange,
  onAdvancedToggle,
}: ScopePickerProps) {
  const [showAdvanced, setShowAdvanced] = useState<boolean>(
    excludeLeagues.length > 0 || excludeTeams.length > 0 || excludeMatches.length > 0 ||
    requireRichData || onlyLive || onlyPreMatch
  )
  const modes: { v: Scope; label: string; hint: string }[] = [
    { v: 'all', label: 'Todos os jogos', hint: 'Avalia em qualquer partida disponível.' },
    { v: 'favorites_only', label: 'Apenas favoritos', hint: 'Avalia apenas quando um time favorito está envolvido.' },
    { v: 'specific_leagues', label: 'Ligas específicas', hint: 'Selecione uma ou mais ligas para limitar o radar.' },
    { v: 'specific_teams', label: 'Times específicos', hint: 'Selecione um ou mais times para limitar o radar.' },
    { v: 'specific_matches', label: 'Partidas específicas', hint: 'Restrinja a uma ou mais partidas individuais.' },
  ]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {modes.map(m => {
          const isActive = scope === m.v
          return (
            <button key={m.v} onClick={() => onScopeChange(m.v)} type="button" aria-pressed={isActive} className={`group text-left rounded-xl border px-4 py-3 transition-colors duration-200 ${isActive ? 'border-white/[0.18] bg-white/[0.04]' : 'border-white/[0.06] bg-white/[0.012] hover:border-white/[0.12] hover:bg-white/[0.022]'}`}>
              <div className="flex items-start gap-2.5">
                <span className={`mt-[2px] h-3.5 w-3.5 rounded-full shrink-0 border transition-colors ${isActive ? 'border-white/65 bg-white/85' : 'border-white/25 bg-transparent group-hover:border-white/45'}`} />
                <div className="flex-1 min-w-0">
                  <span className={`text-[12.5px] font-semibold block tracking-tight ${isActive ? 'text-white/95' : 'text-white/80'}`}>{m.label}</span>
                  <span className="text-[11px] text-white/50 leading-snug block mt-0.5">{m.hint}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {scope === 'specific_leagues' && (
        <LeaguePicker
          options={availableLeaguesRich}
          selected={scopeFilter}
          onChange={onScopeFilterChange}
        />
      )}
      {scope === 'specific_teams' && (
        <TeamPicker
          options={availableTeamsRich}
          selected={scopeFilter}
          onChange={onScopeFilterChange}
        />
      )}
      {scope === 'specific_matches' && (
        <MatchPicker
          options={availableMatches}
          selected={matches}
          onChange={onMatchesChange}
        />
      )}

      {/* Advanced filters disclosure */}
      <div>
        <button type="button" onClick={() => setShowAdvanced(v => !v)} className="text-[11px] font-semibold text-white/65 hover:text-white/95 flex items-center gap-1.5 transition-colors">
          <span>{showAdvanced ? '▾' : '▸'}</span>
          Filtros avançados {(excludeLeagues.length + excludeTeams.length + excludeMatches.length > 0 || requireRichData || onlyLive || onlyPreMatch) && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300">ativos</span>}
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.012] px-5 py-3">
              <ToggleSettingRow title="Apenas jogos com dados ricos" description="Limita ao provedor ESPN ou jogos com estatísticas em tempo real." checked={requireRichData} onChange={v => onAdvancedToggle('requireRichData', v)} />
              <ToggleSettingRow title="Apenas ao vivo" description="Avalia somente partidas em andamento." checked={onlyLive} onChange={v => onAdvancedToggle('onlyLive', v)} />
              <ToggleSettingRow title="Apenas pré-jogo" description="Avalia somente partidas que ainda não começaram." checked={onlyPreMatch} onChange={v => onAdvancedToggle('onlyPreMatch', v)} />
            </div>
            <LeaguePicker mode="exclude" options={availableLeaguesRich} selected={excludeLeagues} onChange={onExcludeLeaguesChange} />
            <TeamPicker mode="exclude" options={availableTeamsRich} selected={excludeTeams} onChange={onExcludeTeamsChange} />
            <MatchPicker mode="exclude" options={availableMatches} selected={excludeMatches} onChange={onExcludeMatchesChange} />
          </div>
        )}
      </div>
    </div>
  )
}
