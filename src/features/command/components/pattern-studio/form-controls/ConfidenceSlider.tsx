/**
 * ConfidenceSlider — calibration ruler
 * ─────────────────────────────────────────────────────────────────────────────
 * Big numeric display, large slider, three-zone label. No glow, neutral
 * surface. Microcopy switches based on the chosen action so the user knows
 * exactly what happens when the radar hits at this confidence.
 */
type Action = 'register_alert' | 'suggest_only' | 'highlight'

interface ConfidenceSliderProps {
  value: number
  onChange: (v: number) => void
  action: Action
}

export function ConfidenceSlider({ value, onChange, action }: ConfidenceSliderProps) {
  const zone = value < 60 ? 'sensible' : value < 75 ? 'balanced' : 'strict'
  const zoneLabel = zone === 'sensible' ? 'Sensível' : zone === 'balanced' ? 'Equilibrado' : 'Rigoroso'
  const zoneTone = zone === 'sensible' ? 'text-amber-200/85' : zone === 'balanced' ? 'text-cyan-200/85' : 'text-emerald-200/85'
  const zoneHint = zone === 'sensible'
    ? 'Mais sinais, menor rigor.'
    : zone === 'balanced'
    ? 'Equilíbrio entre volume e qualidade.'
    : 'Menos sinais, maior rigor.'
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-5">
        <div className="flex items-baseline justify-between mb-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Confiança mínima</span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[40px] font-semibold tabular-nums text-white/95 leading-none tracking-tight">{value}</span>
            <span className="text-[14px] text-white/40 font-medium">%</span>
          </span>
        </div>
        {/* Slider */}
        <input
          type="range"
          min={20}
          max={95}
          value={value}
          onChange={e => onChange(Math.min(100, Math.max(0, Number(e.target.value))))}
          className="w-full accent-white cursor-pointer"
          aria-label="Confiança mínima em porcentagem"
        />
        {/* Zone ruler */}
        <div className="grid grid-cols-3 mt-3 gap-1 text-[10px] font-semibold uppercase tracking-wider">
          <span className={`${zone === 'sensible' ? 'text-amber-200/85' : 'text-white/30'}`}>Sensível</span>
          <span className={`text-center ${zone === 'balanced' ? 'text-cyan-200/85' : 'text-white/30'}`}>Equilibrado</span>
          <span className={`text-right ${zone === 'strict' ? 'text-emerald-200/85' : 'text-white/30'}`}>Rigoroso</span>
        </div>
        <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center gap-3">
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${zoneTone}`}>{zoneLabel}</span>
          <span className="text-[11.5px] text-white/55 leading-snug">{zoneHint}</span>
          <input
            type="number"
            value={value}
            onChange={e => onChange(Math.min(100, Math.max(0, Number(e.target.value))))}
            className="ml-auto w-16 h-9 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 text-[12px] text-white/90 tabular-nums text-center outline-none focus:border-white/35 focus:bg-white/[0.04] transition-colors"
            min={0}
            max={100}
            aria-label="Valor numérico da confiança"
          />
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.008] px-4 py-3">
        <p className="text-[12px] text-white/75 leading-relaxed">
          Este radar só dispara com confiança ≥ <span className="text-white/95 font-semibold tabular-nums">{value}%</span>.
          {action === 'register_alert' && <> Alertas serão acompanhados pelo motor de resolução em <span className="text-white/85 font-medium">/app/alerts</span>.</>}
          {action === 'suggest_only' && <> Aparecerá apenas como sugestão no Cockpit, sem registrar alerta.</>}
          {action === 'highlight' && <> Apenas destaca a partida no Scanner.</>}
        </p>
      </div>
    </div>
  )
}
