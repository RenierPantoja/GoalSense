/**
 * Onboarding Modal — shown once for new users.
 * Explains the GoalSense cycle. Non-blocking, dismissible.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Target, Zap, BarChart3, Calendar } from 'lucide-react'

const ONBOARDING_KEY = 'goalsense_onboarding_seen'

export function useOnboarding() {
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(ONBOARDING_KEY) === 'true' } catch { return false } })
  const dismiss = () => { setSeen(true); try { localStorage.setItem(ONBOARDING_KEY, 'true') } catch {} }
  return { showOnboarding: !seen, dismiss }
}

export function OnboardingModal({ onDismiss }: { onDismiss: () => void }) {
  const navigate = useNavigate()
  const go = (path: string) => { onDismiss(); navigate(path) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onDismiss}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-[600px] rounded-[28px] border border-white/[0.08] bg-[#0b1018] p-8 shadow-[0_32px_100px_-20px_rgba(0,0,0,0.8)] animate-scaleIn">
        <h2 className="text-[22px] font-bold text-white/90 mb-2">Bem-vindo ao GoalSense</h2>
        <p className="text-[14px] text-white/45 mb-6">Uma central de inteligência para acompanhar partidas, criar padrões, receber alertas e validar resultados.</p>

        <div className="space-y-3 mb-6">
          <Step icon={Activity} title="Live Radar" desc="Acompanhe jogos ao vivo e sinais em tempo real" />
          <Step icon={Calendar} title="Partidas" desc="Calendário, pré-jogo, Score GoalSense e análise antes da bola rolar" />
          <Step icon={Target} title="Command Center" desc="Crie padrões e configure o motor para detectar oportunidades" />
          <Step icon={Zap} title="Alertas" desc="Quando um padrão bate, o alerta é registrado e depois confirmado ou falhado" />
          <Step icon={BarChart3} title="Performance" desc="O GoalSense aprende com o histórico e melhora sua leitura" />
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={() => go('/app/live')} className="px-5 py-2.5 rounded-xl text-[12px] font-semibold bg-cyan-500/12 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/18 transition-colors" type="button">Começar pelo Live Radar</button>
          <button onClick={() => go('/app/matches')} className="px-5 py-2.5 rounded-xl text-[12px] font-medium text-white/50 border border-white/[0.07] hover:text-white/70 transition-colors" type="button">Ver partidas</button>
          <button onClick={() => go('/app/command')} className="px-5 py-2.5 rounded-xl text-[12px] font-medium text-white/50 border border-white/[0.07] hover:text-white/70 transition-colors" type="button">Command Center</button>
          <button onClick={onDismiss} className="px-5 py-2.5 rounded-xl text-[12px] text-white/30 hover:text-white/50 transition-colors" type="button">Pular</button>
        </div>
      </div>
    </div>
  )
}

function Step({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-white/[0.02] border border-white/[0.05] px-4 py-3">
      <Icon size={18} className="text-cyan-400/50 mt-0.5 shrink-0" />
      <div><span className="text-[13px] font-medium text-white/70 block">{title}</span><span className="text-[11px] text-white/35">{desc}</span></div>
    </div>
  )
}
