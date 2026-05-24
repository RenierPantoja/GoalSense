/**
 * Favorites Page — shows all user favorites (teams, leagues, matches).
 */
import { useNavigate } from 'react-router-dom'
import { Heart, Trophy, Shield, X } from 'lucide-react'
import { useFavorites } from '@/context/FavoritesContext'
import { ClubLogo } from '@/components/ui/ClubLogo'

export function FavoritesPage() {
  const navigate = useNavigate()
  const { teams, leagues, matches, toggleFavoriteTeam, toggleFavoriteLeague, toggleFavoriteMatch } = useFavorites()
  const total = teams.length + leagues.length + matches.length

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <header>
        <h1 className="text-[24px] font-bold text-white tracking-tight">Favoritos</h1>
        <p className="text-[13px] text-white/35 mt-1">Times, ligas e partidas que você acompanha</p>
      </header>

      {total === 0 && (
        <div className="rounded-[24px] border border-white/[0.05] bg-white/[0.015] py-16 text-center">
          <Heart size={28} className="mx-auto text-white/15 mb-3" />
          <p className="text-[15px] text-white/40 font-medium">Nenhum favorito ainda</p>
          <p className="text-[12px] text-white/25 mt-1.5 max-w-[360px] mx-auto">Favorite times, ligas ou partidas para acompanhar de perto e receber sinais personalizados.</p>
          <div className="flex justify-center gap-3 mt-5">
            <button onClick={() => navigate('/app/matches')} className="px-5 py-2.5 rounded-xl text-[12px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/15 transition-colors" type="button">Explorar partidas</button>
            <button onClick={() => navigate('/app/leagues')} className="px-5 py-2.5 rounded-xl text-[12px] font-medium text-white/40 border border-white/[0.06] hover:text-white/60 transition-colors" type="button">Ver ligas</button>
          </div>
        </div>
      )}

      {teams.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/40 mb-3 flex items-center gap-2"><Shield size={14} className="text-white/25" />Times ({teams.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teams.map(t => (
              <div key={t.id} className="flex items-center gap-3 rounded-[18px] border border-white/[0.06] bg-white/[0.015] px-5 py-4">
                <ClubLogo src={t.logo} name={t.name} size={32} />
                <span className="text-[14px] font-medium text-white/70 flex-1">{t.name}</span>
                <button onClick={() => toggleFavoriteTeam({ name: t.name, logo: t.logo })} className="text-white/20 hover:text-rose-400/60 transition-colors p-1" type="button"><X size={14} /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {leagues.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/40 mb-3 flex items-center gap-2"><Trophy size={14} className="text-white/25" />Ligas ({leagues.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {leagues.map(l => (
              <div key={l.id} className="flex items-center gap-3 rounded-[18px] border border-white/[0.06] bg-white/[0.015] px-5 py-4">
                {l.logo && <img src={l.logo} alt="" className="h-6 w-6 object-contain" />}
                <span className="text-[14px] font-medium text-white/70 flex-1">{l.name}</span>
                <button onClick={() => toggleFavoriteLeague({ id: l.id, name: l.name, logo: l.logo })} className="text-white/20 hover:text-rose-400/60 transition-colors p-1" type="button"><X size={14} /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {matches.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/40 mb-3">Partidas ({matches.length})</h2>
          <div className="space-y-2">
            {matches.map(m => (
              <div key={m.canonicalMatchId} className="flex items-center gap-3 rounded-[18px] border border-white/[0.06] bg-white/[0.015] px-5 py-3.5">
                <span className="text-[13px] text-white/60 flex-1">{m.homeTeam} x {m.awayTeam}</span>
                <span className="text-[11px] text-white/25">{m.competition}</span>
                <button onClick={() => toggleFavoriteMatch({ canonicalMatchId: m.canonicalMatchId, homeTeam: m.homeTeam, awayTeam: m.awayTeam, competition: m.competition, utcDate: '' })} className="text-white/20 hover:text-rose-400/60 transition-colors p-1" type="button"><X size={14} /></button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
