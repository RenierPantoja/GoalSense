/**
 * ConfiguredRadarRow — single row in "Radares configurados" list.
 * Behaviour preserved byte-for-byte from CommandCenterPage.tsx (V3.18E).
 * Toggle, edit, duplicate and delete buttons all remain wired to the parent
 * `PatternsView` handlers.
 */
import type { Pattern, TriggeredAlert } from '../../../types/commandTypes'
import { HEALTH_TONE, type PatternHealth } from '../../../intelligence/patternHealthEngine'
import { describePatternScope, scopeShortLabel } from '../../../utils/patternScopeAudit'
import { PremiumToggle } from '../../pattern-studio/shell/PremiumToggle'
import { HealthBreakdownChip } from './HealthBreakdownChip'

interface ConfiguredRadarRowProps {
  pattern: Pattern
  health?: PatternHealth
  triggeredAlerts: TriggeredAlert[]
  onToggle: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  isAdvanced: boolean
  /** Optional V4.4 prefetch hook for the CustomPatternModal chunk. */
  onPrefetch?: () => void
}

export function ConfiguredRadarRow({ pattern, health, triggeredAlerts, onToggle, onEdit, onDuplicate, onDelete, isAdvanced, onPrefetch }: ConfiguredRadarRowProps) {
  const isActive = pattern.status === 'active'
  const lastHit = triggeredAlerts.find(t => t.patternId === pattern.id)?.timestamp || null
  const hits = triggeredAlerts.filter(t => t.patternId === pattern.id).length
  const sevTone = pattern.severity === 'critical' ? 'bg-rose-500/12 text-rose-300 border-rose-400/20' : pattern.severity === 'attention' ? 'bg-amber-500/12 text-amber-300 border-amber-400/20' : 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15'
  const origin = pattern.isTemplate || pattern.templateId ? 'Template' : 'Personalizado'
  const healthTone = health ? HEALTH_TONE[health.status] : null

  return (
    <div className={`rounded-2xl border ${isActive ? 'border-white/[0.08]' : 'border-white/[0.05] opacity-75'} bg-white/[0.012] px-5 py-4`}>
      <div className="flex items-center gap-4">
        <div className="shrink-0 flex items-center justify-center" style={{ width: 42 }}>
          <PremiumToggle checked={isActive} onChange={onToggle} ariaLabel={`${isActive ? 'Pausar' : 'Ativar'} ${pattern.name}`} size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h4 className="text-[13px] font-bold text-white/95 truncate">{pattern.name}</h4>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${sevTone}`}>{pattern.severity === 'critical' ? 'Crítico' : pattern.severity === 'attention' ? 'Atenção' : 'Info'}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/[0.04] text-white/65 border border-white/[0.07]">{origin}</span>
            {health && healthTone && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${healthTone.bg} ${healthTone.border} ${healthTone.text}`} title={health.reason}>
                <span className={`h-1.5 w-1.5 rounded-full ${healthTone.dot}`} />
                {health.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-x-3 gap-y-1 text-[11px] text-white/55 flex-wrap">
            <span>{pattern.conditions.length} {pattern.conditions.length === 1 ? 'condição' : 'condições'}</span>
            <span>· Conf ≥ {pattern.minConfidence}%</span>
            <span>· {pattern.action === 'register_alert' ? 'Alerta' : pattern.action === 'suggest_only' ? 'Sugerir' : 'Destacar'}</span>
            <span>· {scopeShortLabel(pattern)}</span>
            {pattern.onlyLive && <span>· ao vivo</span>}
            {pattern.onlyPreMatch && <span>· pré-jogo</span>}
            {pattern.requireRichData && <span>· dados ricos</span>}
            {(() => {
              const exCount = (pattern.excludeLeagues?.length || 0) + (pattern.excludeTeams?.length || 0) + (pattern.excludeMatches?.length || 0)
              if (exCount === 0) return null
              return <span className="text-rose-200/80">· exceto {exCount} {exCount === 1 ? 'item' : 'itens'}</span>
            })()}
            {hits > 0 && <span>· <span className="text-white/85 font-semibold">{hits}</span> {hits === 1 ? 'disparo' : 'disparos'}</span>}
            {lastHit && <span>· Último {new Date(lastHit).toLocaleDateString('pt-BR')}</span>}
          </div>
          {health && health.reason && (
            <p className={`text-[11px] mt-1 ${healthTone?.text ?? 'text-white/55'} leading-snug`}>{health.reason}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} onMouseEnter={onPrefetch} onFocus={onPrefetch} type="button" className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/65 hover:text-white/95 hover:bg-white/[0.05] transition-colors">Editar</button>
          <button onClick={onDuplicate} type="button" className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/65 hover:text-white/95 hover:bg-white/[0.05] transition-colors">Duplicar</button>
          <button onClick={onDelete} type="button" className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/45 hover:text-rose-300 hover:bg-rose-500/8 transition-colors" aria-label="Excluir">Excluir</button>
        </div>
      </div>
      {isAdvanced && (
        <div className="mt-2 pt-2 border-t border-white/[0.04] space-y-2">
          {(() => {
            const detail = describePatternScope(pattern)
            if (detail.length === 0) return null
            return (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] uppercase tracking-wider text-white/45 font-semibold">Escopo:</span>
                {detail.map((s, i) => <span key={i} className="text-[10px] text-white/65 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded">{s}</span>)}
              </div>
            )
          })()}
          {(pattern.scope === 'specific_leagues' && pattern.scopeFilter && pattern.scopeFilter.length > 0) && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] uppercase tracking-wider text-white/45 font-semibold">Ligas:</span>
              {pattern.scopeFilter.slice(0, 3).map(s => <span key={s} className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-2 py-0.5 rounded">{s}</span>)}
              {pattern.scopeFilter.length > 3 && <span className="text-[10px] text-white/45">+{pattern.scopeFilter.length - 3}</span>}
            </div>
          )}
          {(pattern.scope === 'specific_teams' && pattern.scopeFilter && pattern.scopeFilter.length > 0) && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] uppercase tracking-wider text-white/45 font-semibold">Times:</span>
              {pattern.scopeFilter.slice(0, 3).map(s => <span key={s} className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-2 py-0.5 rounded">{s}</span>)}
              {pattern.scopeFilter.length > 3 && <span className="text-[10px] text-white/45">+{pattern.scopeFilter.length - 3}</span>}
            </div>
          )}
          {pattern.matches && pattern.matches.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] uppercase tracking-wider text-white/45 font-semibold">Partidas:</span>
              {pattern.matches.slice(0, 3).map(s => <span key={s} className="text-[10px] text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-2 py-0.5 rounded truncate max-w-[200px]">{s}</span>)}
              {pattern.matches.length > 3 && <span className="text-[10px] text-white/45">+{pattern.matches.length - 3}</span>}
            </div>
          )}
          {((pattern.excludeLeagues?.length || 0) + (pattern.excludeTeams?.length || 0) + (pattern.excludeMatches?.length || 0) > 0) && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] uppercase tracking-wider text-rose-300 font-semibold">Exclusões:</span>
              {pattern.excludeLeagues?.slice(0, 2).map(s => <span key={`el-${s}`} className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-400/20 px-2 py-0.5 rounded">− {s}</span>)}
              {pattern.excludeTeams?.slice(0, 2).map(s => <span key={`et-${s}`} className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-400/20 px-2 py-0.5 rounded">− {s}</span>)}
              {pattern.excludeMatches?.slice(0, 2).map(s => <span key={`em-${s}`} className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-400/20 px-2 py-0.5 rounded truncate max-w-[160px]">− {s}</span>)}
            </div>
          )}
          <div className="text-[10px] text-white/45 font-mono">
            id:{pattern.id.slice(0, 12)} · template:{pattern.templateId || 'custom'} · max/jogo:{pattern.maxTriggersPerMatch} · anti-dup:{pattern.antiDuplicateWindow}min
          </div>
          {health && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                <span className="text-white/45 uppercase tracking-wider font-semibold">Resoluções:</span>
                <HealthBreakdownChip label="confirmadas" value={health.confirmedCount} tone="emerald" />
                <HealthBreakdownChip label="parciais" value={health.partialCount} tone="cyan" />
                <HealthBreakdownChip label="falhas" value={health.failedCount} tone="rose" />
                <HealthBreakdownChip label="sem dados" value={health.unknownCount} tone="amber" />
                <HealthBreakdownChip label="expiradas" value={health.expiredCount} tone="white" />
                <HealthBreakdownChip label="pendentes" value={health.pendingCount} tone="white" />
                {health.hitRate !== null && (
                  <span className="text-[10px] text-white/65">· Confirmação <span className="text-white/95 font-semibold tabular-nums">{Math.round(health.hitRate * 100)}%</span></span>
                )}
                {health.avgConfidence !== null && (
                  <span className="text-[10px] text-white/65">· Confiança média <span className="text-white/95 font-semibold tabular-nums">{health.avgConfidence}%</span></span>
                )}
              </div>
              {health.recommendations.length > 0 && (
                <div className="flex items-start gap-1.5 flex-wrap text-[10.5px]">
                  <span className="text-amber-200/80 uppercase tracking-wider font-semibold text-[9.5px] mt-px">Sugestões:</span>
                  <ul className="flex-1 space-y-0.5 min-w-0">
                    {health.recommendations.map((r, i) => (
                      <li key={i} className="text-white/65 leading-snug">· {r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
