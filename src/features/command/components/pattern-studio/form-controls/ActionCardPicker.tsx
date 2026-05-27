/**
 * ActionCardPicker — what the radar does on hit
 * ─────────────────────────────────────────────────────────────────────────────
 * Quiet horizontal cards. Active state uses a thin hairline and a barely
 * tinted background. No glow.
 */
type Action = 'register_alert' | 'suggest_only' | 'highlight'

interface ActionCardPickerProps {
  value: Action
  onChange: (v: Action) => void
}

export function ActionCardPicker({ value, onChange }: ActionCardPickerProps) {
  const opts: { v: Action; label: string; hint: string; badge: string; badgeTone: string; activeCls: string }[] = [
    { v: 'register_alert', label: 'Registrar alerta', hint: 'Vai para /app/alerts e é acompanhado pelo motor de resolução.', badge: 'Alerta', badgeTone: 'bg-emerald-500/10 text-emerald-200/85 border-emerald-400/20', activeCls: 'border-emerald-300/25 bg-emerald-500/[0.04]' },
    { v: 'suggest_only', label: 'Apenas sugerir', hint: 'Aparece no Cockpit e no Scanner sem registrar alerta.', badge: 'Sugestão', badgeTone: 'bg-white/[0.04] text-white/65 border-white/[0.08]', activeCls: 'border-white/[0.12] bg-white/[0.025]' },
    { v: 'highlight', label: 'Destacar no Scanner', hint: 'Marca visualmente sem registrar nada.', badge: 'Visual', badgeTone: 'bg-cyan-500/10 text-cyan-200/85 border-cyan-400/15', activeCls: 'border-cyan-300/25 bg-cyan-500/[0.04]' },
  ]
  return (
    <div className="grid grid-cols-1 gap-2">
      {opts.map(o => {
        const isActive = value === o.v
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            type="button"
            aria-pressed={isActive}
            className={`group w-full flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors duration-200 ${isActive ? o.activeCls : 'border-white/[0.06] bg-white/[0.012] hover:border-white/[0.1] hover:bg-white/[0.022]'}`}
          >
            <span className={`mt-[3px] h-3.5 w-3.5 rounded-full shrink-0 border transition-colors ${isActive ? 'border-white/65 bg-white/85' : 'border-white/25 bg-transparent group-hover:border-white/45'}`}>
              {isActive && <span className="block h-full w-full rounded-full" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[13px] font-semibold tracking-tight ${isActive ? 'text-white/95' : 'text-white/85'}`}>{o.label}</span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${o.badgeTone}`}>{o.badge}</span>
              </div>
              <p className="text-[11.5px] text-white/55 leading-snug mt-1">{o.hint}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
