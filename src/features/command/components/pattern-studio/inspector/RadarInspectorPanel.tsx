/**
 * RadarInspectorPanel — native side panel inspector (Apple vibe)
 * ─────────────────────────────────────────────────────────────────────────────
 * Vertical stack of small grouped blocks separated by hairlines instead of a
 * dense table. Status row at top, key/value rows, optional exclusion block,
 * a numbered operational flow and a "ready to save" footer.
 * Avoids saturated colors; uses neutral tones with single-color accents only
 * when meaningful.
 */
import type { PatternCondition } from '../../../types/commandTypes'
import type { ScopeKbLeague, ScopeKbMatch, ScopeKbTeam } from '@/services/intelligence/scopeKnowledgeBase'
import { normalizeText } from '../../../utils/patternStudioHelpers'
import { ExclusionAvatarRow, InspectorBadge, InspectorRow } from './InspectorPrimitives'

export type DraftStatus = 'draft' | 'paused' | 'active'

interface RadarInspectorPanelProps {
  name: string
  status: DraftStatus
  severity: 'critical' | 'attention' | 'info'
  scope: 'all' | 'favorites_only' | 'specific_leagues' | 'specific_teams' | 'specific_matches'
  scopeFilter?: string[]
  matches?: string[]
  action: 'register_alert' | 'suggest_only' | 'highlight'
  minConf: number
  conditions: PatternCondition[]
  requireRichData?: boolean
  onlyLive?: boolean
  onlyPreMatch?: boolean
  excludeLeagues?: string[]
  excludeTeams?: string[]
  excludeMatches?: string[]
  // Optional rich lookups so we can render mini avatars/logos for the
  // selected and excluded entities. They map normalized name → full record.
  leagueLookup?: Map<string, ScopeKbLeague>
  teamLookup?: Map<string, ScopeKbTeam>
  matchLookup?: Map<string, ScopeKbMatch>
  currentStepLabel?: string
  totalSteps?: number
  currentStepIndex?: number
  canSave?: boolean
  /** Composer 2.0: header label (defaults to "Inspector"). */
  heading?: string
}

export function RadarInspectorPanel({
  name, status, severity, scope, scopeFilter, matches, action, minConf, conditions,
  requireRichData, onlyLive, onlyPreMatch,
  excludeLeagues, excludeTeams, excludeMatches,
  leagueLookup, teamLookup, matchLookup,
  currentStepLabel, totalSteps, currentStepIndex, canSave,
  heading = 'Inspector',
}: RadarInspectorPanelProps) {
  const sevLabel = severity === 'critical' ? 'Crítico' : severity === 'attention' ? 'Atenção' : 'Informação'
  const sevDot = severity === 'critical' ? 'bg-rose-400/80' : severity === 'attention' ? 'bg-amber-400/80' : 'bg-cyan-400/80'
  const scopeCount = scope === 'specific_leagues' || scope === 'specific_teams' ? (scopeFilter?.length || 0) : scope === 'specific_matches' ? (matches?.length || 0) : 0
  const scopeLabel = scope === 'favorites_only' ? 'Favoritos'
    : scope === 'specific_leagues' ? `${scopeCount} liga${scopeCount === 1 ? '' : 's'}`
    : scope === 'specific_teams' ? `${scopeCount} time${scopeCount === 1 ? '' : 's'}`
    : scope === 'specific_matches' ? `${scopeCount} partida${scopeCount === 1 ? '' : 's'}`
    : 'Todos os jogos'
  const actionLabel = action === 'register_alert' ? 'Registra alerta' : action === 'suggest_only' ? 'Sugere' : 'Destaca'
  const statusLabel = status === 'active' ? 'Ativo' : status === 'paused' ? 'Pausado' : 'Rascunho'
  const statusDot = status === 'active' ? 'bg-emerald-400/85' : status === 'paused' ? 'bg-white/40' : 'bg-cyan-300/70'

  const flow = [
    { label: 'Avalia partidas', hint: 'no escopo definido' },
    { label: 'Detecta sinal', hint: 'todas as condições verdadeiras' },
    {
      label: action === 'register_alert' ? 'Envia para Alertas' : action === 'suggest_only' ? 'Sugere no Cockpit' : 'Marca no Scanner',
      hint: action === 'register_alert' ? 'aparece em /app/alerts' : action === 'suggest_only' ? 'sem registrar alerta' : 'sem registrar alerta',
    },
    {
      label: 'Resolve resultado',
      hint: action === 'register_alert' ? 'motor confirma ou descarta' : 'sem acompanhamento',
    },
  ]

  return (
    <section className="rounded-[16px] border border-white/[0.06] bg-white/[0.012] overflow-hidden">
      {/* Inspector header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{heading}</span>
          {currentStepLabel && totalSteps && typeof currentStepIndex === 'number' && (
            <span className="ml-auto text-[10px] text-white/35 tabular-nums">{currentStepIndex + 1}/{totalSteps}</span>
          )}
        </div>
        <h4 className="text-[14px] font-semibold text-white/95 truncate mt-2 leading-tight">{name || 'Sem nome'}</h4>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
          <span className="text-[11px] text-white/55">{statusLabel}{currentStepLabel ? ` · ${currentStepLabel}` : ''}</span>
        </div>
      </div>

      {/* Key/Value rows */}
      <dl className="px-4 py-3 space-y-2.5 border-b border-white/[0.05]">
        <InspectorRow label="Severidade">
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${sevDot}`} />
            <span className="text-white/90 font-medium">{sevLabel}</span>
          </span>
        </InspectorRow>
        <InspectorRow label="Escopo">
          <span className="text-white/90 font-medium truncate max-w-[60%] text-right">{scopeLabel}</span>
        </InspectorRow>
        <InspectorRow label="Ação">
          <span className="text-white/90 font-medium">{actionLabel}</span>
        </InspectorRow>
        <InspectorRow label="Confiança">
          <span className="text-white/90 font-semibold tabular-nums">≥ {minConf}%</span>
        </InspectorRow>
        <InspectorRow label="Condições">
          <span className="text-white/90 font-semibold tabular-nums">{conditions.length}</span>
        </InspectorRow>
      </dl>

      {/* Filter badges */}
      {(onlyLive || onlyPreMatch || requireRichData) && (
        <div className="px-4 py-3 border-b border-white/[0.05] flex flex-wrap gap-1.5">
          {onlyLive && <InspectorBadge tone="emerald">Ao vivo</InspectorBadge>}
          {onlyPreMatch && <InspectorBadge tone="cyan">Pré-jogo</InspectorBadge>}
          {requireRichData && <InspectorBadge tone="neutral">Dados ricos</InspectorBadge>}
        </div>
      )}

      {/* Exclusions block — exclusões têm prioridade sobre inclusões */}
      {((excludeLeagues?.length || 0) + (excludeTeams?.length || 0) + (excludeMatches?.length || 0)) > 0 && (
        <div className="px-4 py-3 border-b border-white/[0.05] space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-300/75">Exclusões</span>
            <span className="text-[10px] text-white/40">têm prioridade</span>
          </div>
          {excludeLeagues && excludeLeagues.length > 0 && (
            <ExclusionAvatarRow
              label={`Exceto ${excludeLeagues.length} ${excludeLeagues.length === 1 ? 'liga' : 'ligas'}`}
              items={excludeLeagues}
              renderItem={(name) => {
                const meta = leagueLookup?.get(normalizeText(name))
                return { logo: meta?.logo || null, label: name, square: true }
              }}
            />
          )}
          {excludeTeams && excludeTeams.length > 0 && (
            <ExclusionAvatarRow
              label={`Exceto ${excludeTeams.length} ${excludeTeams.length === 1 ? 'time' : 'times'}`}
              items={excludeTeams}
              renderItem={(name) => {
                const meta = teamLookup?.get(normalizeText(name))
                return { logo: meta?.logo || null, label: name, square: false }
              }}
            />
          )}
          {excludeMatches && excludeMatches.length > 0 && (
            <ExclusionAvatarRow
              label={`Exceto ${excludeMatches.length} ${excludeMatches.length === 1 ? 'partida' : 'partidas'}`}
              items={excludeMatches}
              renderItem={(id) => {
                const meta = matchLookup?.get(id)
                if (meta) {
                  return {
                    label: `${meta.homeTeam} × ${meta.awayTeam}`,
                    matchPair: { home: { name: meta.homeTeam, logo: meta.homeLogo || null }, away: { name: meta.awayTeam, logo: meta.awayLogo || null } },
                  }
                }
                return { label: id, manual: true }
              }}
              truncatePerItem
            />
          )}
        </div>
      )}

      {/* Flow */}
      <div className="px-4 py-4 border-b border-white/[0.05]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 block mb-3">Fluxo operacional</span>
        <ol className="space-y-2.5">
          {flow.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-[2px] h-[18px] w-[18px] rounded-full flex items-center justify-center text-[9px] font-semibold tabular-nums text-white/55 bg-white/[0.04] border border-white/[0.06] shrink-0">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-white/85 font-medium leading-tight">{s.label}</p>
                <p className="text-[10.5px] text-white/40 leading-tight mt-0.5">{s.hint}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Footer ready state */}
      <div className="px-4 py-3 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${canSave ? 'bg-emerald-400/85' : 'bg-amber-400/70'}`} />
        <span className={`text-[11px] ${canSave ? 'text-white/75' : 'text-white/55'}`}>{canSave ? 'Pronto para salvar' : 'Preencha os campos obrigatórios'}</span>
      </div>
    </section>
  )
}
