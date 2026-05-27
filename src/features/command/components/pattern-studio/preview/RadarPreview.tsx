/**
 * RadarPreview — auditable summary shown in the Review step
 * ─────────────────────────────────────────────────────────────────────────────
 * Plain-Portuguese summary of how the radar will be evaluated. Lists scope,
 * exclusions, conditions and resolution destination so the user can confirm
 * the configuration before saving.
 */
import type { PatternCondition } from '../../../types/commandTypes'
import { formatConditionHuman } from '../../../utils/commandFormatters'

interface RadarPreviewProps {
  name: string
  severity: 'critical' | 'attention' | 'info'
  scope: 'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams' | 'specific_matches'
  scopeFilter?: string[]
  matches?: string[]
  excludeLeagues?: string[]
  excludeTeams?: string[]
  excludeMatches?: string[]
  requireRichData?: boolean
  onlyLive?: boolean
  onlyPreMatch?: boolean
  action: 'register_alert' | 'suggest_only' | 'highlight'
  minConf: number
  conditions: PatternCondition[]
}

export function RadarPreview({
  name, severity, scope, scopeFilter, matches,
  excludeLeagues, excludeTeams, excludeMatches,
  requireRichData, onlyLive, onlyPreMatch,
  action, minConf, conditions,
}: RadarPreviewProps) {
  const sevLabel = severity === 'critical' ? 'Crítico' : severity === 'attention' ? 'Atenção' : 'Info'
  const scopeLabel = scope === 'favorites_only'
    ? 'apenas favoritos'
    : scope === 'specific_leagues' && scopeFilter && scopeFilter.length > 0
    ? `${scopeFilter.length} liga${scopeFilter.length === 1 ? '' : 's'} selecionada${scopeFilter.length === 1 ? '' : 's'}`
    : scope === 'specific_teams' && scopeFilter && scopeFilter.length > 0
    ? `${scopeFilter.length} time${scopeFilter.length === 1 ? '' : 's'} selecionado${scopeFilter.length === 1 ? '' : 's'}`
    : scope === 'specific_matches' && matches && matches.length > 0
    ? `${matches.length} partida${matches.length === 1 ? '' : 's'} específica${matches.length === 1 ? '' : 's'}`
    : 'todos os jogos'
  const actionLabel = action === 'register_alert' ? 'registra alerta em /app/alerts' : action === 'suggest_only' ? 'apenas sugere no Cockpit/Scanner' : 'destaca no Scanner'
  const willResolve = action === 'register_alert'
  const stateFlag = onlyLive ? 'apenas ao vivo' : onlyPreMatch ? 'apenas pré-jogo' : null
  const hasExclusions = (excludeLeagues && excludeLeagues.length > 0) || (excludeTeams && excludeTeams.length > 0) || (excludeMatches && excludeMatches.length > 0)
  return (
    <section className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[0.05] via-blue-500/[0.025] to-transparent px-4 py-3.5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300/85 mb-2">Resumo do radar</h4>
      <p className="text-[12px] text-white/85 font-semibold leading-snug">{name || 'Sem nome'}</p>
      <p className="text-[11px] text-white/65 leading-snug mt-1">
        Avaliado em <span className="text-white/85 font-semibold">{scopeLabel}</span>
        {stateFlag && <> · <span className="text-white/85 font-semibold">{stateFlag}</span></>}
        {requireRichData && <> · <span className="text-white/85 font-semibold">somente dados ricos</span></>}
        {' '}com confiança ≥ <span className="text-white/85 font-bold tabular-nums">{minConf}%</span>. Ao detectar, <span className="text-white/85 font-semibold">{actionLabel}</span>.
      </p>
      {scope === 'specific_leagues' && scopeFilter && scopeFilter.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {scopeFilter.slice(0, 5).map(s => <span key={s} className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-2 py-0.5 rounded">{s}</span>)}
          {scopeFilter.length > 5 && <span className="text-[10px] text-white/55">+{scopeFilter.length - 5}</span>}
        </div>
      )}
      {scope === 'specific_teams' && scopeFilter && scopeFilter.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {scopeFilter.slice(0, 5).map(s => <span key={s} className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-2 py-0.5 rounded">{s}</span>)}
          {scopeFilter.length > 5 && <span className="text-[10px] text-white/55">+{scopeFilter.length - 5}</span>}
        </div>
      )}
      {scope === 'specific_matches' && matches && matches.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {matches.slice(0, 3).map(s => <span key={s} className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-2 py-0.5 rounded truncate max-w-[180px]">{s}</span>)}
          {matches.length > 3 && <span className="text-[10px] text-white/55">+{matches.length - 3}</span>}
        </div>
      )}
      {hasExclusions && (
        <div className="mt-2 flex flex-wrap gap-1">
          {excludeLeagues && excludeLeagues.map(s => <span key={s} className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-400/20 px-2 py-0.5 rounded">− {s}</span>)}
          {excludeTeams && excludeTeams.map(s => <span key={s} className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-400/20 px-2 py-0.5 rounded">− {s}</span>)}
          {excludeMatches && excludeMatches.map(s => <span key={s} className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-400/20 px-2 py-0.5 rounded truncate max-w-[180px]">− {s}</span>)}
        </div>
      )}
      {conditions.length > 0 && (
        <div className="mt-2.5">
          <span className="text-[10px] text-white/55 uppercase tracking-wider font-semibold block mb-1">Quando todas forem verdadeiras:</span>
          <ul className="space-y-0.5">
            {conditions.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-white/75"><span className="mt-1 h-1 w-1 rounded-full bg-cyan-400/70 shrink-0" /><span>{formatConditionHuman(c)}</span></li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-cyan-400/10">
        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.05] text-white/65 border border-white/[0.07]">{sevLabel}</span>
        {willResolve && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-400/15">Acompanhado pela resolução</span>}
        {!willResolve && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.05] text-white/55 border border-white/[0.07]">Não dispara alerta</span>}
      </div>
    </section>
  )
}
