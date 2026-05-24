/**
 * Pattern Journey Card — explains the lifecycle of a pattern in pre-match context.
 * Does NOT trigger alerts. Purely informational.
 */

export function PatternJourneyCard() {
  return (
    <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.01] p-5">
      <h4 className="text-[12px] font-semibold text-white/55 mb-3">Jornada do padrão</h4>
      <div className="flex items-start gap-4">
        <Step num={1} label="Pré-jogo" desc="Padrões são identificados como monitoráveis" active />
        <Connector />
        <Step num={2} label="Ao vivo" desc="Se condições forem atendidas, alerta é registrado" />
        <Connector />
        <Step num={3} label="Pós-jogo" desc="Resultado alimenta Performance e Base GoalSense" />
      </div>
      <p className="text-[10px] text-white/25 mt-3">Pré-jogo não dispara alerta. Apenas prepara o monitoramento para quando a partida começar.</p>
    </div>
  )
}

function Step({ num, label, desc, active }: { num: number; label: string; desc: string; active?: boolean }) {
  return (
    <div className="flex-1 text-center">
      <div className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-[11px] font-bold mb-1.5 ${active ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' : 'bg-white/[0.04] text-white/35 border border-white/[0.06]'}`}>{num}</div>
      <p className="text-[11px] text-white/55 font-medium">{label}</p>
      <p className="text-[9px] text-white/25 mt-0.5">{desc}</p>
    </div>
  )
}

function Connector() {
  return <div className="flex items-center pt-3"><div className="h-px w-6 bg-white/[0.08]" /></div>
}
