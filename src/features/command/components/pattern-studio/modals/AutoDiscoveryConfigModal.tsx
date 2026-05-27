/**
 * AutoDiscoveryConfigModal — control panel for the auto discovery engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Behaviour fully preserved from the inline implementation in
 * CommandCenterPage.tsx (V3.18D). The engine still requires explicit user
 * configuration (`userConfigured`) before running and exposes:
 * - coverage toggles (favorites / main leagues / all leagues)
 * - momento toggles (pre-match / live)
 * - quality controls (min confidence, max alerts per match, anti-duplicate)
 * - acao (registerAlertAuto)
 * - safety summary tied to the configured registration mode
 */
import type { AutoDiscoveryConfig } from '../../../types/commandTypes'
import { ModalShell } from '../shell/ModalShell'
import { Section } from '../shell/Section'
import { ToggleSettingRow } from '../shell/ToggleSettingRow'

export interface AutoDiscoveryConfigModalProps {
  open: boolean
  config: AutoDiscoveryConfig
  onClose: () => void
  onChange: (p: Partial<AutoDiscoveryConfig>) => void
  onActivate: () => void
  onDeactivate: () => void
}

export function AutoDiscoveryConfigModal({ open, config, onClose, onChange, onActivate, onDeactivate }: AutoDiscoveryConfigModalProps) {
  const isActive = config.enabled && config.userConfigured
  const statusLabel = isActive ? 'Monitorando' : config.userConfigured ? 'Configurado' : 'Desligado'
  return (
    <ModalShell open={open} onClose={onClose} title="Motor automático" subtitle="Configure como o GoalSense pode sugerir ou registrar descobertas automáticas." maxWidth="max-w-[1040px]"
      headerExtra={
        <div className="flex items-center gap-3 text-[11px] text-white/45">
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-400/85' : config.userConfigured ? 'bg-cyan-300/80' : 'bg-white/30'}`} />
            <span className="text-white/55">{statusLabel}</span>
          </span>
          <span className="text-white/20">·</span>
          <span>Confiança ≥ <span className="text-white/75 font-medium tabular-nums">{config.minConfidence}%</span></span>
          <span className="text-white/20">·</span>
          <span className={config.registerAlertAuto ? 'text-emerald-200/75' : 'text-white/45'}>{config.registerAlertAuto ? 'Registrando alertas' : 'Apenas sugerindo'}</span>
        </div>
      }
      footer={
        <>
          <button onClick={onClose} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-medium text-white/65 border border-white/[0.07] hover:text-white/95 hover:border-white/[0.12] transition-colors mr-auto">Cancelar</button>
          {isActive && <button onClick={onDeactivate} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-rose-300 border border-rose-400/20 bg-rose-500/8 hover:bg-rose-500/15 transition-all">Desativar motor</button>}
          {config.userConfigured && !isActive && <button onClick={() => onChange({ enabled: false })} type="button" className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white/85 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-all">Salvar configuração</button>}
          <button onClick={onActivate} type="button" className="px-5 py-2.5 rounded-xl text-[12px] font-semibold bg-white/[0.95] hover:bg-white border border-white/30 transition-colors duration-200" style={{ color: '#0b0d12' }}>{isActive ? 'Salvar configuração' : 'Salvar e ativar motor'}</button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* HERO STATUS — quiet native banner */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-5">
            <div className="flex items-start gap-4">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border ${isActive ? 'bg-emerald-500/[0.06] border-emerald-400/15' : config.userConfigured ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-white/[0.03] border-white/[0.06]'}`}>
                <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-400/85 animate-pulse' : config.userConfigured ? 'bg-cyan-300/80' : 'bg-white/30'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[14px] font-semibold text-white/95 mb-0.5 tracking-tight">
                  {isActive ? 'Motor automático monitorando' : config.userConfigured ? 'Motor configurado, mas pausado' : 'Motor automático desligado'}
                </h4>
                <p className="text-[12px] text-white/55 leading-relaxed">
                  {isActive
                    ? <>Descobrindo padrões com confiança ≥ <span className="text-white/85 font-medium tabular-nums">{config.minConfidence}%</span>. {config.registerAlertAuto ? 'Registrando alertas automaticamente.' : 'Apenas sugerindo, sem registrar alerta.'}</>
                    : config.userConfigured
                      ? 'Configuração salva. Ative o motor para começar a monitorar partidas.'
                      : 'Configure as preferências abaixo e ative para que o GoalSense procure padrões automaticamente.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* LEFT COLUMN */}
        <div className="space-y-5">
          <Section title="Cobertura" hint="Quais partidas o motor pode analisar.">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.008] px-5 py-3">
              <ToggleSettingRow title="Monitorar favoritos" description="Inclui partidas com times favoritos." checked={config.monitorFavorites} onChange={v => onChange({ monitorFavorites: v })} />
              <ToggleSettingRow title="Ligas principais" description="Brasileirão, Premier League, La Liga e equivalentes." checked={config.monitorMainLeagues} onChange={v => onChange({ monitorMainLeagues: v })} />
              <ToggleSettingRow title="Todas as ligas" description="Inclui partidas de todas as competições disponíveis." checked={config.monitorAllLeagues} onChange={v => onChange({ monitorAllLeagues: v })} />
            </div>
          </Section>

          <Section title="Momentos do jogo" hint="Quando o motor pode procurar sinais.">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.008] px-5 py-3">
              <ToggleSettingRow title="Incluir pré-jogo" description="Sinais antes da bola rolar (forma, H2H, perfil de gols)." checked={config.includePreMatch} onChange={v => onChange({ includePreMatch: v })} />
              <ToggleSettingRow title="Incluir ao vivo" description="Sinais durante a partida com base em estatísticas reais." checked={config.includeLive} onChange={v => onChange({ includeLive: v })} />
            </div>
          </Section>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">
          <Section title="Qualidade" hint="Limites para evitar ruído e duplicidade.">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.008] p-4 space-y-3">
              <div>
                <label className="text-[11px] text-white/65 block mb-1.5 font-medium">Confiança mínima</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={20} max={95} value={config.minConfidence} onChange={e => onChange({ minConfidence: Number(e.target.value) })} className="flex-1 accent-cyan-400" />
                  <input type="number" value={config.minConfidence} onChange={e => onChange({ minConfidence: Number(e.target.value) })} className="w-20 h-9 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-white/95 tabular-nums text-center outline-none focus:border-cyan-400/40" min={20} max={95} />
                  <span className="text-[12px] text-white/65 font-semibold">%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-white/65 block mb-1.5 font-medium">Máx. alertas/jogo</label>
                  <input type="number" value={config.maxAlertsPerMatch} onChange={e => onChange({ maxAlertsPerMatch: Number(e.target.value) })} className="w-full h-10 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-white/95 tabular-nums outline-none focus:border-cyan-400/40" min={1} max={10} />
                </div>
                <div>
                  <label className="text-[11px] text-white/65 block mb-1.5 font-medium">Anti-duplicidade (min)</label>
                  <input type="number" value={config.antiDuplicateMinutes} onChange={e => onChange({ antiDuplicateMinutes: Number(e.target.value) })} className="w-full h-10 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-white/95 tabular-nums outline-none focus:border-cyan-400/40" min={1} max={60} />
                </div>
              </div>
            </div>
          </Section>

          <Section title="Ação" hint="O que fazer quando o motor descobrir um sinal.">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.008] px-5 py-3">
              <ToggleSettingRow title="Registrar alerta automaticamente" description="Quando ativo, descobertas viram alertas em /app/alerts e são acompanhadas pelo motor de resolução. Quando desligado, descobertas só aparecem como sugestões no Cockpit/Scanner." checked={config.registerAlertAuto} onChange={v => onChange({ registerAlertAuto: v })} />
            </div>
          </Section>

          <Section title="Segurança">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.008] px-4 py-3.5">
              <p className="text-[11.5px] text-white/75 leading-relaxed">
                <span className="text-white/95 font-semibold">Motor automático só roda após salvar e ativar.</span><br />
                {config.registerAlertAuto
                  ? <>Descobertas com confiança ≥ <span className="text-white/90 font-semibold tabular-nums">{config.minConfidence}%</span> serão registradas automaticamente em <span className="text-white/85 font-medium">/app/alerts</span>.</>
                  : <>Configurado como <span className="text-white/90 font-semibold">apenas sugerir</span> — o motor <span className="text-white/95 font-semibold">não registrará alertas</span>.</>
                }
              </p>
            </div>
          </Section>
        </div>
      </div>
    </ModalShell>
  )
}
