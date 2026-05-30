/**
 * PatternDryRunPanel — displays dry-run results in a modal/panel.
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows what would happen if the pattern were active against current fixtures.
 * No alerts are registered. No notifications are sent. No history is altered.
 */
import { useState } from 'react'
import { Activity, AlertTriangle, CheckCircle, XCircle, HelpCircle, Shield } from 'lucide-react'
import type { PatternDryRunResult, DryRunSignalState } from '../../../intelligence/patternDryRunEngine'

type FilterMode = 'all' | 'ready' | 'candidate' | 'blocked' | 'no_data'

const SIGNAL_STATE_CONFIG: Record<DryRunSignalState, { label: string; tone: string; icon: typeof Activity }> = {
  ready_to_alert: { label: 'Pronto', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20', icon: CheckCircle },
  strong_candidate: { label: 'Candidato', tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-400/20', icon: Activity },
  watch_only: { label: 'Observação', tone: 'text-white/55 bg-white/[0.04] border-white/[0.08]', icon: HelpCircle },
  blocked: { label: 'Bloqueado', tone: 'text-rose-300 bg-rose-500/10 border-rose-400/20', icon: XCircle },
  insufficient_data: { label: 'Sem dados', tone: 'text-amber-300 bg-amber-500/10 border-amber-400/20', icon: AlertTriangle },
  out_of_scope: { label: 'Fora do escopo', tone: 'text-white/40 bg-white/[0.02] border-white/[0.05]', icon: Shield },
}

const DATA_QUALITY_TONE: Record<string, string> = {
  rich: 'text-emerald-300 bg-emerald-500/8 border-emerald-400/15',
  partial: 'text-amber-300 bg-amber-500/8 border-amber-400/15',
  poor: 'text-rose-300 bg-rose-500/8 border-rose-400/15',
}

const MOMENTUM_TONE: Record<string, string> = {
  timed_events: 'text-emerald-300',
  mixed: 'text-cyan-300',
  stats_proxy: 'text-amber-300',
  insufficient: 'text-white/40',
}

interface PatternDryRunPanelProps {
  results: PatternDryRunResult[]
  onClose: () => void
  isAdvanced?: boolean
}

export function PatternDryRunPanel({ results, onClose, isAdvanced = false }: PatternDryRunPanelProps) {
  const [filter, setFilter] = useState<FilterMode>('all')

  // Summary counts
  const totalEvaluated = results.length
  const readyCount = results.filter(r => r.signalState === 'ready_to_alert').length
  const candidateCount = results.filter(r => r.signalState === 'strong_candidate').length
  const blockedCount = results.filter(r => r.signalState === 'blocked' || r.signalState === 'watch_only').length
  const noDataCount = results.filter(r => r.signalState === 'insufficient_data').length
  const matchedCount = results.filter(r => r.matched).length

  // Filter results
  const filtered = results.filter(r => {
    if (filter === 'all') return r.matched || isAdvanced // In normal mode, hide out_of_scope
    if (filter === 'ready') return r.signalState === 'ready_to_alert'
    if (filter === 'candidate') return r.signalState === 'strong_candidate'
    if (filter === 'blocked') return r.signalState === 'blocked' || r.signalState === 'watch_only'
    if (filter === 'no_data') return r.signalState === 'insufficient_data'
    return true
  })

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#0b0d12]/70 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="w-full max-w-[900px] max-h-[85vh] rounded-[20px] border border-white/[0.08] bg-[#0c1018] shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <header className="px-6 py-5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-[16px] font-bold text-white/90">Teste ao vivo — Dry Run</h3>
              <p className="text-[11px] text-white/50 mt-1">Avalia os jogos atuais com as regras configuradas, sem registrar alertas.</p>
            </div>
            <button onClick={onClose} type="button" className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/65 border border-white/[0.08] hover:text-white/95 hover:border-white/[0.12] transition-colors">Fechar</button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-5 gap-px rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.01] mt-4">
            <div className="px-3 py-2 text-center bg-[#080d16]">
              <span className={`text-[16px] font-bold tabular-nums block leading-none ${totalEvaluated > 0 ? 'text-white/80' : 'text-white/25'}`}>{totalEvaluated}</span>
              <span className="text-[9px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">Avaliados</span>
            </div>
            <div className="px-3 py-2 text-center bg-[#080d16]">
              <span className={`text-[16px] font-bold tabular-nums block leading-none ${readyCount > 0 ? 'text-emerald-300' : 'text-white/25'}`}>{readyCount}</span>
              <span className="text-[9px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">Prontos</span>
            </div>
            <div className="px-3 py-2 text-center bg-[#080d16]">
              <span className={`text-[16px] font-bold tabular-nums block leading-none ${candidateCount > 0 ? 'text-cyan-300' : 'text-white/25'}`}>{candidateCount}</span>
              <span className="text-[9px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">Candidatos</span>
            </div>
            <div className="px-3 py-2 text-center bg-[#080d16]">
              <span className={`text-[16px] font-bold tabular-nums block leading-none ${blockedCount > 0 ? 'text-rose-300' : 'text-white/25'}`}>{blockedCount}</span>
              <span className="text-[9px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">Bloqueados</span>
            </div>
            <div className="px-3 py-2 text-center bg-[#080d16]">
              <span className={`text-[16px] font-bold tabular-nums block leading-none ${noDataCount > 0 ? 'text-amber-300' : 'text-white/25'}`}>{noDataCount}</span>
              <span className="text-[9px] text-white/45 uppercase tracking-wider block mt-1 font-semibold">Sem dados</span>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {([
              { key: 'all' as FilterMode, label: 'Todos', count: matchedCount },
              { key: 'ready' as FilterMode, label: 'Prontos', count: readyCount },
              { key: 'candidate' as FilterMode, label: 'Candidatos', count: candidateCount },
              { key: 'blocked' as FilterMode, label: 'Bloqueados', count: blockedCount },
              { key: 'no_data' as FilterMode, label: 'Sem dados', count: noDataCount },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${filter === f.key ? 'bg-white/[0.06] text-white/90 border border-white/[0.12]' : 'text-white/50 border border-transparent hover:text-white/80 hover:bg-white/[0.025]'}`}
              >
                {f.label} {f.count > 0 && <span className="ml-1 tabular-nums text-[10px] text-white/40">{f.count}</span>}
              </button>
            ))}
          </div>
        </header>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-[13px] text-white/55 font-medium">Nenhum resultado para este filtro.</p>
              <p className="text-[11px] text-white/35 mt-1">
                {totalEvaluated === 0
                  ? 'Não há jogos carregados no momento.'
                  : matchedCount === 0
                    ? 'O padrão não bateu em nenhum jogo atual.'
                    : 'Tente outro filtro.'}
              </p>
            </div>
          ) : (
            filtered.map(r => <DryRunResultRow key={r.fixtureId} result={r} isAdvanced={isAdvanced} />)
          )}
        </div>

        {/* Footer copy */}
        <footer className="px-6 py-3 border-t border-white/[0.05] shrink-0">
          <p className="text-[10px] text-white/35 leading-snug">
            Resultado pode mudar conforme o provider atualiza eventos e estatísticas. Nenhum alerta foi registrado.
          </p>
        </footer>
      </div>
    </div>
  )
}

// ─── Result Row ──────────────────────────────────────────────────────────────

function DryRunResultRow({ result, isAdvanced }: { result: PatternDryRunResult; isAdvanced: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const config = SIGNAL_STATE_CONFIG[result.signalState]
  const Icon = config.icon

  return (
    <div className={`rounded-xl border px-4 py-3 transition-colors ${result.matched ? 'border-white/[0.07] bg-white/[0.012]' : 'border-white/[0.04] bg-white/[0.005] opacity-70'}`}>
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <Icon size={14} className={config.tone.split(' ')[0]} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-white/85 truncate">{result.matchLabel}</span>
            {result.league && <span className="text-[10px] text-white/40">{result.league}</span>}
            {result.minute !== undefined && <span className="text-[10px] text-white/50 tabular-nums">{result.minute}&apos;</span>}
            {result.score && <span className="text-[10px] text-white/50 tabular-nums">{result.score}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {result.adjustedConfidence !== undefined && (
            <span className="text-[11px] text-white/65 font-bold tabular-nums">{result.adjustedConfidence}%</span>
          )}
          {result.dataQuality && (
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${DATA_QUALITY_TONE[result.dataQuality] || ''}`}>
              {result.dataQuality}
            </span>
          )}
          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${config.tone}`}>
            {config.label}
          </span>
          {result.wouldAlert && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border text-emerald-300 bg-emerald-500/10 border-emerald-400/20">
              Alertaria
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-2 animate-fadeIn">
          {/* Reasons */}
          {result.reasons.length > 0 && (
            <div>
              <span className="text-[9.5px] uppercase tracking-wider text-white/45 font-semibold">Evidências</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {result.reasons.map((r, i) => (
                  <span key={i} className="text-[10px] text-white/65 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded">{r}</span>
                ))}
              </div>
            </div>
          )}

          {/* Blockers */}
          {result.blockers.length > 0 && (
            <div>
              <span className="text-[9.5px] uppercase tracking-wider text-rose-300/80 font-semibold">Bloqueadores</span>
              <ul className="mt-1 space-y-0.5">
                {result.blockers.map((b, i) => (
                  <li key={i} className="text-[10px] text-rose-300/70 leading-snug">✗ {b}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Momentum & events */}
          {(result.momentumSource || result.recentEventsUsed.length > 0) && (
            <div>
              <span className="text-[9.5px] uppercase tracking-wider text-white/45 font-semibold">Momentum</span>
              <div className="flex items-center gap-3 mt-1 text-[10px]">
                {result.momentumSource && (
                  <span className={MOMENTUM_TONE[result.momentumSource] || 'text-white/50'}>
                    Fonte: {result.momentumSource === 'timed_events' ? 'Eventos minutados' : result.momentumSource === 'mixed' ? 'Misto' : result.momentumSource === 'stats_proxy' ? 'Proxy de stats' : 'Insuficiente'}
                  </span>
                )}
                {result.recencyConfidence !== undefined && (
                  <span className="text-white/50">Recência: <span className="text-white/75 font-semibold tabular-nums">{result.recencyConfidence}%</span></span>
                )}
              </div>
              {result.recentEventsUsed.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {result.recentEventsUsed.map((e, i) => (
                    <div key={i} className="text-[10px] text-white/55 flex items-center gap-2">
                      <span className="text-white/40 tabular-nums w-[28px] shrink-0">{e.minute}&apos;</span>
                      <span className="text-white/65">{e.type.replace(/_/g, ' ')}</span>
                      {e.teamName && <span className="text-white/40">· {e.teamName}</span>}
                      {e.playerName && <span className="text-white/40">· {e.playerName}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Technical details (advanced) */}
          {isAdvanced && (
            <div className="text-[10px] text-white/40 font-mono pt-1 border-t border-white/[0.03]">
              raw:{result.rawConfidence ?? '—'} · adj:{result.adjustedConfidence ?? '—'} · dq:{result.dataQuality ?? '—'} · provider:{result.provider ?? '—'} · wouldAlert:{result.wouldAlert ? 'sim' : 'não'} · wouldNotify:{result.wouldNotify ? 'sim' : 'não'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
