/**
 * AlertRow — single alert log entry for the Alerts tab.
 * ─────────────────────────────────────────────────────────────────────────────
 * Behaviour preserved byte-for-byte from CommandCenterPage.tsx (V3.18E).
 * Status tones, "Jornada" badge and advanced footer all kept identical.
 */
import type { LiveFixture } from '@/lib/apiClient'
import type { TriggeredAlert } from '../../../types/commandTypes'

interface AlertRowProps {
  t: TriggeredAlert
  fx?: LiveFixture
  openMatch: (fx: LiveFixture) => void
  isAdvanced: boolean
}

export function AlertRow({ t, fx, openMatch, isAdvanced }: AlertRowProps) {
  const status = t.status as string
  const cfg =
    status === 'confirmed' ? { label: 'Confirmado', cls: 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20', accent: 'border-l-emerald-400/55', dot: 'bg-emerald-400' }
    : status === 'confirmed_partial' ? { label: 'Parcial', cls: 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15', accent: 'border-l-cyan-400/45', dot: 'bg-cyan-400' }
    : status === 'failed' ? { label: 'Falhou', cls: 'bg-rose-500/12 text-rose-300 border-rose-400/20', accent: 'border-l-rose-400/55', dot: 'bg-rose-400' }
    : status === 'expired' ? { label: 'Expirado', cls: 'bg-white/[0.05] text-white/55 border-white/[0.07]', accent: 'border-l-white/25', dot: 'bg-white/40' }
    : status === 'pending' ? { label: 'Pendente', cls: 'bg-amber-500/12 text-amber-300 border-amber-400/20', accent: 'border-l-amber-400/55', dot: 'bg-amber-400' }
    : { label: 'Desconhecido', cls: 'bg-white/[0.05] text-white/55 border-white/[0.07]', accent: 'border-l-white/20', dot: 'bg-white/30' }
  const journeyComplete = status === 'confirmed' || status === 'failed' || status === 'confirmed_partial'

  return (
    <div onClick={() => fx && openMatch(fx)} role={fx ? 'button' : undefined} tabIndex={fx ? 0 : undefined} className={`relative rounded-2xl border border-l-2 ${cfg.accent} border-white/[0.05] bg-gradient-to-r from-white/[0.012] to-white/[0.005] ${fx ? 'cursor-pointer hover:border-white/[0.1] hover:bg-white/[0.018]' : ''} transition-all`}>
      <div className="px-5 py-4">
        <div className="flex items-center gap-3 mb-2">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot} ${status === 'pending' ? 'animate-pulse' : ''}`} />
          <span className="text-[13px] font-bold text-white/90 truncate flex-1">{t.patternName}</span>
          <span className="text-[11px] text-white/65 tabular-nums font-bold">{t.confidence}%</span>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${cfg.cls}`}>{cfg.label}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-white/65 flex-wrap">
          <span className="font-semibold">{t.homeTeam}</span>
          <span className="text-white/85 font-bold tabular-nums px-1">{t.scoreAtTrigger.home}-{t.scoreAtTrigger.away}</span>
          <span className="font-semibold">{t.awayTeam}</span>
          {t.minute && <span className="text-white/45">· {t.minute}'</span>}
          <span className="text-white/45 truncate">· {t.league}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-cyan-500/8 text-cyan-300/80 border border-cyan-400/12 ml-auto whitespace-nowrap">Command Center</span>
          {journeyComplete && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.05] text-white/65 border border-white/[0.07]">Jornada</span>}
        </div>
        {t.reasons.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {t.reasons.slice(0, 3).map((r, i) => <span key={i} className="text-[10px] text-white/55 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.05]">{r}</span>)}
          </div>
        )}
        {isAdvanced && (
          <div className="mt-2 pt-2 border-t border-white/[0.04] grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-white/45 font-mono">
            <span>id: {t.id.slice(0, 8)}</span>
            <span>created: {new Date(t.timestamp).toLocaleTimeString('pt-BR')}</span>
            <span>min: {t.minute || '-'}</span>
            <span>fixture: {t.fixtureId}</span>
          </div>
        )}
        <div className="mt-1.5 text-[10px] text-white/35">{new Date(t.timestamp).toLocaleString('pt-BR')}</div>
      </div>
    </div>
  )
}
