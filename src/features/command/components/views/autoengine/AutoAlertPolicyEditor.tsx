/**
 * AutoAlertPolicyEditor — create/edit an Auto Alert Policy. (B25)
 * ─────────────────────────────────────────────────────────────────────────────
 * Explicit configuration. Auto-create mode requires a strong confirmation and is
 * disabled when ENABLE_AUTO_ALERT_CREATE is off. Poor/unknown data toggles show
 * danger warnings. Never saves without confirmation. No betting language.
 */
import { useState } from 'react'
import { X, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react'
import { autoEngineApi } from '@/services/autoEngineApi'
import type { AutoAlertPolicyDto, AutoAlertPolicyMode } from '@/features/command/intelligence/autoEngineTypes'
import { AUTO_ALERT_MODE_LABEL } from '@/features/command/intelligence/autoEngineTypes'

interface Props {
  initial: AutoAlertPolicyDto
  createEnabled: boolean       // ENABLE_AUTO_ALERT_CREATE
  configEnabled: boolean       // ENABLE_AUTO_ALERT_POLICY_CONFIG
  onClose: () => void
  onSaved: (p: AutoAlertPolicyDto) => void
}

const MODES: AutoAlertPolicyMode[] = ['disabled', 'shadow_only', 'suggest_manual', 'auto_create_monitored']
const SAMPLE_QUALITIES = ['low', 'moderate', 'strong'] as const

export function AutoAlertPolicyEditor({ initial, createEnabled, configEnabled, onClose, onSaved }: Props) {
  const [p, setP] = useState<AutoAlertPolicyDto>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmAuto, setConfirmAuto] = useState(false)
  const isNew = !initial.id || initial.id.startsWith('aap_template')
  const set = (patch: Partial<AutoAlertPolicyDto>) => setP(prev => ({ ...prev, ...patch }))

  const autoMode = p.mode === 'auto_create_monitored'
  const canSubmit = configEnabled && (!autoMode || (createEnabled && confirmAuto)) && !saving

  const save = async () => {
    setSaving(true); setError(null)
    const payload: Partial<AutoAlertPolicyDto> = { ...p }
    const r = isNew ? await autoEngineApi.createAutoAlertPolicy(payload) : await autoEngineApi.updateAutoAlertPolicy(p.id, payload)
    if (r.disabled) { setError(r.error || 'Configuração de política desabilitada (ENABLE_AUTO_ALERT_POLICY_CONFIG).'); setSaving(false); return }
    if (r.ok && r.data) { onSaved(r.data) } else { setError(r.error || 'Falha ao salvar a política.') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#05080d]/82 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-[640px] max-h-[88vh] flex flex-col rounded-2xl border border-white/[0.1] bg-[#0b0f16] overflow-hidden animate-fadeIn">
        <header className="shrink-0 px-5 pt-5 pb-4 border-b border-white/[0.07] flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-semibold text-white/95 tracking-tight">{isNew ? 'Nova política de alerta automático' : 'Editar política'}</h3>
            <p className="text-[12px] text-white/50 mt-0.5">Shadow-first. Criar alerta automático exige flags do backend + confirmação. Sem Telegram, sem odds.</p>
          </div>
          <button onClick={onClose} type="button" aria-label="Fechar" className="h-8 w-8 rounded-full grid place-items-center text-white/55 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white/90 transition-colors shrink-0"><X size={15} /></button>
        </header>

        <div className="flex-1 overflow-y-auto sidebar-scroll p-5 space-y-4">
          {!configEnabled && <div className="rounded-xl border border-amber-400/18 bg-amber-500/[0.05] px-4 py-2.5 text-[12px] text-amber-100/75">Edição desabilitada: defina ENABLE_AUTO_ALERT_POLICY_CONFIG=true no backend para salvar.</div>}

          <Field label="Nome"><input value={p.name} onChange={e => set({ name: e.target.value })} className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-white/90 outline-none focus:border-[#2DD4BF]/40" /></Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Modo">
              <select value={p.mode} onChange={e => set({ mode: e.target.value as AutoAlertPolicyMode })} className="w-full h-9 px-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-white/90 outline-none focus:border-[#2DD4BF]/40">
                {MODES.map(m => <option key={m} value={m} disabled={m === 'auto_create_monitored' && !createEnabled} className="bg-[#0b0f16]">{AUTO_ALERT_MODE_LABEL[m]}{m === 'auto_create_monitored' && !createEnabled ? ' (flag off)' : ''}</option>)}
              </select>
            </Field>
            <Field label="Habilitada">
              <label className="flex items-center gap-2 h-9 px-2"><input type="checkbox" checked={p.enabled} onChange={e => set({ enabled: e.target.checked })} className="accent-[#13B8A6]" /><span className="text-[12px] text-white/70">{p.enabled ? 'Sim' : 'Não'}</span></label>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Score mínimo"><input type="number" min={0} max={100} value={p.minScore} onChange={e => set({ minScore: Number(e.target.value) })} className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-white/90 outline-none focus:border-[#2DD4BF]/40" /></Field>
            <Field label="Amostra mínima (calibração)">
              <select value={p.minSampleQuality} onChange={e => set({ minSampleQuality: e.target.value as any })} className="w-full h-9 px-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-white/90 outline-none focus:border-[#2DD4BF]/40">
                {SAMPLE_QUALITIES.map(s => <option key={s} value={s} className="bg-[#0b0f16]">{s}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Máx. por jogo"><input type="number" min={0} max={50} value={p.maxPerFixture} onChange={e => set({ maxPerFixture: Number(e.target.value) })} className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-white/90 outline-none focus:border-[#2DD4BF]/40" /></Field>
            <Field label="Máx. por scan"><input type="number" min={0} max={200} value={p.maxPerRun} onChange={e => set({ maxPerRun: Number(e.target.value) })} className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-white/90 outline-none focus:border-[#2DD4BF]/40" /></Field>
          </div>

          <Field label="Qualidade de dados permitida (separe por vírgula)">
            <input value={p.allowedDataQuality.join(', ')} onChange={e => set({ allowedDataQuality: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="rich, partial" className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-white/90 outline-none focus:border-[#2DD4BF]/40" />
          </Field>

          <div className="space-y-2.5 rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
            <Toggle label="Exigir calibração (B24)" checked={p.requireCalibration} onChange={v => set({ requireCalibration: v })} />
            <Toggle label="Exigir ausência de bloqueios críticos" checked={p.requireNoCriticalBlockers} onChange={v => set({ requireNoCriticalBlockers: v })} />
            <Toggle label="Exigir perfil de aprendizado" checked={p.requireLearningProfile} onChange={v => set({ requireLearningProfile: v })} />
            <Toggle label="Permitir dados desconhecidos (perigoso)" checked={p.allowUnknownData} onChange={v => set({ allowUnknownData: v })} danger={p.allowUnknownData} />
            <Toggle label="Permitir dados pobres (perigoso)" checked={p.allowPoorData} onChange={v => set({ allowPoorData: v })} danger={p.allowPoorData} />
          </div>

          {(p.allowPoorData || p.allowUnknownData) && (
            <div className="rounded-xl border border-rose-400/18 bg-rose-500/[0.05] px-4 py-2.5 text-[12px] text-rose-200/80 flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />Permitir dados pobres/desconhecidos aumenta o risco de alertas fracos. Recomendado manter desligado.</div>
          )}

          {autoMode && (
            <div className="rounded-xl border border-amber-400/22 bg-amber-500/[0.06] p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-amber-200/85"><AlertTriangle size={14} /><span className="text-[12.5px] font-semibold">Modo criar alerta automático</span></div>
              <p className="text-[11.5px] text-amber-100/75">Mesmo neste modo, alertas só são criados se o backend tiver ENABLE_AUTO_ALERT_POLICY + ENABLE_AUTO_ALERT_CREATE + ENABLE_AUTO_ENGINE_TO_ALERTS. Caso contrário, fica em shadow. Sem Telegram, sem odds, sem aposta.</p>
              <label className="flex items-start gap-2.5 cursor-pointer"><input type="checkbox" checked={confirmAuto} onChange={e => setConfirmAuto(e.target.checked)} className="mt-0.5 accent-[#13B8A6]" /><span className="text-[12px] text-amber-100/80">Entendo que isto pode criar alertas monitorados automaticamente quando todas as flags estiverem ligadas, e que não é garantia de acerto.</span></label>
            </div>
          )}

          {error && <div className="rounded-xl border border-rose-400/18 bg-rose-500/[0.05] px-4 py-3 text-[12px] text-rose-200/80">{error}</div>}
        </div>

        <footer className="shrink-0 px-5 py-4 border-t border-white/[0.07] bg-black/15 flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-[11px] text-white/40 mr-auto"><ShieldCheck size={13} className="text-[#5EEAD4]/70" />Shadow por padrão — nada é criado sem flags + política.</div>
          <button onClick={onClose} type="button" className="px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-white/60 hover:text-white/90 transition-colors">Cancelar</button>
          <button onClick={save} type="button" disabled={!canSubmit} className="px-5 py-2.5 rounded-[10px] text-[13px] font-semibold text-white bg-[#13B8A6] hover:bg-[#0FA594] transition-colors disabled:opacity-30 inline-flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}Salvar política
          </button>
        </footer>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 block mb-1.5">{label}</span>{children}</label>
}
function Toggle({ label, checked, onChange, danger }: { label: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className={`text-[12px] ${danger ? 'text-rose-200/80' : 'text-white/70'}`}>{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-[#13B8A6]" />
    </label>
  )
}
