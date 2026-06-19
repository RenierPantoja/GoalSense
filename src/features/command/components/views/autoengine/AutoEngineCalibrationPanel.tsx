/**
 * AutoEngineCalibrationPanel — is the Auto Engine getting calibrated, or just noise? (B24)
 * ─────────────────────────────────────────────────────────────────────────────
 * Observational read of the Auto Engine learning profile built from manually-promoted
 * alert outcomes. Honest: small samples are flagged; score buckets are signal-quality,
 * never probability; unknown is neutral, never a failure. Nothing here auto-tunes.
 */
import { useCallback, useEffect, useState } from 'react'
import { Gauge, RefreshCw, TrendingUp, AlertTriangle, Database, ShieldAlert, Lightbulb } from 'lucide-react'
import { autoEngineApi } from '@/services/autoEngineApi'
import type { AutoEngineLearningProfileDto } from '@/features/command/intelligence/autoEngineTypes'
import { OPP_TYPE_LABEL, AUTO_SAMPLE_QUALITY_LABEL, blockReasonLabel } from '@/features/command/intelligence/autoEngineTypes'
import type { OpportunityType } from '@/features/command/intelligence/autoEngineTypes'

const pct = (r: number | null | undefined) => (r == null ? '—' : `${Math.round(r * 100)}%`)

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-3"><span className="text-white/35">{icon}</span><h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{title}</h4></div>
      {children}
    </div>
  )
}

const STRENGTH_TONE: Record<string, string> = {
  high: 'bg-[#13B8A6]/12 border-[#2DD4BF]/25 text-[#7FE9DC]',
  medium: 'bg-sky-500/10 border-sky-400/20 text-sky-200/80',
  low: 'bg-white/[0.04] border-white/[0.1] text-white/55',
}

export function AutoEngineCalibrationPanel({ rebuildEnabled = false }: { rebuildEnabled?: boolean }) {
  const [profile, setProfile] = useState<AutoEngineLearningProfileDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [rebuilding, setRebuilding] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await autoEngineApi.getAutoEngineLearningProfile()
    if (r.ok) setProfile(r.data)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const rebuild = async () => {
    setRebuilding(true); setMsg(null)
    const r = await autoEngineApi.rebuildAutoEngineLearning({})
    if (r.disabled) setMsg(r.error || 'Recálculo desabilitado neste ambiente (ENABLE_AUTO_ENGINE_LEARNING_REBUILD).')
    else if (!r.ok) setMsg(r.error || 'Falha ao recalcular a calibração.')
    else { await load(); setMsg('Calibração recalculada.') }
    setRebuilding(false)
  }

  if (loading) return <p className="text-[12px] text-white/40 px-1 py-8 text-center">Carregando calibração…</p>

  if (!profile || profile.sampleSize === 0) {
    return (
      <div className="space-y-4">
        <RebuildBar rebuildEnabled={rebuildEnabled} rebuilding={rebuilding} onRebuild={rebuild} msg={msg} lastRunAt={profile?.generatedAt ?? null} />
        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] p-8 text-center">
          <Gauge size={22} className="mx-auto text-white/25 mb-3" />
          <p className="text-[14px] text-white/80 font-medium">Ainda não há outcomes suficientes de alertas promovidos</p>
          <p className="text-[12px] text-white/45 mt-1.5 max-w-[460px] mx-auto leading-relaxed">A calibração do Motor Automático aprende com os alertas que você promoveu manualmente e que já foram resolvidos. Promova e resolva alertas para começar a ver indícios — nada aqui é taxa de acerto nem probabilidade.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <RebuildBar rebuildEnabled={rebuildEnabled} rebuilding={rebuilding} onRebuild={rebuild} msg={msg} lastRunAt={profile.generatedAt} />

      {/* Headline maturity */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px rounded-2xl overflow-hidden border border-white/[0.07]">
        <Metric label="Promovidos resolvidos" value={profile.sampleSize} />
        <Metric label="Promovidos (total)" value={profile.promotedAlertsTotal} />
        <Metric label="Úteis" value={pct(profile.usefulRate)} />
        <Metric label="Sem dados" value={pct(profile.unknownRate)} />
        <Metric label="Amostra" value={AUTO_SAMPLE_QUALITY_LABEL[profile.sampleQuality]} small />
      </div>
      {profile.sampleQuality === 'insufficient' && (
        <div className="rounded-xl border border-amber-400/18 bg-amber-500/[0.05] px-4 py-2.5 text-[12px] text-amber-100/75">Amostra global insuficiente — trate tudo abaixo como indício inicial, não conclusão. Score é qualidade de sinal, não probabilidade.</div>
      )}

      {/* Opportunity types */}
      <Card title="Tipos de oportunidade (promovidos resolvidos)" icon={<TrendingUp size={14} />}>
        {profile.opportunityTypeProfiles.length === 0
          ? <p className="text-[11px] text-white/35">Sem dados ainda.</p>
          : (
            <div className="space-y-1.5">
              {profile.opportunityTypeProfiles.map(t => (
                <div key={t.opportunityType} className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] text-white/85 font-medium">{OPP_TYPE_LABEL[t.opportunityType as OpportunityType] || t.opportunityType}</span>
                    <span className="text-[10px] text-white/40">n={t.sampleSize}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/55">{AUTO_SAMPLE_QUALITY_LABEL[t.sampleQuality]}</span>
                    <span className="ml-auto text-[11px] text-[#7FE9DC]/80">útil {pct(t.usefulRate)}</span>
                    <span className="text-[11px] text-amber-100/65">unknown {pct(t.unknownRate)}</span>
                  </div>
                  {t.topUnknownReasons.length > 0 && t.unknownRate != null && t.unknownRate >= 0.4 && (
                    <p className="text-[10.5px] text-white/40 mt-1">unknown frequente: {t.topUnknownReasons.slice(0, 2).map(r => r.reason).join(' · ')}</p>
                  )}
                </div>
              ))}
            </div>
          )}
      </Card>

      {/* Score calibration */}
      <Card title="Calibração de score (qualidade de sinal, não probabilidade)" icon={<Gauge size={14} />}>
        <div className="space-y-1.5">
          {profile.scoreCalibration.buckets.map(b => (
            <div key={b.label} className="flex items-center gap-2 text-[11.5px]">
              <span className="w-16 text-white/70 tabular-nums">{b.label}</span>
              <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                <div className="h-full rounded-full bg-[#2DD4BF]/60" style={{ width: `${Math.round((b.usefulRate ?? 0) * 100)}%` }} />
              </div>
              <span className="text-white/55 tabular-nums w-10 text-right">{pct(b.usefulRate)}</span>
              <span className="text-white/35 tabular-nums w-8 text-right">n={b.sampleSize}</span>
            </div>
          ))}
        </div>
        <p className="text-[10.5px] text-white/40 mt-2">{profile.scoreCalibration.overallNote}</p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Qualidade dos dados" icon={<Database size={14} />}>
          {profile.dataQualityProfile.length === 0 ? <p className="text-[11px] text-white/35">Sem dados.</p> : (
            <div className="space-y-1">
              {profile.dataQualityProfile.map(d => (
                <div key={d.dataQuality} className="flex items-center justify-between py-0.5 text-[11.5px]"><span className="text-white/70">{d.dataQuality}</span><span className="text-white/45">útil {pct(d.usefulRate)} · unknown {pct(d.unknownRate)} · n={d.sampleSize}</span></div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Risk gate (bloqueios observados)" icon={<ShieldAlert size={14} />}>
          {profile.riskGateProfile.length === 0 ? <p className="text-[11px] text-white/35">Nenhum bloqueio observado.</p> : (
            <div className="space-y-1">
              {profile.riskGateProfile.slice(0, 6).map(g => (
                <div key={g.blockReason} className="flex items-center justify-between py-0.5 text-[11.5px]">
                  <span className="text-white/70">{blockReasonLabel(g.blockReason)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${g.interpretation === 'useful_blocker' ? 'bg-[#13B8A6]/10 border-[#2DD4BF]/20 text-[#7FE9DC]/85' : 'bg-white/[0.04] border-white/[0.08] text-white/50'}`}>{g.interpretation === 'useful_blocker' ? 'bloqueio útil' : 'sem outcome'} · {g.timesSeen}×</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-white/35 mt-2">Bloqueios nunca viram alerta, então não há outcome — só frequência.</p>
        </Card>
      </div>

      {/* Recommendations */}
      <Card title="Recomendações observacionais (não autoaplicadas)" icon={<Lightbulb size={14} />}>
        {profile.recommendations.length === 0 ? <p className="text-[11px] text-white/35">Sem recomendações ainda.</p> : (
          <div className="space-y-1.5">
            {profile.recommendations.slice(0, 10).map(r => (
              <div key={r.id} className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.01] px-3 py-2">
                <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border shrink-0 ${STRENGTH_TONE[r.strength]}`}>{r.strength}</span>
                <span className="text-[11.5px] text-white/70 leading-snug">{r.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {profile.limitations.length > 0 && (
        <Card title="Limitações" icon={<AlertTriangle size={14} />}>
          <ul className="space-y-1">{profile.limitations.map((l, i) => <li key={i} className="text-[11.5px] text-white/55 flex gap-2"><span className="text-white/30 mt-0.5">·</span>{l}</li>)}</ul>
        </Card>
      )}
    </div>
  )
}

function RebuildBar({ rebuildEnabled, rebuilding, onRebuild, msg, lastRunAt }: { rebuildEnabled: boolean; rebuilding: boolean; onRebuild: () => void; msg: string | null; lastRunAt: string | null }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <p className="text-[12px] text-white/45 flex-1 min-w-[200px]">Calibração observacional do Motor Automático a partir de alertas promovidos resolvidos. Não autoajusta o motor.{lastRunAt ? ` Última geração: ${new Date(lastRunAt).toLocaleString('pt-BR')}.` : ''}</p>
      <button type="button" onClick={onRebuild} disabled={rebuilding} title={rebuildEnabled ? '' : 'Requer ENABLE_AUTO_ENGINE_LEARNING_REBUILD=true no backend'} className="h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[12px] text-white/60 hover:text-white/90 inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 shrink-0">
        <RefreshCw size={13} className={rebuilding ? 'animate-spin' : ''} />Recalcular
      </button>
      {msg && <span className="text-[11px] text-white/55 w-full">{msg}</span>}
    </div>
  )
}

function Metric({ label, value, small }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div className="bg-[#080d16] px-2 py-2.5 text-center">
      <span className={`block font-semibold text-white/85 tabular-nums leading-none ${small ? 'text-[12px]' : 'text-[16px]'}`}>{value}</span>
      <span className="block text-[9px] text-white/40 uppercase tracking-wider mt-1 truncate">{label}</span>
    </div>
  )
}
