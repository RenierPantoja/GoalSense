/**
 * AutoEngineOverviewPanel — honest at-a-glance read of what the engine is seeing.
 * Empty states are honest; no fake charts, no odds. (B20)
 */
import { Layers, ShieldAlert, Database, History, BellRing } from 'lucide-react'
import type { AutoEngineStatusDto, AutoEngineRunDto, AutoOpportunityDto, PromotedAlertListItemDto, PromotedAlertResult } from '@/features/command/intelligence/autoEngineTypes'
import { OPP_TYPE_LABEL, STATUS_TONE, STATUS_LABEL, DATA_QUALITY_LABEL, blockReasonLabel, PROMOTED_RESULT_LABEL } from '@/features/command/intelligence/autoEngineTypes'
import type { OpportunityType, DataQuality } from '@/features/command/intelligence/autoEngineTypes'

interface Props {
  status: AutoEngineStatusDto | null
  runs: AutoEngineRunDto[]
  promotedAlerts?: PromotedAlertListItemDto[]
  onOpenOpportunity: (o: AutoOpportunityDto) => void
}

function Bars({ rows, total, tone = '#2DD4BF' }: { rows: { label: string; count: number }[]; total: number; tone?: string }) {
  if (rows.length === 0) return <p className="text-[11px] text-white/35">Sem dados ainda.</p>
  const max = Math.max(1, ...rows.map(r => r.count))
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] text-white/60 w-[42%] truncate" title={r.label}>{r.label}</span>
          <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.round((r.count / max) * 100)}%`, backgroundColor: tone, opacity: 0.6 }} />
          </div>
          <span className="text-[11px] text-white/55 tabular-nums w-8 text-right">{r.count}{total ? '' : ''}</span>
        </div>
      ))}
    </div>
  )
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-white/35">{icon}</span>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{title}</h4>
      </div>
      {children}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#080d16] px-2 py-2 text-center">
      <span className="block text-[15px] font-semibold text-white/85 tabular-nums leading-none">{value}</span>
      <span className="block text-[9px] text-white/40 uppercase tracking-wider mt-1 truncate">{label}</span>
    </div>
  )
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '—' }
}

export function AutoEngineOverviewPanel({ status, runs, promotedAlerts = [], onOpenOpportunity }: Props) {
  const latest = status?.latestOpportunities ?? []
  const types = (status?.topOpportunityTypes ?? []).map(t => ({ label: OPP_TYPE_LABEL[t.type as OpportunityType] || t.type, count: t.count }))
  const blocks = Object.entries(status?.blockReasons ?? {}).map(([k, v]) => ({ label: blockReasonLabel(k), count: v })).sort((a, b) => b.count - a.count)
  const dq = Object.entries(status?.dataQualityBreakdown ?? {}).map(([k, v]) => ({ label: DATA_QUALITY_LABEL[k as DataQuality] || k, count: v })).sort((a, b) => b.count - a.count)

  const promoCounts = promotedAlerts.reduce((acc, p) => { acc[p.result] = (acc[p.result] || 0) + 1; return acc }, {} as Record<PromotedAlertResult, number>)
  const promoTotal = promotedAlerts.length
  const useful = (promoCounts.confirmed || 0) + (promoCounts.confirmed_partial || 0)
  const unknownN = (promoCounts.unknown || 0) + (promoCounts.expired || 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Tipos de oportunidade" icon={<Layers size={14} />}><Bars rows={types} total={status?.opportunitiesTotal ?? 0} /></Card>
        <Card title="Principais motivos de bloqueio" icon={<ShieldAlert size={14} />}><Bars rows={blocks} total={status?.blocked ?? 0} tone="#F59E0B" /></Card>
        <Card title="Qualidade dos dados" icon={<Database size={14} />}><Bars rows={dq} total={status?.opportunitiesTotal ?? 0} tone="#38BDF8" /></Card>
      </div>

      <Card title="Últimas oportunidades" icon={<Layers size={14} />}>
        {latest.length === 0
          ? <p className="text-[12px] text-white/40">Sem oportunidades registradas ainda. Rode um scan ou ative o motor para começar.</p>
          : (
            <div className="space-y-1.5">
              {latest.slice(0, 8).map(o => (
                <button key={o.id} type="button" onClick={() => onOpenOpportunity(o)} className="w-full flex items-center gap-3 text-left rounded-lg border border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.03] px-3 py-2 transition-colors">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                  <span className="text-[12px] text-white/80 truncate flex-1">{o.fixtureLabel}</span>
                  <span className="text-[11px] text-white/45 truncate hidden sm:block">{OPP_TYPE_LABEL[o.opportunityType]}</span>
                  <span className="text-[12px] text-white/70 tabular-nums w-8 text-right">{o.score}</span>
                </button>
              ))}
            </div>
          )}
      </Card>

      <Card title="Alertas promovidos (resultado)" icon={<BellRing size={14} />}>
        {promoTotal === 0
          ? <p className="text-[12px] text-white/40">Nenhuma oportunidade foi promovida para alerta ainda. A promoção é manual e exige confirmação humana.</p>
          : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-px rounded-lg overflow-hidden border border-white/[0.06]">
                <Metric label="Total" value={promoTotal} />
                <Metric label={PROMOTED_RESULT_LABEL.pending} value={promoCounts.pending || 0} />
                <Metric label={PROMOTED_RESULT_LABEL.confirmed} value={promoCounts.confirmed || 0} />
                <Metric label={PROMOTED_RESULT_LABEL.confirmed_partial} value={promoCounts.confirmed_partial || 0} />
                <Metric label={PROMOTED_RESULT_LABEL.failed} value={promoCounts.failed || 0} />
                <Metric label={PROMOTED_RESULT_LABEL.unknown} value={unknownN} />
              </div>
              <p className="text-[11px] text-white/40 mt-2">Úteis (confirmado + parcial): <span className="text-white/70">{useful}</span> · Sem dados/unknown: <span className="text-white/70">{unknownN}</span> · Amostra: <span className="text-white/70">{promoTotal}</span>. Isto não é taxa de acerto — unknown nunca é falha e o score não é probabilidade.</p>
            </>
          )}
      </Card>

      <Card title="Execuções recentes" icon={<History size={14} />}>
        {runs.length === 0
          ? <p className="text-[12px] text-white/40">Nenhuma execução registrada ainda.</p>
          : (
            <div className="space-y-1">
              {runs.slice(0, 6).map(r => (
                <div key={r.id} className="flex items-center gap-3 text-[11.5px] py-1 border-b border-white/[0.04] last:border-0">
                  <span className="text-white/70 capitalize w-20">{r.status}</span>
                  <span className="text-white/40">{fmtTime(r.finishedAt || r.startedAt)}</span>
                  <span className="text-white/55 ml-auto tabular-nums">{r.fixturesScanned} jogos · {r.opportunitiesFound} opp · {r.blocked} bloq</span>
                </div>
              ))}
            </div>
          )}
      </Card>
    </div>
  )
}
