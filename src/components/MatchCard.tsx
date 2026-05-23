import type { LiveFixture } from '../types'

export function MatchCard({ fixture }: { fixture: LiveFixture }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4 transition hover:border-cyan-500/40">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{fixture.league}</span>
        <span className="rounded bg-slate-700 px-2 py-0.5 font-mono">
          {fixture.minute}'
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="space-y-1">
          <div className="font-medium">{fixture.homeTeam}</div>
          <div className="text-slate-400">{fixture.awayTeam}</div>
        </div>
        <div className="text-right text-2xl font-bold tabular-nums">
          <div>{fixture.homeScore}</div>
          <div className="text-slate-400">{fixture.awayScore}</div>
        </div>
      </div>

      {(fixture.homeStats || fixture.awayStats) && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-slate-400">
          <Stat label="Posse" home={`${fixture.homeStats?.possession ?? '-'}%`} away={`${fixture.awayStats?.possession ?? '-'}%`} />
          <Stat label="Chutes" home={String(fixture.homeStats?.shots ?? '-')} away={String(fixture.awayStats?.shots ?? '-')} />
          <Stat label="Escanteios" home={String(fixture.homeStats?.corners ?? '-')} away={String(fixture.awayStats?.corners ?? '-')} />
        </div>
      )}
    </div>
  )
}

function Stat({ label, home, away }: { label: string; home: string; away: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-500">{label}</div>
      <div>{home} - {away}</div>
    </div>
  )
}
