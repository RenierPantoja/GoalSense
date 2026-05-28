/**
 * ScannerRow — one signal row in the Scanner view.
 * ─────────────────────────────────────────────────────────────────────────────
 * Behaviour preserved byte-for-byte from CommandCenterPage.tsx (V3.18E).
 * Renders match identity, confidence, status badges and the scope audit chip.
 * Clicking opens the Match Center via the `openMatch` callback passed from
 * the Command Center page.
 */
import { ChevronRight } from 'lucide-react'
import type { LiveFixture } from '@/lib/apiClient'
import { ClubLogo } from '@/components/ui/ClubLogo'
import type { Pattern, ScannerEntry } from '../../../types/commandTypes'
import { isLiveFx } from '../../../commandHelpers'
import { describePatternScope } from '../../../utils/patternScopeAudit'
import { ConfidenceBar } from './ConfidenceBar'

interface ScannerRowProps {
  entry: ScannerEntry
  openMatch: (fx: LiveFixture) => void
  isAdvanced: boolean
  isFavoriteTeam: (name: string) => boolean
  patterns: Pattern[]
}

export function ScannerRow({ entry, openMatch, isAdvanced, isFavoriteTeam, patterns }: ScannerRowProps) {
  const fx = entry.fixture
  const live = isLiveFx(fx)
  const isFav = isFavoriteTeam(fx.homeTeam.name) || isFavoriteTeam(fx.awayTeam.name)
  const accentBorder = entry.priority === 'critical' ? 'border-l-rose-400/55' : entry.priority === 'attention' ? 'border-l-amber-400/55' : 'border-l-cyan-400/45'
  const statusLabel = live ? 'Batendo' : entry.topPattern ? 'Pronto' : 'Sugerido'
  const statusColor = live ? 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20' : entry.topPattern ? 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15' : 'bg-white/[0.04] text-white/55 border-white/[0.07]'
  const fullPattern = entry.topPattern ? patterns.find(p => p.id === entry.topPattern!.patternId) : null
  const scopeAudit = fullPattern ? describePatternScope(fullPattern) : null

  return (
    <div onClick={() => openMatch(fx)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') openMatch(fx) }} className={`group relative rounded-2xl border border-l-2 ${accentBorder} border-white/[0.05] bg-gradient-to-r from-white/[0.012] to-white/[0.005] hover:border-white/[0.1] hover:bg-white/[0.018] cursor-pointer transition-all`}>
      <div className="px-5 py-4">
        {/* Top row */}
        <div className="flex items-center gap-3 mb-2.5">
          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${entry.priority === 'critical' ? 'bg-rose-500/12 text-rose-300 border-rose-400/20' : entry.priority === 'attention' ? 'bg-amber-500/12 text-amber-300 border-amber-400/20' : 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15'}`}>
            {entry.priority === 'critical' ? 'Crítico' : entry.priority === 'attention' ? 'Atenção' : 'Observar'}
          </span>
          <span className="text-[12px] text-white/85 font-bold flex-1 truncate">{entry.reason || 'Sinal detectado'}</span>
          {isFav && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-400/15">Favorito</span>}
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${statusColor}`}>{statusLabel}</span>
        </div>

        {/* Match line */}
        <div className="flex items-center gap-2.5 mb-2.5">
          <ClubLogo src={fx.homeTeam.logo} name={fx.homeTeam.name} size={22} />
          <span className="text-[13px] text-white/85 font-semibold truncate">{fx.homeTeam.name}</span>
          <span className="text-[14px] text-white font-bold tabular-nums px-2">{fx.score.home ?? '-'}<span className="text-white/25 mx-1">:</span>{fx.score.away ?? '-'}</span>
          <span className="text-[13px] text-white/85 font-semibold truncate">{fx.awayTeam.name}</span>
          <ClubLogo src={fx.awayTeam.logo} name={fx.awayTeam.name} size={22} />
        </div>

        {/* Meta + evidence */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium tabular-nums ${live ? 'text-emerald-400' : 'text-white/45'}`}>
            {live ? <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> {fx.status.elapsed || 0}'</> : <>⏰ {new Date(fx.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>}
          </span>
          <span className="text-[11px] text-white/45 truncate">{fx.league.name}</span>
          {entry.topPattern && entry.topPattern.reasons.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {entry.topPattern.reasons.slice(0, 2).map((r, i) => (
                <span key={i} className="text-[10px] text-white/55 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.05]">{r}</span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <ConfidenceBar value={entry.confidence} />
            <span className="text-[12px] text-white/85 font-bold tabular-nums">{entry.confidence}%</span>
            <ChevronRight size={14} className="text-white/25 group-hover:text-white/65 transition-colors" />
          </div>
        </div>
        {scopeAudit && scopeAudit.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] uppercase tracking-wider text-white/45 font-semibold">Escopo:</span>
            {scopeAudit.map((s, i) => (
              <span key={i} className="text-[10px] text-white/65 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded">{s}</span>
            ))}
          </div>
        )}
        {/* V5 Precision: signal state + data quality + momentum source */}
        {entry.signalState && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
              entry.signalState === 'ready_to_alert' ? 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20' :
              entry.signalState === 'strong_candidate' ? 'bg-amber-500/10 text-amber-300 border-amber-400/15' :
              entry.signalState === 'watch_only' ? 'bg-white/[0.04] text-white/50 border-white/[0.06]' :
              'bg-rose-500/10 text-rose-300 border-rose-400/15'
            }`}>
              {entry.signalState === 'ready_to_alert' ? 'Pronto' : entry.signalState === 'strong_candidate' ? 'Candidato' : entry.signalState === 'watch_only' ? 'Observação' : 'Bloqueado'}
            </span>
            {entry.dataQuality && (
              <span className={`text-[9px] font-medium px-2 py-0.5 rounded-md border ${
                entry.dataQuality === 'rich' ? 'text-emerald-300/70 border-emerald-400/12 bg-emerald-500/5' :
                entry.dataQuality === 'partial' ? 'text-amber-300/70 border-amber-400/12 bg-amber-500/5' :
                'text-rose-300/60 border-rose-400/10 bg-rose-500/5'
              }`}>
                {entry.dataQuality === 'rich' ? 'Dados ricos' : entry.dataQuality === 'partial' ? 'Dados parciais' : 'Dados pobres'}
              </span>
            )}
            {entry.momentumSource && (
              <span className={`text-[9px] font-medium px-2 py-0.5 rounded-md border ${
                entry.momentumSource === 'timed_events' ? 'text-emerald-300/70 border-emerald-400/12 bg-emerald-500/5' :
                entry.momentumSource === 'mixed' ? 'text-cyan-300/70 border-cyan-400/12 bg-cyan-500/5' :
                entry.momentumSource === 'stats_proxy' ? 'text-amber-300/60 border-amber-400/10 bg-amber-500/5' :
                'text-rose-300/50 border-rose-400/8 bg-rose-500/4'
              }`}>
                {entry.momentumSource === 'timed_events' ? 'Momentum confirmado' : entry.momentumSource === 'mixed' ? 'Momentum misto' : entry.momentumSource === 'stats_proxy' ? 'Momentum estimado' : 'Sem recência'}
              </span>
            )}
          </div>
        )}
        {/* V5 Precision: blockers in advanced mode */}
        {isAdvanced && entry.blockers && entry.blockers.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/[0.04]">
            <span className="text-[9px] uppercase tracking-wider text-rose-300/60 font-semibold">Por que não disparou:</span>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              {entry.blockers.slice(0, 4).map((b, i) => (
                <span key={i} className="text-[9px] text-rose-200/60 bg-rose-500/5 border border-rose-400/10 px-2 py-0.5 rounded">{b}</span>
              ))}
              {entry.blockers.length > 4 && <span className="text-[9px] text-white/30">+{entry.blockers.length - 4}</span>}
            </div>
          </div>
        )}
        {/* V5 Phase 7B: recent events used in advanced mode */}
        {isAdvanced && entry.recentEventsUsed && entry.recentEventsUsed.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/[0.04]">
            <span className="text-[9px] uppercase tracking-wider text-cyan-300/50 font-semibold">Eventos recentes usados:</span>
            <div className="mt-1 space-y-0.5">
              {entry.recentEventsUsed.map((ev, i) => (
                <div key={i} className="text-[9px] text-white/45">
                  <span className="text-white/60 font-mono">{ev.minute}'</span>{' '}
                  <span>{translateEventType(ev.type)}</span>
                  {ev.teamName && <span className="text-white/30"> — {ev.teamName}</span>}
                  {ev.playerName && <span className="text-white/25"> · {ev.playerName}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        {isAdvanced && entry.momentumSource === 'stats_proxy' && !entry.recentEventsUsed?.length && (
          <div className="mt-2 pt-2 border-t border-white/[0.04]">
            <p className="text-[9px] text-amber-300/40 italic">Sem eventos minutados recentes. Motor usou estatísticas agregadas como proxy conservador.</p>
          </div>
        )}
        {isAdvanced && entry.topPattern && (
          <div className="mt-2 pt-2 border-t border-white/[0.04] text-[10px] text-white/35 font-mono">
            cond:{entry.topPattern.matchedConditions}/{entry.topPattern.totalConditions} · sev:{entry.topPattern.severity} · provider:{fx.provider}
          </div>
        )}
      </div>
    </div>
  )
}


function translateEventType(type: string): string {
  switch (type) {
    case 'goal': return 'Gol'
    case 'own_goal': return 'Gol contra'
    case 'penalty_scored': return 'Pênalti convertido'
    case 'penalty_missed': return 'Pênalti perdido'
    case 'shot_on_target': return 'Finalização no gol'
    case 'shot_off_target': return 'Finalização para fora'
    case 'corner': return 'Escanteio'
    case 'yellow_card': return 'Cartão amarelo'
    case 'red_card': return 'Cartão vermelho'
    case 'second_yellow': return 'Segundo amarelo'
    case 'substitution': return 'Substituição'
    case 'var': return 'VAR'
    case 'dangerous_attack': return 'Ataque perigoso'
    case 'attack': return 'Ataque'
    default: return type
  }
}
