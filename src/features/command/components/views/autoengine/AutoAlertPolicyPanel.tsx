/**
 * AutoAlertPolicyPanel — the "Políticas" segment of the Auto Engine cockpit. (B25)
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows automation flags + overview, the list of policies (mode/enabled), recent
 * shadow/blocked/auto decisions, and an editor. Shadow-first is always explicit:
 * the UI never implies an alert was created unless decision === auto_created.
 */
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Plus, Pencil, ShieldAlert } from 'lucide-react'
import { autoEngineApi } from '@/services/autoEngineApi'
import type { AutoAlertPolicyDto, AutoAlertPolicyOverviewDto, AutoAlertPolicyEvaluationDto } from '@/features/command/intelligence/autoEngineTypes'
import { AUTO_ALERT_MODE_LABEL, AUTO_ALERT_DECISION_LABEL, AUTO_ALERT_DECISION_TONE } from '@/features/command/intelligence/autoEngineTypes'
import { AutoAlertPolicyOverviewPanel } from './AutoAlertPolicyOverviewPanel'
import { AutoAlertPolicyEditor } from './AutoAlertPolicyEditor'

export function AutoAlertPolicyPanel() {
  const [overview, setOverview] = useState<AutoAlertPolicyOverviewDto | null>(null)
  const [policies, setPolicies] = useState<AutoAlertPolicyDto[]>([])
  const [evals, setEvals] = useState<AutoAlertPolicyEvaluationDto[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AutoAlertPolicyDto | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [o, p, e] = await Promise.all([
      autoEngineApi.getAutoAlertPolicyOverview(),
      autoEngineApi.listAutoAlertPolicies(),
      autoEngineApi.listAutoAlertPolicyEvaluations(30),
    ])
    if (o.ok) setOverview(o.data)
    if (p.ok && p.data) setPolicies(p.data)
    if (e.ok && e.data) setEvals(e.data)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const openNew = async () => {
    const t = await autoEngineApi.getDefaultAutoAlertPolicyTemplate()
    if (t.ok && t.data) setEditing({ ...t.data, id: '' })
  }

  const configEnabled = overview?.flags.configEnabled ?? false
  const createEnabled = overview?.flags.createEnabled ?? false

  if (loading) return <p className="text-[12px] text-white/40 px-1 py-8 text-center">Carregando políticas…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-[12px] text-white/45 flex-1 min-w-[200px]">Política de automação do Motor Automático. Por padrão opera em <span className="text-white/70">shadow</span> — registra o que faria, sem criar alerta. Sem Telegram, sem odds.</p>
        <button type="button" onClick={load} className="h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[12px] text-white/60 hover:text-white/90 inline-flex items-center gap-1.5 transition-colors shrink-0"><RefreshCw size={13} />Atualizar</button>
        <button type="button" onClick={openNew} disabled={!configEnabled} title={configEnabled ? '' : 'Requer ENABLE_AUTO_ALERT_POLICY_CONFIG=true'} className="h-9 px-3 rounded-lg border border-[#2DD4BF]/25 bg-[#13B8A6]/[0.08] hover:bg-[#13B8A6]/[0.14] text-[12px] text-[#7FE9DC] inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 shrink-0"><Plus size={13} />Nova política</button>
      </div>

      {overview && <AutoAlertPolicyOverviewPanel overview={overview} />}

      {/* Policies */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-3">Políticas</h4>
        {policies.length === 0
          ? <p className="text-[12px] text-white/40">Nenhuma política criada. Comece pelo template padrão (shadow, conservador) — nada é criado automaticamente.</p>
          : (
            <div className="space-y-2">
              {policies.map(p => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.01] px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-white/90 font-medium truncate">{p.name}</p>
                    <p className="text-[11px] text-white/45">{AUTO_ALERT_MODE_LABEL[p.mode]} · score ≥ {p.minScore} · amostra ≥ {p.minSampleQuality}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${p.enabled && p.mode !== 'disabled' ? 'bg-[#13B8A6]/12 border-[#2DD4BF]/25 text-[#7FE9DC]' : 'bg-white/[0.05] border-white/[0.1] text-white/45'}`}>{p.enabled && p.mode !== 'disabled' ? 'ativa' : 'inativa'}</span>
                  <button type="button" onClick={() => setEditing(p)} className="h-8 w-8 rounded-lg grid place-items-center text-white/55 bg-white/[0.04] hover:bg-white/[0.08] hover:text-white/85 transition-colors"><Pencil size={13} /></button>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Recent decisions */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
        <div className="flex items-center gap-2 mb-3"><ShieldAlert size={14} className="text-white/35" /><h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Decisões recentes</h4></div>
        {evals.length === 0
          ? <p className="text-[12px] text-white/40">Nenhuma avaliação ainda. Avalie uma oportunidade ou rode um scan com a política habilitada.</p>
          : (
            <div className="space-y-1.5">
              {evals.slice(0, 20).map(e => (
                <div key={e.id} className="flex items-center gap-2 text-[11.5px] py-1 border-b border-white/[0.04] last:border-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${AUTO_ALERT_DECISION_TONE[e.decision]}`}>{AUTO_ALERT_DECISION_LABEL[e.decision]}</span>
                  <span className="text-white/60 truncate flex-1">{e.policyName} · {e.scoreSnapshot.opportunityType} · score {e.scoreSnapshot.score}</span>
                  <span className="text-white/35 shrink-0">{new Date(e.evaluatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          )}
        <p className="text-[10px] text-white/35 mt-2">"Criaria (shadow)" NÃO é um alerta real — apenas o que a política faria se a criação estivesse habilitada.</p>
      </div>

      {editing && (
        <AutoAlertPolicyEditor
          initial={editing}
          createEnabled={createEnabled}
          configEnabled={configEnabled}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load() }}
        />
      )}
    </div>
  )
}
