/**
 * SeverityPicker — quiet, native priority cards
 * ─────────────────────────────────────────────────────────────────────────────
 * Three compact cards. The active state uses a thin colored hairline and a
 * barely-there tinted background; no glow, no oversized shadow.
 */
type Severity = 'critical' | 'attention' | 'info'

interface SeverityPickerProps {
  value: Severity
  onChange: (v: Severity) => void
}

export function SeverityPicker({ value, onChange }: SeverityPickerProps) {
  const opts: { v: Severity; label: string; hint: string; example: string; activeCls: string; dot: string }[] = [
    { v: 'critical', label: 'Crítico', hint: 'Sinal forte, atenção imediata.', example: 'Ex.: pressão extrema na reta final.', activeCls: 'border-rose-300/30 bg-rose-500/[0.05]', dot: 'bg-rose-300/85' },
    { v: 'attention', label: 'Atenção', hint: 'Sinal relevante, sem urgência.', example: 'Ex.: jogo aberto com gols possíveis.', activeCls: 'border-amber-300/30 bg-amber-500/[0.05]', dot: 'bg-amber-300/85' },
    { v: 'info', label: 'Informação', hint: 'Observação contextual.', example: 'Ex.: estatística para análise.', activeCls: 'border-cyan-300/25 bg-cyan-500/[0.04]', dot: 'bg-cyan-300/85' },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {opts.map(o => {
        const isActive = value === o.v
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            type="button"
            aria-pressed={isActive}
            className={`text-left rounded-xl border px-4 py-3.5 transition-colors duration-200 ${isActive ? o.activeCls : 'border-white/[0.06] bg-white/[0.012] hover:border-white/[0.1] hover:bg-white/[0.02]'}`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${o.dot} ${isActive ? '' : 'opacity-50'}`} />
              <span className={`text-[13px] font-semibold tracking-tight ${isActive ? 'text-white/95' : 'text-white/80'}`}>{o.label}</span>
            </div>
            <p className="text-[11px] text-white/55 leading-snug">{o.hint}</p>
            <p className="text-[10.5px] text-white/35 leading-snug mt-1.5">{o.example}</p>
          </button>
        )
      })}
    </div>
  )
}
