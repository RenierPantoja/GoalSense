/**
 * AutoEngineStatusPanel — transparent view of the engine's operational flags
 * and last run. No red panic card: honest, elegant, direct. (B20)
 */
import { Power, PenLine, Clock3, BellOff, ShieldCheck } from 'lucide-react'
import type { AutoEngineStatusDto } from '@/features/command/intelligence/autoEngineTypes'
import { SAMPLE_LABEL } from '@/features/command/intelligence/autoEngineTypes'

interface Props {
  status: AutoEngineStatusDto | null
  loading: boolean
}

function FlagPill({ on, label, icon, forcedOff }: { on: boolean; label: string; icon: React.ReactNode; forcedOff?: boolean }) {
  const tone = forcedOff
    ? 'bg-white/[0.03] border-white/[0.08] text-white/45'
    : on
      ? 'bg-[#13B8A6]/10 border-[#2DD4BF]/25 text-[#7FE9DC]'
      : 'bg-white/[0.03] border-white/[0.08] text-white/45'
  const state = forcedOff ? 'bloqueado' : on ? 'on' : 'off'
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${tone}`}>
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="text-[11.5px] font-medium leading-tight">{label}</span>
      <span className="ml-auto text-[10px] uppercase tracking-wider font-semibold opacity-70">{state}</span>
    </div>
  )
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '—' }
}

export function AutoEngineStatusPanel({ status, loading }: Props) {
  if (loading && !status) {
    return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-5 text-[12px] text-white/45">Carregando estado do motor…</div>
  }
  const cfg = status?.lastRun?.config
  const run = status?.lastRun

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Estado operacional</h3>
        <span className="text-[10px] text-white/30">atualizado {fmtTime(status?.generatedAt)}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <FlagPill on={!!status?.enabled} label="Motor ligado" icon={<Power size={14} />} />
        <FlagPill on={!!status?.writeEnabled} label="Persistência (write)" icon={<PenLine size={14} />} />
        <FlagPill on={!!status?.schedulerEnabled} label="Scan automático" icon={<Clock3 size={14} />} />
        <FlagPill on={false} forcedOff label="Auto → Alertas (fase futura)" icon={<BellOff size={14} />} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-white/[0.06]">
        <Cfg label="Máx. jogos/scan" value={cfg ? String(cfg.maxFixtures) : '—'} />
        <Cfg label="Score mínimo" value={cfg ? String(cfg.minScore) : '—'} />
        <Cfg label="Amostra mínima" value={cfg ? SAMPLE_LABEL[cfg.minSampleQuality] : '—'} />
        <Cfg label="Máx. opp/jogo" value={cfg ? String(cfg.maxOppsPerFixture) : '—'} />
      </div>

      <div className="flex items-center gap-2 text-[11px] text-white/45">
        <ShieldCheck size={13} className="text-[#5EEAD4]/70 shrink-0" />
        <span>Última execução: <span className="text-white/70">{run ? `${run.status} · ${fmtTime(run.finishedAt || run.startedAt)}` : 'nenhuma ainda'}</span>{run ? ` · ${run.fixturesScanned} jogos · ${run.opportunitiesFound} oportunidades` : ''}</span>
      </div>

      {status?.limitations && status.limitations.length > 0 && (
        <ul className="space-y-1 pt-1">
          {status.limitations.map((l, i) => (
            <li key={i} className="text-[11px] text-white/40 flex gap-1.5"><span className="text-white/25">·</span>{l}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Cfg({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#080d16] px-3 py-2.5 text-center">
      <span className="block text-[13px] font-semibold text-white/85 leading-none capitalize">{value}</span>
      <span className="block text-[9px] text-white/40 uppercase tracking-wider mt-1 font-semibold">{label}</span>
    </div>
  )
}
