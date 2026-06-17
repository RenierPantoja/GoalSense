/**
 * RigorStudio — Radar Blueprint 4.2 premium confidence/rigor control
 * ─────────────────────────────────────────────────────────────────────────────
 * A rich, balanced composition: a large gauge ring, preset cards and a refined
 * slider — fills the sheet without dead space. Preserves minConfidence semantics.
 */
import type { ReactNode } from 'react'

type Action = 'register_alert' | 'suggest_only' | 'highlight'
const ACCENT = '#2DD4BF'
const PRESETS = [
  { label: 'Sensível', value: 40, hint: 'Mais sinais, menos rigor' },
  { label: 'Equilibrado', value: 50, hint: 'Volume e qualidade' },
  { label: 'Rigoroso', value: 70, hint: 'Menos sinais, mais rigor' },
]

function Gauge({ value, children }: { value: number; children: ReactNode }) {
  const size = 176, stroke = 12
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, value / 100)
  return (
    <span className="relative inline-grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} fill="none" />
        <defs>
          <linearGradient id="rigorGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#34E3CB" /><stop offset="100%" stopColor="#0E9E8C" /></linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="url(#rigorGrad)" strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${circ * pct} ${circ}`} style={{ transition: 'stroke-dasharray 0.45s ease' }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center">{children}</span>
    </span>
  )
}

export function RigorStudio({ value, onChange, action }: { value: number; onChange: (v: number) => void; action: Action }) {
  const zoneLabel = value < 45 ? 'Sensível' : value < 65 ? 'Equilibrado' : 'Rigoroso'
  return (
    <div className="max-w-[860px] mx-auto">
      <div className="flex flex-col md:flex-row items-center gap-8">
        {/* Gauge */}
        <Gauge value={value}>
          <div className="text-center">
            <span className="block text-[44px] font-semibold tabular-nums text-white/95 leading-none tracking-[-0.03em]">{value}<span className="text-[18px] text-white/40 font-medium">%</span></span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] mt-1.5" style={{ color: ACCENT }}>{zoneLabel}</span>
          </div>
        </Gauge>

        {/* Presets */}
        <div className="flex-1 w-full grid grid-cols-1 gap-2.5">
          {PRESETS.map(p => {
            const on = value === p.value
            return (
              <button key={p.label} type="button" onClick={() => onChange(p.value)}
                className="group flex items-center gap-3.5 rounded-[14px] border px-4 py-3.5 text-left transition-all"
                style={{ backgroundColor: '#202023', borderColor: on ? `${ACCENT}55` : 'rgba(255,255,255,0.08)', backgroundImage: on ? `radial-gradient(120% 100% at 0% 0%, ${ACCENT}1f, transparent 60%)` : 'none', boxShadow: on ? `0 0 0 1px ${ACCENT}33 inset` : 'none' }}>
                <span className="text-[20px] font-bold tabular-nums w-12 shrink-0" style={{ color: on ? ACCENT : 'rgba(255,255,255,0.5)' }}>{p.value}%</span>
                <div className="flex-1 min-w-0"><span className={`block text-[14px] font-semibold ${on ? 'text-white/95' : 'text-white/80'}`}>{p.label}</span><span className="block text-[11.5px] text-white/45">{p.hint}</span></div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Slider */}
      <div className="mt-8 rounded-[16px] border border-white/[0.07] bg-white/[0.025] px-5 py-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/40">Ajuste fino</span>
          <input type="number" value={value} min={20} max={95} onChange={e => onChange(Math.min(95, Math.max(20, Number(e.target.value))))} className="w-16 h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[13px] text-white/90 tabular-nums text-center outline-none focus:border-[#2DD4BF]/40" />
        </div>
        <input type="range" min={20} max={95} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full cursor-pointer" style={{ accentColor: ACCENT }} aria-label="Confiança mínima" />
        <div className="grid grid-cols-3 mt-2 text-[10px] font-semibold uppercase tracking-wider">
          <span className={value < 45 ? '' : 'text-white/30'} style={value < 45 ? { color: ACCENT } : undefined}>Sensível 40%</span>
          <span className={`text-center ${value >= 45 && value < 65 ? '' : 'text-white/30'}`} style={value >= 45 && value < 65 ? { color: ACCENT } : undefined}>Equilibrado 50%</span>
          <span className={`text-right ${value >= 65 ? '' : 'text-white/30'}`} style={value >= 65 ? { color: ACCENT } : undefined}>Rigoroso 70%</span>
        </div>
      </div>

      <p className="mt-4 text-center text-[12.5px] text-white/55 leading-relaxed max-w-[560px] mx-auto">
        Este radar só dispara com confiança ≥ <span className="text-white/90 font-semibold tabular-nums">{value}%</span>.
        {action === 'register_alert' && <> Alertas serão acompanhados pelo motor de resolução.</>}
        {action === 'suggest_only' && <> Aparecerá apenas como sugestão, sem registrar alerta.</>}
        {action === 'highlight' && <> Apenas destaca a partida no Scanner.</>}
      </p>
    </div>
  )
}
