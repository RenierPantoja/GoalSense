/**
 * ActionCardPicker — what the radar does on hit (premium selectable cards)
 * ─────────────────────────────────────────────────────────────────────────────
 * Large, depth-rich option cards with gradient icon tiles, a clear selected
 * state (accent ring + check) and operational copy. No generic radio rows.
 */
import { BellRing, Lightbulb, Eye, Check } from 'lucide-react'
import type { ReactNode } from 'react'

type Action = 'register_alert' | 'suggest_only' | 'highlight'

interface ActionCardPickerProps {
  value: Action
  onChange: (v: Action) => void
}

const OPTS: { v: Action; label: string; badge: string; hint: string; from: string; to: string; accent: string; icon: ReactNode }[] = [
  { v: 'register_alert', label: 'Registrar alerta', badge: 'Acompanhado', hint: 'Cria um alerta em /app/alerts e é acompanhado pelo motor de resolução até confirmar ou descartar.', from: '#4ADE80', to: '#1FA855', accent: '#34D399', icon: <BellRing size={20} /> },
  { v: 'suggest_only', label: 'Apenas sugerir', badge: 'Sugestão', hint: 'Aparece no Cockpit e no Scanner como sugestão, sem registrar um alerta.', from: '#FFC75A', to: '#F08E1B', accent: '#FFB02E', icon: <Lightbulb size={20} /> },
  { v: 'highlight', label: 'Destacar no Scanner', badge: 'Visual', hint: 'Apenas marca visualmente a partida no Scanner, sem registrar nada.', from: '#5AA2FF', to: '#2D6FE0', accent: '#3B82F6', icon: <Eye size={20} /> },
]

export function ActionCardPicker({ value, onChange }: ActionCardPickerProps) {
  return (
    <div className="max-w-[680px] mx-auto grid grid-cols-1 gap-3">
      {OPTS.map(o => {
        const on = value === o.v
        return (
          <button key={o.v} onClick={() => onChange(o.v)} type="button" aria-pressed={on}
            className="group relative w-full flex items-center gap-4 rounded-[18px] border px-5 py-4 text-left transition-all duration-200 overflow-hidden"
            style={{
              backgroundColor: '#202023',
              backgroundImage: on ? `radial-gradient(120% 100% at 0% 0%, ${o.accent}24, transparent 60%)` : 'none',
              borderColor: on ? `${o.accent}55` : 'rgba(255,255,255,0.08)',
              boxShadow: on ? `0 0 0 1px ${o.accent}33 inset, 0 12px 28px -16px rgba(0,0,0,0.7)` : '0 1px 0 rgba(255,255,255,0.04) inset',
            }}>
            <span className="h-12 w-12 rounded-[13px] grid place-items-center text-white shrink-0 ring-1 ring-inset ring-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_10px_-2px_rgba(0,0,0,0.5)]" style={{ backgroundImage: `linear-gradient(155deg, ${o.from}, ${o.to})` }}>{o.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[15px] font-semibold tracking-[-0.01em] ${on ? 'text-white/95' : 'text-white/85'}`}>{o.label}</span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border" style={{ color: o.accent, borderColor: `${o.accent}40`, backgroundColor: `${o.accent}14` }}>{o.badge}</span>
              </div>
              <p className="text-[12.5px] text-white/55 leading-snug mt-1">{o.hint}</p>
            </div>
            <span className={`h-6 w-6 rounded-full grid place-items-center shrink-0 transition-all ${on ? 'text-[#06121a]' : 'text-transparent border border-white/15'}`} style={on ? { backgroundColor: o.accent } : undefined}>
              {on && <Check size={14} strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
