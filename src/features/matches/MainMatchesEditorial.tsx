/**
 * Editorial view for the "Principais" filter.
 * Shows hero + categorized sections without repeating matches.
 */
import { useMemo } from 'react'
import { Zap, TrendingUp, Globe2, Trophy, Clock, Heart } from 'lucide-react'
import { ClubLogo } from '@/components/ui/ClubLogo'
import { FavoriteButton } from '@/components/ui/FavoriteButton'
import { useFavorites } from '@/context/FavoritesContext'
import { useViewMode } from '@/context/ViewModeContext'
import { buildCanonicalMatchId } from '@/features/providers/canonicalMatchId'
import { getMatchRelevanceReason, isMatchStartingSoon } from './matchCuration'
import { getMatchImportanceScore } from '@/utils/matchImportance'
import { formatMatchTime } from '@/utils/matchDate'

interface FDMatch {
  id: number
  competition: { name: string; emblem: string | null }
  homeTeam: { id: number; name: string; crest: string | null; shortName: string }
  awayTeam: { id: number; name: string; crest: string | null; shortName: string }
  score: { fullTime: { home: number | null; away: number | null } }
  status: string
  matchday: number
  utcDate: string
  area?: { name: string }
}

interface Props {
  matches: FDMatch[]
  openMatch: (m: FDMatch) => void
}

function isLive(s: string) { return s === 'IN_PLAY' || s === 'LIVE' || s === 'PAUSED' }
function isFinished(s: string) { return s === 'FINISHED' }

export function MainMatchesEditorial({ matches, openMatch }: Props) {
  const { isFavoriteTeam, isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const { isAdvanced } = useViewMode()

  const sections = useMemo(() => {
    const used = new Set<number>()
    const sorted = [...matches].sort((a, b) => getMatchImportanceScore(b) - getMatchImportanceScore(a))

    // Hero
    const hero = sorted[0] || null
    if (hero) used.add(hero.id)

    // Live relevant
    const liveRelevant = sorted.filter(m => !used.has(m.id) && isLive(m.status)).slice(0, 4)
    liveRelevant.forEach(m => used.add(m.id))

    // Global big matches
    const globalBig = sorted.filter(m => {
      if (used.has(m.id)) return false
      const comp = m.competition.name.toLowerCase()
      return comp.includes('premier') || comp.includes('champions') || comp.includes('la liga') || comp.includes('laliga') || comp.includes('serie a') || comp.includes('bundesliga')
    }).slice(0, 6)
    globalBig.forEach(m => used.add(m.id))

    // Brazil
    const brazil = sorted.filter(m => {
      if (used.has(m.id)) return false
      const comp = m.competition.name.toLowerCase()
      return comp.includes('brasil') || comp.includes('série') || comp.includes('brasileiro') || m.area?.name === 'Brazil'
    }).slice(0, 4)
    brazil.forEach(m => used.add(m.id))

    // Favorites
    const favorites = sorted.filter(m => {
      if (used.has(m.id)) return false
      return isFavoriteTeam(m.homeTeam.shortName || m.homeTeam.name) || isFavoriteTeam(m.awayTeam.shortName || m.awayTeam.name)
    }).slice(0, 4)
    favorites.forEach(m => used.add(m.id))

    // Soon
    const soon = sorted.filter(m => !used.has(m.id) && isMatchStartingSoon(m)).slice(0, 4)

    return { hero, liveRelevant, globalBig, brazil, favorites, soon }
  }, [matches, isFavoriteTeam])

  if (!sections.hero) return null

  return (
    <div className="space-y-6">
      {/* Hero */}
      <HeroCard match={sections.hero} openMatch={openMatch} isAdvanced={isAdvanced} />

      {/* Live */}
      {sections.liveRelevant.length > 0 && (
        <EditorialSection title="Ao vivo com relevância" icon={<Zap size={13} className="text-emerald-400/60" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sections.liveRelevant.map(m => <EditorialCard key={m.id} match={m} openMatch={openMatch} isAdvanced={isAdvanced} />)}
          </div>
        </EditorialSection>
      )}

      {/* Global */}
      {sections.globalBig.length > 0 && (
        <EditorialSection title="Grandes jogos do dia" icon={<Globe2 size={13} className="text-cyan-400/50" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sections.globalBig.map(m => <EditorialCard key={m.id} match={m} openMatch={openMatch} isAdvanced={isAdvanced} />)}
          </div>
        </EditorialSection>
      )}

      {/* Brazil */}
      {sections.brazil.length > 0 && (
        <EditorialSection title="Brasil em foco" icon={<Trophy size={13} className="text-emerald-400/50" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sections.brazil.map(m => <EditorialCard key={m.id} match={m} openMatch={openMatch} isAdvanced={isAdvanced} />)}
          </div>
        </EditorialSection>
      )}

      {/* Favorites */}
      {sections.favorites.length > 0 && (
        <EditorialSection title="Favoritos em campo" icon={<Heart size={13} className="text-rose-400/50" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sections.favorites.map(m => <EditorialCard key={m.id} match={m} openMatch={openMatch} isAdvanced={isAdvanced} />)}
          </div>
        </EditorialSection>
      )}

      {/* Soon */}
      {sections.soon.length > 0 && (
        <EditorialSection title="Começam em breve" icon={<Clock size={13} className="text-amber-400/50" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sections.soon.map(m => <EditorialCard key={m.id} match={m} openMatch={openMatch} isAdvanced={isAdvanced} />)}
          </div>
        </EditorialSection>
      )}
    </div>
  )
}

// ─── Hero Card ───────────────────────────────────────────────────────────────

function HeroCard({ match: m, openMatch, isAdvanced }: { match: FDMatch; openMatch: (m: FDMatch) => void; isAdvanced: boolean }) {
  const { isFavoriteMatch, toggleFavoriteMatch, isFavoriteTeam } = useFavorites()
  const matchId = buildCanonicalMatchId(m.homeTeam.shortName || m.homeTeam.name, m.awayTeam.shortName || m.awayTeam.name, m.utcDate)
  const reason = getMatchRelevanceReason(m, isFavoriteTeam)
  const imp = getMatchImportanceScore(m)
  const live = isLive(m.status)
  const time = formatMatchTime(m.utcDate)
  const statusText = live ? 'Ao vivo' : isFinished(m.status) ? 'Encerrado' : `${time} · Agendado`

  return (
    <div onClick={() => openMatch(m)} className="group relative rounded-[24px] border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.05] via-transparent to-violet-500/[0.02] p-8 cursor-pointer hover:border-cyan-500/30 hover:shadow-[0_20px_60px_-20px_rgba(34,211,238,0.1)] transition-all overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[120px] bg-cyan-500/[0.04] rounded-full blur-[60px]" />
      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Zap size={13} className="text-cyan-400/70" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400/70">{reason.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <FavoriteButton active={isFavoriteMatch(matchId)} onClick={() => toggleFavoriteMatch({ canonicalMatchId: matchId, homeTeam: m.homeTeam.shortName || m.homeTeam.name, awayTeam: m.awayTeam.shortName || m.awayTeam.name, competition: m.competition.name, utcDate: m.utcDate })} size={14} />
            <span className={`text-[10px] font-semibold ${live ? 'text-emerald-400' : 'text-white/25'}`}>{statusText}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-3 w-[110px]">
            <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={60} />
            <span className="text-[12px] font-bold text-white/75 text-center leading-tight">{m.homeTeam.shortName}</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-baseline gap-4">
              <span className="text-[44px] font-bold tabular-nums text-white">{m.score.fullTime.home ?? '-'}</span>
              <span className="text-[18px] text-white/10">:</span>
              <span className="text-[44px] font-bold tabular-nums text-white">{m.score.fullTime.away ?? '-'}</span>
            </div>
            {live && <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />}
          </div>
          <div className="flex flex-col items-center gap-3 w-[110px]">
            <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={60} />
            <span className="text-[12px] font-bold text-white/50 text-center leading-tight">{m.awayTeam.shortName}</span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-5 pt-3 border-t border-white/[0.05]">
          <div className="flex items-center gap-2.5">
            {m.competition.emblem && <img src={m.competition.emblem} alt="" className="h-5 w-5 object-contain opacity-60" />}
            <span className="text-[11px] text-white/30 font-medium">{m.competition.name}</span>
          </div>
          <div className="flex items-center gap-3">
            {isAdvanced && <span className="text-[8px] text-white/15 font-mono">{imp}</span>}
            <span className="text-[10px] text-cyan-400/50 group-hover:text-cyan-400/90 font-bold transition-colors flex items-center gap-1.5">Analisar partida <TrendingUp size={11} /></span>
          </div>
        </div>
        {reason.detail && <p className="text-[9px] text-white/20 mt-2 italic">{reason.detail}</p>}
      </div>
    </div>
  )
}

// ─── Editorial Card ──────────────────────────────────────────────────────────

function EditorialCard({ match: m, openMatch, isAdvanced }: { match: FDMatch; openMatch: (m: FDMatch) => void; isAdvanced: boolean }) {
  const { isFavoriteTeam, isFavoriteMatch, toggleFavoriteMatch } = useFavorites()
  const matchId = buildCanonicalMatchId(m.homeTeam.shortName || m.homeTeam.name, m.awayTeam.shortName || m.awayTeam.name, m.utcDate)
  const isFav = isFavoriteMatch(matchId) || isFavoriteTeam(m.homeTeam.shortName || m.homeTeam.name) || isFavoriteTeam(m.awayTeam.shortName || m.awayTeam.name)
  const reason = getMatchRelevanceReason(m, isFavoriteTeam)
  const imp = getMatchImportanceScore(m)
  const live = isLive(m.status)
  const time = formatMatchTime(m.utcDate)

  return (
    <div onClick={() => openMatch(m)} className={`group rounded-[18px] border ${isFav ? 'border-cyan-500/20' : 'border-white/[0.05]'} bg-gradient-to-b from-white/[0.03] to-transparent p-5 cursor-pointer hover:border-white/[0.12] hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.4)] transition-all`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${reason.tone === 'live' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : reason.tone === 'favorite' ? 'bg-rose-500/8 text-rose-400/70 border border-rose-500/12' : reason.tone === 'brazil' ? 'bg-emerald-500/8 text-emerald-400/60 border border-emerald-500/12' : reason.tone === 'soon' ? 'bg-amber-500/8 text-amber-400/70 border border-amber-500/12' : 'bg-white/[0.03] text-white/30 border border-white/[0.06]'}`}>{reason.label}</span>
        <div className="flex items-center gap-1.5">
          <FavoriteButton active={isFav} onClick={() => toggleFavoriteMatch({ canonicalMatchId: matchId, homeTeam: m.homeTeam.shortName || m.homeTeam.name, awayTeam: m.awayTeam.shortName || m.awayTeam.name, competition: m.competition.name, utcDate: m.utcDate })} size={12} />
          <span className={`text-[9px] font-semibold ${live ? 'text-emerald-400' : 'text-white/20'}`}>{live ? 'Ao vivo' : isFinished(m.status) ? 'Enc.' : time}</span>
        </div>
      </div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <ClubLogo src={m.homeTeam.crest} name={m.homeTeam.shortName} size={30} />
          <span className="text-[12px] font-bold text-white/70">{m.homeTeam.shortName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[22px] font-bold tabular-nums text-white">{m.score.fullTime.home ?? '-'}</span>
          <span className="text-[11px] text-white/10">:</span>
          <span className="text-[22px] font-bold tabular-nums text-white">{m.score.fullTime.away ?? '-'}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[12px] font-bold text-white/50">{m.awayTeam.shortName}</span>
          <ClubLogo src={m.awayTeam.crest} name={m.awayTeam.shortName} size={30} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-white/20">{m.competition.name}</span>
        {isAdvanced && <span className="text-[8px] text-white/15 font-mono">{imp}</span>}
      </div>
      <span className="block text-[9px] text-cyan-400/0 group-hover:text-cyan-400/60 mt-2 font-semibold transition-colors">Analisar →</span>
    </div>
  )
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function EditorialSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3 px-1">
        {icon}
        <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/35">{title}</h3>
        <div className="flex-1 h-px bg-white/[0.04]" />
      </div>
      {children}
    </div>
  )
}
