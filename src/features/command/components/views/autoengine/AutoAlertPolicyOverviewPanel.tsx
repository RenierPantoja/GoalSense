/**
 * AutoAlertPolicyOverviewPanel — maturity of the automation policy layer. (B25)
 * ─────────────────────────────────────────────────────────────────────────────
 * Shadow decisions are NEVER counted as real alerts. Shows flags, decision tallies,
 * top block reasons, and most restrictive policies. No betting language.
 */
import { ShieldAlert, Ban, Eye, UserCheck, Zap } from 'lucide-react'
import type { AutoAlertPolicyOverviewDto } from '@/features/command/intelligence/autoEngineTypes'

function Cell({ label, value, tone = 'white' }: { label: string; value: number; tone?: 'white' | 'sky' | 'amber' | 'emerald' }) {
  const t = tone === 'sky' ? 'text-sky-200/85' : tone === 'amber' ? 'text-amber-100/80' : tone === 'emerald' ? 'text-[#7FE9DC]' : 'text-white/85'
  return (
    <div className="bg-[#080d16] px-2 py-2.5 text-center">
      <span className={`block text-[16px] font-semibold tabular-nums leading-none ${t}`}>{value}</span>
      <span className="block text-[9px] text-white/40 uppercase tracking-wider mt-1 truncate">{label}</span>
    </div>
  )
}

export function AutoAlertPolicyOverviewPanel({ overview }: { overview: AutoAlertPolicyOverviewDto }) {
  const f = overview.flags
  return (
    <div className="space-y-4">
      {/* Flags */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2.5">Flags de automação</h4>
        <div className="flex flex-wrap gap-1.5">
          <FlagChip on={f.policyEnabled} label="Política" />
          <FlagChip on={f.shadowMode} label="Shadow" neutral />
          <FlagChip on={f.createEnabled} label="Auto-create" danger />
          <FlagChip on={f.telegramEnabled} label="Telegram" danger />
          <FlagChip on={f.toAlertsEnabled} label="To-alerts" />
          <FlagChip on={f.configEnabled} label="Config" />
        </div>
        {!f.createEnabled && <p className="text-[11px] text-white/45 mt-2">Auto-create está <span className="text-white/70">desligado</span> — nenhuma política cria alerta automático. Decisões "criaria" são apenas shadow.</p>}
      </div>

      {/* Decision tallies */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-px rounded-2xl overflow-hidden border border-white/[0.07]">
        <Cell label="Avaliações" value={overview.totalEvaluations} />
        <Cell label="Bloqueadas" value={overview.blocked} />
        <Cell label="Criaria (shadow)" value={overview.shadowWouldCreate} tone="sky" />
        <Cell label="Sugerir manual" value={overview.suggestedManual} tone="amber" />
        <Cell label="Auto-criadas" value={overview.autoCreated} tone="emerald" />
        <Cell label="Puladas" value={overview.skipped} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Principais motivos de bloqueio" icon={<Ban size={14} />}>
          {overview.topBlockReasons.length === 0 ? <Empty /> : overview.topBlockReasons.map((r, i) => (
            <Row key={i} label={r.reason} value={r.count} />
          ))}
        </Card>
        <Card title="Tipos mais bloqueados" icon={<ShieldAlert size={14} />}>
          {overview.topBlockedOpportunityTypes.length === 0 ? <Empty /> : overview.topBlockedOpportunityTypes.map((r, i) => (
            <Row key={i} label={r.opportunityType} value={r.count} />
          ))}
        </Card>
      </div>

      <Card title="Políticas mais restritivas" icon={<Eye size={14} />}>
        {overview.mostRestrictivePolicies.length === 0 ? <Empty /> : overview.mostRestrictivePolicies.map(p => (
          <Row key={p.policyId} label={p.name} value={p.blocked} />
        ))}
      </Card>

      {overview.limitations.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
          <ul className="space-y-1">{overview.limitations.map((l, i) => <li key={i} className="text-[11.5px] text-white/55 flex gap-2"><span className="text-white/30 mt-0.5">·</span>{l}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4"><div className="flex items-center gap-2 mb-2.5"><span className="text-white/35">{icon}</span><h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{title}</h4></div><div className="space-y-1">{children}</div></div>
}
function Row({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between py-0.5 text-[11.5px]"><span className="text-white/70 truncate">{label}</span><span className="text-white/45 tabular-nums">{value}</span></div>
}
function Empty() { return <p className="text-[11px] text-white/35">Sem dados ainda.</p> }
function FlagChip({ on, label, danger, neutral }: { on: boolean; label: string; danger?: boolean; neutral?: boolean }) {
  const tone = !on ? 'bg-white/[0.04] border-white/[0.08] text-white/40'
    : danger ? 'bg-rose-500/10 border-rose-400/25 text-rose-200/85'
    : neutral ? 'bg-sky-500/10 border-sky-400/20 text-sky-200/85'
    : 'bg-[#13B8A6]/12 border-[#2DD4BF]/25 text-[#7FE9DC]'
  return <span className={`inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-1 rounded-full border ${tone}`}><Zap size={10} />{label}: {on ? 'on' : 'off'}</span>
}
