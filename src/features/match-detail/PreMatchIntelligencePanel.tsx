/**
 * War Room Pre-Match — Native panel with internal tabs.
 * One immersive container. Header is always visible. Tab bar segments the panel
 * into Visao / Forma / Gols / Elenco / Padroes / Auditoria.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  getPreMatchIntelligence,
  type PreMatchIntelligenceResult,
  type TeamFormSummary,
} from '@/services/preMatchIntelligence'
import { getPreMatchAdvanced, type PreMatchAdvancedResult } from '@/services/intelligence/preMatchAdvanced'
import { getPreMatchPatternReadiness, type PreMatchPatternReadiness } from '@/services/intelligence/preMatchPatternConnector'
import { calculatePreMatchScore, type PreMatchScore } from '@/services/intelligence/preMatchScoreEngine'
import { useViewMode } from '@/context/ViewModeContext'
import { usePatterns } from '@/features/command/contexts/PatternContext'
import { useFavorites } from '@/context/FavoritesContext'

interface Props {
  homeName: string
  awayName: string
  homeId?: string | number
  awayId?: string | number
  competition?: string
  utcDate?: string
}

type TabKey = 'visao' | 'forma' | 'gols' | 'elenco' | 'padroes' | 'auditoria'

// ─── Team Accent ─────────────────────────────────────────────────────────────
// Stable hash-based fallback palette. No fake metadata invented.
const ACCENT_PALETTE = [
  { from: '#3b82f6', to: '#06b6d4', text: 'text-cyan-300', soft: 'rgba(59,130,246,0.20)' }, // blue/cyan
  { from: '#10b981', to: '#34d399', text: 'text-emerald-300', soft: 'rgba(16,185,129,0.20)' }, // emerald
  { from: '#f59e0b', to: '#fb923c', text: 'text-amber-300', soft: 'rgba(245,158,11,0.20)' }, // amber/orange
  { from: '#a855f7', to: '#ec4899', text: 'text-fuchsia-300', soft: 'rgba(168,85,247,0.20)' }, // purple/pink
  { from: '#ef4444', to: '#f97316', text: 'text-rose-300', soft: 'rgba(239,68,68,0.20)' }, // red/orange
  { from: '#14b8a6', to: '#22d3ee', text: 'text-teal-300', soft: 'rgba(20,184,166,0.20)' }, // teal
  { from: '#6366f1', to: '#8b5cf6', text: 'text-indigo-300', soft: 'rgba(99,102,241,0.20)' }, // indigo
] as const

type TeamAccent = (typeof ACCENT_PALETTE)[number]

function hashString(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i), (h |= 0)
  return Math.abs(h)
}

function getTeamAccent(teamName: string, side: 'home' | 'away', opponentName?: string): TeamAccent {
  // Cool-toned palettes for home, warm-toned for away — keeps H2H rail readable.
  const COOL = [ACCENT_PALETTE[0], ACCENT_PALETTE[6], ACCENT_PALETTE[5]] as const // blue/cyan, indigo, teal
  const WARM = [ACCENT_PALETTE[1], ACCENT_PALETTE[3], ACCENT_PALETTE[4], ACCENT_PALETTE[2]] as const // emerald, fuchsia, rose, amber
  const pool = side === 'home' ? COOL : WARM
  const idx = hashString(teamName) % pool.length
  let chosen = pool[idx]
  // If both sides happen to land on similar hue, force away to a different bucket.
  if (opponentName && side === 'away') {
    const homeChosen = COOL[hashString(opponentName) % COOL.length]
    if (homeChosen.from === chosen.from) {
      chosen = pool[(idx + 1) % pool.length]
    }
  }
  return chosen
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PreMatchIntelligencePanel({ homeName, awayName, homeId, awayId, competition, utcDate }: Props) {
  const [data, setData] = useState<PreMatchIntelligenceResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [adv, setAdv] = useState<PreMatchAdvancedResult | null>(null)
  const [advLoading, setAdvLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('visao')
  const { isAdvanced } = useViewMode()
  const { getActivePatterns } = usePatterns()
  const { isFavoriteTeam } = useFavorites()

  useEffect(() => {
    if (!homeName || !awayName) return
    setLoading(true)
    getPreMatchIntelligence({ homeName, awayName, homeId, awayId, competition, utcDate })
      .then(setData)
      .finally(() => setLoading(false))
  }, [homeName, awayName, homeId, awayId, competition, utcDate])

  const score = useMemo(() => (data ? calculatePreMatchScore(data) : null), [data])
  const patterns = useMemo<PreMatchPatternReadiness[]>(() => {
    const a = getActivePatterns()
    if (!a.length || !data) return []
    return getPreMatchPatternReadiness({ homeName, awayName, activePatterns: a, preMatchData: data, score, isFavoriteTeam })
  }, [homeName, awayName, data, score, getActivePatterns, isFavoriteTeam])

  const homeAccent = useMemo(() => getTeamAccent(homeName, 'home', awayName), [homeName, awayName])
  const awayAccent = useMemo(() => getTeamAccent(awayName, 'away', homeName), [awayName, homeName])

  const loadAdv = async () => {
    setAdvLoading(true)
    try {
      setAdv(
        await getPreMatchAdvanced({
          homeName,
          awayName,
          homeId: homeId ? Number(homeId) : undefined,
          awayId: awayId ? Number(awayId) : undefined,
          goalsProfile: data?.goalsProfile,
          homeForm: data?.homeForm,
          awayForm: data?.awayForm,
          disciplineTrend: data?.disciplineProfile?.trend,
        })
      )
    } catch {
      /* graceful */
    } finally {
      setAdvLoading(false)
    }
  }

  // ── Loading skeleton ──
  if (loading) {
    return (
      <WarRoomShell>
        <div className="px-7 py-7 animate-pulse space-y-4">
          <div className="h-3 w-32 bg-white/[0.05] rounded" />
          <div className="h-7 w-72 bg-white/[0.05] rounded" />
          <div className="h-4 w-full bg-white/[0.03] rounded" />
          <div className="h-32 bg-white/[0.02] rounded-2xl mt-4" />
        </div>
      </WarRoomShell>
    )
  }

  // ── Empty / unavailable ──
  if (!data || !data.available) {
    return (
      <WarRoomShell>
        <div className="px-7 pt-6 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400/60">War Room · Pre-Jogo</span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.06] text-white/55">Limitado</span>
          </div>
          <h2 className="text-[22px] font-bold text-white tracking-tight">{homeName} <span className="text-white/30 font-normal mx-1.5">vs</span> {awayName}</h2>
        </div>
        <Divider />
        <div className="px-7 py-6">
          <p className="text-[13px] text-white/65 leading-relaxed">Dados pre-jogo limitados para esta partida. O GoalSense buscou historico nos providers, mas nao encontrou amostra suficiente.</p>
          {data?.limitations && data.limitations.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {data.limitations.map((l, i) => (
                <li key={i} className="text-[12px] text-white/50 flex items-start gap-2">
                  <span className="text-amber-400/70 mt-0.5">·</span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </WarRoomShell>
    )
  }

  // ── Header pieces ──
  const balanceLabel = !score
    ? 'Limitado'
    : score.balance.score >= 65
    ? 'Equilibrado'
    : score.homeStrength.score > score.awayStrength.score + 10
    ? 'Mandante +'
    : score.awayStrength.score > score.homeStrength.score + 10
    ? 'Visitante +'
    : 'Equilibrado'

  const dataLabel = data.dataSources.length > 0 ? data.dataSources[0] : 'Provider'

  return (
    <WarRoomShell>
      {/* ═══ HEADER ═══ */}
      <div className="px-7 pt-5 pb-4 relative">
        <div className="absolute top-0 right-0 w-[320px] h-[140px] rounded-full blur-[80px] pointer-events-none" style={{ background: `radial-gradient(circle, ${homeAccent.soft}, transparent 70%)` }} />
        <div className="relative flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400/70">War Room · Pre-Jogo</span>
              <CoverageBadge status={data.status} />
            </div>
            <h2 className="text-[22px] sm:text-[24px] font-bold text-white tracking-tight leading-tight mb-1.5 truncate">
              <span>{homeName}</span>
              <span className="text-white/30 font-normal mx-2">vs</span>
              <span>{awayName}</span>
            </h2>
            <p className="text-[13px] text-white/65 leading-relaxed">{data.preview?.summary || 'Leitura em construcao com dados disponiveis.'}</p>
          </div>
          {score && <ScoreOrb score={score} />}
        </div>

        {/* Quick chips */}
        {score && (
          <div className="relative flex flex-wrap gap-1.5 mt-3.5">
            <Chip label="Equilibrio" value={balanceLabel} score={score.balance.score} />
            <Chip label="Gols" value={score.goalsTrend.label} score={score.goalsTrend.score} />
            <Chip label="Disciplina" value={score.disciplineRisk.label} score={score.disciplineRisk.score} />
            <Chip label="Dados" value={dataLabel} neutral />
          </div>
        )}
      </div>

      {/* ═══ TAB BAR ═══ */}
      <TabBar
        active={activeTab}
        onChange={setActiveTab}
        showAuditoria={isAdvanced}
        elencoLoaded={!!adv}
        patternCount={patterns.length}
      />

      {/* ═══ CONTENT ═══ */}
      <div className="relative">
        {activeTab === 'visao' && (
          <TabVisao data={data} score={score} homeName={homeName} awayName={awayName} homeAccent={homeAccent} awayAccent={awayAccent} balanceLabel={balanceLabel} isAdvanced={isAdvanced} />
        )}
        {activeTab === 'forma' && (
          <TabForma data={data} homeName={homeName} awayName={awayName} homeAccent={homeAccent} awayAccent={awayAccent} />
        )}
        {activeTab === 'gols' && (
          <TabGols data={data} homeName={homeName} awayName={awayName} homeAccent={homeAccent} awayAccent={awayAccent} />
        )}
        {activeTab === 'elenco' && (
          <TabElenco adv={adv} loading={advLoading} onLoad={loadAdv} homeName={homeName} awayName={awayName} />
        )}
        {activeTab === 'padroes' && (
          <TabPadroes patterns={patterns} hasActivePatterns={getActivePatterns().length > 0} score={score} isAdvanced={isAdvanced} />
        )}
        {activeTab === 'auditoria' && isAdvanced && (
          <TabAuditoria data={data} homeId={homeId} awayId={awayId} />
        )}
      </div>
    </WarRoomShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SHELL & PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════

function WarRoomShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] overflow-hidden border border-white/[0.07] bg-gradient-to-br from-[#0a0d14] via-[#0b1018] to-[#0c1322] shadow-[0_24px_80px_-20px_rgba(0,0,0,0.55)] relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.030),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(99,102,241,0.025),transparent_60%)] pointer-events-none" />
      <div className="relative">{children}</div>
    </section>
  )
}

function Divider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50 mb-3.5">{children}</h4>
}

function CoverageBadge({ status }: { status: 'rich' | 'partial' | 'basic' | 'unavailable' }) {
  const cfg =
    status === 'rich'
      ? { c: 'bg-emerald-500/12 text-emerald-300 border-emerald-400/15', t: 'Rico' }
      : status === 'partial'
      ? { c: 'bg-amber-500/12 text-amber-300 border-amber-400/15', t: 'Parcial' }
      : status === 'basic'
      ? { c: 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15', t: 'Basico' }
      : { c: 'bg-white/[0.05] text-white/45 border-white/[0.06]', t: 'Limitado' }
  return <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.c}`}>{cfg.t}</span>
}

function ScoreOrb({ score }: { score: PreMatchScore }) {
  const conf = score.confidence
  const tone = score.overallScore >= 70 ? 'from-emerald-500/25 via-cyan-500/15' : score.overallScore >= 50 ? 'from-blue-500/22 via-cyan-500/15' : 'from-white/[0.06] via-white/[0.03]'
  return (
    <div className="flex items-center gap-3 shrink-0">
      <div className="text-right">
        <span className="text-[10px] text-white/40 uppercase tracking-wider block font-semibold">Score</span>
        <span className="text-[10px] text-white/35 block">conf. {conf}</span>
      </div>
      <div className={`relative h-[72px] w-[72px] rounded-2xl bg-gradient-to-br ${tone} to-blue-500/5 border border-cyan-400/25 flex flex-col items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`}>
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/8 to-transparent pointer-events-none" />
        <span className="relative text-[28px] font-bold text-white leading-none tabular-nums">{score.overallScore}</span>
        <span className="relative text-[9px] text-cyan-300/65 mt-0.5 font-medium">/100</span>
      </div>
    </div>
  )
}

function Chip({ label, value, score, neutral }: { label: string; value: string; score?: number; neutral?: boolean }) {
  const c = neutral
    ? 'bg-white/[0.04] text-white/55 border-white/[0.07]'
    : (score ?? 0) >= 70
    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/15'
    : (score ?? 0) >= 50
    ? 'bg-blue-500/10 text-blue-300 border-blue-400/15'
    : 'bg-white/[0.04] text-white/45 border-white/[0.07]'
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border ${c}`}>
      <span className="text-white/45">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB BAR
// ═══════════════════════════════════════════════════════════════════════════

function TabBar({ active, onChange, showAuditoria, elencoLoaded, patternCount }: { active: TabKey; onChange: (k: TabKey) => void; showAuditoria: boolean; elencoLoaded: boolean; patternCount: number }) {
  const tabs: { key: TabKey; label: string; badge?: string | number }[] = [
    { key: 'visao', label: 'Visao' },
    { key: 'forma', label: 'Forma' },
    { key: 'gols', label: 'Gols' },
    { key: 'elenco', label: 'Elenco', badge: elencoLoaded ? '✓' : 'on demand' },
    { key: 'padroes', label: 'Padroes', badge: patternCount > 0 ? patternCount : undefined },
  ]
  if (showAuditoria) tabs.push({ key: 'auditoria', label: 'Auditoria' })

  return (
    <div className="px-5 border-y border-white/[0.05] bg-gradient-to-b from-white/[0.015] to-transparent">
      {/*
        IMPORTANT: overflow-x-auto + overflow-y-visible would still trigger
        an implicit vertical scrollbar in modern browsers (per CSS spec, when
        one axis is auto/scroll, the other can no longer be visible).
        We force overflow-y: hidden + no-scrollbar to kill the phantom vertical bar
        and any horizontal track on platforms with chunky scrollbars.
      */}
      <div
        className="flex gap-0.5 -mx-1 px-1 py-2 no-scrollbar"
        style={{ overflowX: 'auto', overflowY: 'hidden' }}
      >
        {tabs.map(t => {
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              type="button"
              className={`relative px-3.5 py-2 rounded-xl text-[12px] font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${isActive ? 'bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-white/55 hover:text-white/85 hover:bg-white/[0.03]'}`}
            >
              {t.label}
              {t.badge !== undefined && (
                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${isActive ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/[0.06] text-white/50'}`}>{t.badge}</span>
              )}
              {isActive && <span className="absolute inset-x-3 -bottom-[1px] h-[2px] bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: VISAO
// ═══════════════════════════════════════════════════════════════════════════

function TabVisao({ data, score, homeName, awayName, homeAccent, awayAccent, balanceLabel, isAdvanced }: { data: PreMatchIntelligenceResult; score: PreMatchScore | null; homeName: string; awayName: string; homeAccent: TeamAccent; awayAccent: TeamAccent; balanceLabel: string; isAdvanced: boolean }) {
  const h2h = data.h2h
  const total = h2h ? Math.max(h2h.total, 1) : 0

  // Executive reading helpers
  const evidences = useMemo(() => buildExecutiveEvidences(data, score), [data, score])
  const recommendation = useMemo(() => buildRecommendation(data, score, homeName, awayName), [data, score, homeName, awayName])

  return (
    <div>
      {/* A. Leitura executiva — premium block */}
      <div className="px-7 pt-5 pb-4">
        <SectionLabel>Leitura Executiva</SectionLabel>
        <p className="text-[15px] text-white/95 leading-relaxed font-semibold tracking-tight">
          {score?.mainRead || data.executiveSummary}
        </p>
        {evidences.length > 0 && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {evidences.slice(0, 3).map((ev, i) => (
              <div key={i} className="flex items-start gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${ev.tone === 'positive' ? 'bg-emerald-400' : ev.tone === 'warn' ? 'bg-amber-400' : 'bg-cyan-400/70'}`} />
                <span className="text-[11px] text-white/75 leading-snug">{ev.text}</span>
              </div>
            ))}
          </div>
        )}
        {recommendation && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-cyan-400/15 bg-gradient-to-r from-cyan-500/[0.06] to-blue-500/[0.04] px-4 py-2.5">
            <span className="mt-0.5 text-[10px] text-cyan-300/80 font-bold uppercase tracking-wider shrink-0">Recomendacao</span>
            <p className="text-[12px] text-white/85 leading-snug font-medium">{recommendation}</p>
          </div>
        )}
      </div>

      <Divider />

      {/* B. Mapa do Confronto */}
      <div className="px-7 pt-5 pb-5 relative">
        <SectionLabel>Mapa do Confronto</SectionLabel>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 items-start">
          <TeamColumn name={homeName} accent={homeAccent} form={data.homeForm} venue={data.homeAtHome} venueLabel="Em casa" align="left" />
          <VsCenter score={score} balanceLabel={balanceLabel} h2hTotal={h2h?.total} h2h={h2h} homeName={homeName} awayName={awayName} hasRecentForm={!!(data.homeForm || data.awayForm)} />
          <TeamColumn name={awayName} accent={awayAccent} form={data.awayForm} venue={data.awayAway} venueLabel="Fora" align="right" />
        </div>

        {/* Mini comparator rails with context labels */}
        {score && (
          <div className="mt-5 space-y-1.5">
            <ContextualRail label="Forca" left={score.homeStrength.score} right={score.awayStrength.score} leftAccent={homeAccent} rightAccent={awayAccent} contextLabel={getRailContext('forca', score, data)} limited={!data.homeForm || !data.awayForm} />
            <ContextualRail label="Gols" left={Math.round(score.goalsTrend.score * 0.6)} right={Math.round(score.goalsTrend.score * 0.4)} leftAccent={homeAccent} rightAccent={awayAccent} contextLabel={getRailContext('gols', score, data)} limited={!data.goalsProfile} muted />
            <ContextualRail label="Disciplina" left={Math.round(score.disciplineRisk.score / 2)} right={Math.round(score.disciplineRisk.score / 2)} leftAccent={homeAccent} rightAccent={awayAccent} contextLabel={getRailContext('disciplina', score, data)} limited={!data.disciplineProfile} muted />
          </div>
        )}
      </div>

      <Divider />

      {/* C. H2H Rail with historical reading */}
      <div className="px-7 pt-5 pb-5">
        <SectionLabel>Confronto Direto</SectionLabel>
        {h2h && total > 0 ? (
          <>
            <H2HRail h2h={h2h} homeName={homeName} awayName={awayName} homeAccent={homeAccent} awayAccent={awayAccent} recent={isAdvanced ? data.recentMeetings : undefined} />
            <H2HReading h2h={h2h} homeName={homeName} awayName={awayName} />
          </>
        ) : (
          <p className="text-[12px] text-white/55">Confronto direto indisponivel no provider.</p>
        )}
      </div>

      <Divider />

      {/* D. Operational checklist */}
      <div className="px-7 pt-5 pb-6">
        <SectionLabel>Checklist Operacional</SectionLabel>
        <OperationalTimeline score={score} hasGoalsProfile={!!data.goalsProfile} hasH2h={!!data.h2h} />
      </div>
    </div>
  )
}

// ─── Executive reading helpers ──────────────────────────────────────────────

interface Evidence { text: string; tone: 'positive' | 'neutral' | 'warn' }

function buildExecutiveEvidences(data: PreMatchIntelligenceResult, score: PreMatchScore | null): Evidence[] {
  const out: Evidence[] = []
  if (data.h2h && data.h2h.total > 0) {
    const total = data.h2h.total
    if (data.h2h.homeWins > data.h2h.awayWins + 1) out.push({ text: `${total} confrontos · vantagem historica do mandante`, tone: 'positive' })
    else if (data.h2h.awayWins > data.h2h.homeWins + 1) out.push({ text: `${total} confrontos · vantagem historica do visitante`, tone: 'positive' })
    else out.push({ text: `${total} confrontos analisados · historico equilibrado`, tone: 'neutral' })
  }
  if (data.goalsProfile && data.goalsProfile.sampleSize >= 4) {
    out.push({ text: `Media ${data.goalsProfile.avgGoalsPerMatch} gols/jogo · over 2.5 em ${data.goalsProfile.over25Pct}%`, tone: data.goalsProfile.over25Pct >= 55 ? 'positive' : 'neutral' })
  }
  if (!data.homeForm || !data.awayForm) {
    out.push({ text: 'Forma recente indisponivel no provider', tone: 'warn' })
  } else if (score && score.confidence === 'baixa') {
    out.push({ text: 'Confianca baixa por dados limitados', tone: 'warn' })
  } else if (data.homeForm && data.awayForm) {
    const hw = data.homeForm.summary.wins
    const aw = data.awayForm.summary.wins
    if (hw > aw + 1) out.push({ text: `Mandante chega em melhor forma · ${hw}V recentes`, tone: 'positive' })
    else if (aw > hw + 1) out.push({ text: `Visitante chega em melhor forma · ${aw}V recentes`, tone: 'positive' })
    else out.push({ text: `Forma recente muito proxima · ${hw}V x ${aw}V`, tone: 'neutral' })
  }
  if (data.disciplineProfile && data.disciplineProfile.trend === 'high') {
    out.push({ text: 'Tendencia alta de cartoes nos jogos recentes', tone: 'warn' })
  }
  return out
}

function buildRecommendation(data: PreMatchIntelligenceResult, score: PreMatchScore | null, _homeName: string, _awayName: string): string | null {
  if (!data.homeForm && !data.awayForm && !data.h2h && !data.goalsProfile) {
    return 'Monitorar ritmo, posse e finalizacoes nos primeiros 20 minutos para construir leitura ao vivo.'
  }
  if (score && score.goalsTrend.score >= 65) {
    return 'Acompanhar volume ofensivo desde o inicio · perfil sugere jogo aberto.'
  }
  if (score && score.balance.score >= 70) {
    return 'Confronto equilibrado · monitorar ajuste pos-intervalo e reta final.'
  }
  if (score && score.homeStrength.score > score.awayStrength.score + 15) {
    return 'Verificar se o mandante confirma pressao inicial em casa nos primeiros 15 minutos.'
  }
  if (score && score.awayStrength.score > score.homeStrength.score + 15) {
    return 'Atencao as primeiras finalizacoes do visitante · chega em momento melhor.'
  }
  return 'Monitorar ritmo inicial, posse e finalizacoes nos primeiros 20 minutos.'
}

function getRailContext(kind: 'forca' | 'gols' | 'disciplina', score: PreMatchScore, _data: PreMatchIntelligenceResult): string {
  if (kind === 'forca') {
    const diff = Math.abs(score.homeStrength.score - score.awayStrength.score)
    if (diff <= 8) return 'equilibrada'
    if (score.homeStrength.score > score.awayStrength.score) return 'mandante +'
    return 'visitante +'
  }
  if (kind === 'gols') {
    if (score.goalsTrend.score >= 70) return 'forte'
    if (score.goalsTrend.score >= 50) return 'moderada'
    return 'baixa'
  }
  if (score.disciplineRisk.score >= 65) return 'alto'
  if (score.disciplineRisk.score >= 45) return 'moderado'
  return 'baixo'
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: FORMA
// ═══════════════════════════════════════════════════════════════════════════

function TabForma({ data, homeName, awayName, homeAccent, awayAccent }: { data: PreMatchIntelligenceResult; homeName: string; awayName: string; homeAccent: TeamAccent; awayAccent: TeamAccent }) {
  const hf = data.homeForm
  const af = data.awayForm
  const hh = data.homeAtHome
  const aa = data.awayAway
  const hasAnyForm = !!(hf || af)
  const hasAnyVenue = !!(hh && hh.matches.length >= 2) || !!(aa && aa.matches.length >= 2)

  return (
    <div>
      {/* Status overview — categories + reason */}
      {!hasAnyForm && (
        <div className="px-7 pt-6 pb-2">
          <SectionLabel>Status da Forma</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <StatusTile title="Forma geral" status="indisponivel" detail="Provider nao retornou ultimos jogos suficientes." />
            <StatusTile title="Casa / Fora" status="indisponivel" detail="Sem amostra para recorte mandante / visitante." />
            <StatusTile title="Base GoalSense" status={data.dataSources.includes('Base GoalSense') ? 'parcial' : 'indisponivel'} detail={data.dataSources.includes('Base GoalSense') ? 'Historico GoalSense usado em outras leituras.' : 'Base ainda sem amostra deste confronto.'} />
          </div>
          <p className="text-[11px] text-white/40 mt-3 leading-snug">A leitura usa H2H, perfil de gols e Base GoalSense quando disponivel. A cada partida concluida, a Base fortalece a forma deste time.</p>
        </div>
      )}

      {hasAnyForm && (
        <div className="px-7 pt-6 pb-5">
          <SectionLabel>Ultimos 5 Jogos</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormCard form={hf} teamName={homeName} accent={homeAccent} />
            <FormCard form={af} teamName={awayName} accent={awayAccent} />
          </div>
        </div>
      )}

      {hasAnyForm && <Divider />}

      {/* Home at home / Away away */}
      {hasAnyVenue && (
        <div className="px-7 py-6">
          <SectionLabel>Mando vs Visita</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <VenueCard form={hh} teamName={homeName} accent={homeAccent} label="Em casa" />
            <VenueCard form={aa} teamName={awayName} accent={awayAccent} label="Fora" />
          </div>
        </div>
      )}

      {/* Match list (if rich) */}
      {((hf?.matches.length ?? 0) + (af?.matches.length ?? 0) > 0) && (
        <>
          <Divider />
          <div className="px-7 py-6">
            <SectionLabel>Ultimos Resultados</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {hf && <RecentMatchList form={hf} teamName={homeName} />}
              {af && <RecentMatchList form={af} teamName={awayName} />}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatusTile({ title, status, detail }: { title: string; status: 'disponivel' | 'parcial' | 'indisponivel' | 'sob_demanda' | 'nao_consultado'; detail: string }) {
  const cfg =
    status === 'disponivel'
      ? { c: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/15', t: 'Disponivel', dot: 'bg-emerald-400' }
      : status === 'parcial'
      ? { c: 'bg-amber-500/10 text-amber-300 border-amber-400/15', t: 'Parcial', dot: 'bg-amber-400' }
      : status === 'sob_demanda'
      ? { c: 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15', t: 'Sob demanda', dot: 'bg-cyan-400' }
      : status === 'nao_consultado'
      ? { c: 'bg-white/[0.05] text-white/55 border-white/[0.07]', t: 'Nao consultado', dot: 'bg-white/40' }
      : { c: 'bg-white/[0.04] text-white/45 border-white/[0.06]', t: 'Indisponivel', dot: 'bg-white/30' }
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[12px] text-white/85 font-semibold">{title}</p>
        <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.c}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          {cfg.t}
        </span>
      </div>
      <p className="text-[11px] text-white/55 leading-snug">{detail}</p>
    </div>
  )
}

function FormCard({ form, teamName, accent }: { form?: TeamFormSummary; teamName: string; accent: TeamAccent }) {
  if (!form) {
    return (
      <div className="rounded-2xl bg-white/[0.025] border border-white/[0.05] px-5 py-4">
        <p className="text-[13px] text-white font-bold mb-2 truncate">{teamName}</p>
        <p className="text-[11px] text-white/40">Forma indisponivel no provider.</p>
      </div>
    )
  }
  const { wins, draws, losses, goalsFor, goalsAgainst } = form.summary
  const n = form.matches.length
  const avg = n > 0 ? ((goalsFor + goalsAgainst) / n).toFixed(1) : '0.0'
  const winPct = n > 0 ? Math.round((wins / n) * 100) : 0
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-white/[0.01] px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-white font-bold truncate flex-1 pr-2">{teamName}</p>
        <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">{n}j</span>
      </div>
      <div className="flex gap-1 mb-4">
        {form.formString.split(' ').map((r, i) => (
          <span key={i} className={`h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold tabular-nums ${r === 'W' ? 'bg-emerald-500/22 text-emerald-300 border border-emerald-400/20' : r === 'D' ? 'bg-amber-500/15 text-amber-300 border border-amber-400/15' : 'bg-rose-500/18 text-rose-300 border border-rose-400/15'}`}>
            {r === 'W' ? 'V' : r === 'D' ? 'E' : 'D'}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat value={`${wins}V`} label="Vitorias" tone="emerald" />
        <Stat value={`${draws}E`} label="Empates" tone="amber" />
        <Stat value={`${losses}D`} label="Derrotas" tone="rose" />
      </div>
      <div className="mt-3 pt-3 border-t border-white/[0.05] grid grid-cols-3 gap-2 text-center">
        <Stat value={String(goalsFor)} label="Gols pro" tone="emerald" small />
        <Stat value={String(goalsAgainst)} label="Sofridos" tone="rose" small />
        <Stat value={avg} label="Media/j" tone="white" small />
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px]">
        <span className="text-white/40">Aproveitamento</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${winPct}%`, background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }} />
        </div>
        <span className="text-white/85 font-bold tabular-nums">{winPct}%</span>
      </div>
    </div>
  )
}

function VenueCard({ form, teamName, accent, label }: { form?: TeamFormSummary; teamName: string; accent: TeamAccent; label: string }) {
  if (!form || form.matches.length < 2) {
    return (
      <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] text-white/85 font-semibold truncate flex-1 pr-2">{teamName}</p>
          <span className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">{label}</span>
        </div>
        <p className="text-[11px] text-white/40">Amostra insuficiente.</p>
      </div>
    )
  }
  const { wins, draws, losses, goalsFor, goalsAgainst } = form.summary
  const n = form.matches.length
  const reading = wins / n >= 0.6 ? 'Forte' : wins / n >= 0.35 ? 'Regular' : 'Fraco'
  const readingTone = reading === 'Forte' ? 'text-emerald-400' : reading === 'Regular' ? 'text-amber-400' : 'text-rose-400'
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.025] to-white/[0.01] px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-white font-bold truncate flex-1 pr-2">{teamName}</p>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${readingTone}`}>{reading}</span>
          <span className="text-[9px] uppercase tracking-wider text-white/35 font-semibold">{label}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3 text-[11px]">
        <span className="text-emerald-400 font-bold">{wins}V</span>
        <span className="text-amber-400">{draws}E</span>
        <span className="text-rose-400">{losses}D</span>
        <span className="text-white/30 ml-auto">em {n}j</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden mb-2 flex">
        <div className="h-full" style={{ width: `${(wins / n) * 100}%`, background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }} />
        <div className="h-full bg-white/[0.10]" style={{ width: `${(draws / n) * 100}%` }} />
        <div className="h-full bg-rose-500/40" style={{ width: `${(losses / n) * 100}%` }} />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-white/45">Gols</span>
        <span><span className="text-emerald-400 font-bold">{goalsFor}</span> <span className="text-white/25">·</span> <span className="text-rose-400 font-bold">{goalsAgainst}</span></span>
      </div>
    </div>
  )
}

function RecentMatchList({ form, teamName }: { form: TeamFormSummary; teamName: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2 font-semibold">{teamName}</p>
      <div className="space-y-1">
        {form.matches.slice(0, 5).map((m, i) => {
          const isHome = m.wasHome
          const opp = isHome ? m.awayTeam : m.homeTeam
          const gf = isHome ? m.homeScore ?? 0 : m.awayScore ?? 0
          const ga = isHome ? m.awayScore ?? 0 : m.homeScore ?? 0
          const tone = m.resultForTeam === 'W' ? 'text-emerald-400' : m.resultForTeam === 'L' ? 'text-rose-400' : 'text-amber-400'
          return (
            <div key={i} className="flex items-center gap-2.5 text-[11px] py-1">
              <span className={`h-1.5 w-1.5 rounded-full ${m.resultForTeam === 'W' ? 'bg-emerald-400' : m.resultForTeam === 'L' ? 'bg-rose-400' : 'bg-amber-400'}`} />
              <span className="text-white/30 tabular-nums w-12 shrink-0">{new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
              <span className="text-white/55 truncate flex-1">{isHome ? '' : '@ '}{opp}</span>
              <span className={`font-bold tabular-nums ${tone}`}>{gf}-{ga}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: GOLS
// ═══════════════════════════════════════════════════════════════════════════

function TabGols({ data, homeName, awayName, homeAccent, awayAccent }: { data: PreMatchIntelligenceResult; homeName: string; awayName: string; homeAccent: TeamAccent; awayAccent: TeamAccent }) {
  const gp = data.goalsProfile
  const h2h = data.h2h

  // No goals profile — try to make it useful with H2H + watch points
  if (!gp) {
    const h2hAvg = h2h && h2h.total > 0 ? ((h2h.homeGoals + h2h.awayGoals) / h2h.total).toFixed(1) : null
    return (
      <div>
        <div className="px-7 pt-6 pb-2">
          <SectionLabel>Status do Perfil Ofensivo</SectionLabel>
          <StatusTile title="Perfil de gols" status="indisponivel" detail="Sem amostra recente suficiente do provider." />
        </div>

        {h2hAvg && (
          <>
            <Divider />
            <div className="px-7 py-6">
              <SectionLabel>Referencia Historica</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <BigMetric value={h2hAvg} label="Media H2H gols/j" tone="emerald" />
                <BigMetric value={`${h2h!.total}j`} label="Confrontos" tone="white" />
              </div>
              <p className="text-[11px] text-white/50 mt-3 leading-snug">
                Sem perfil recente, o H2H e a referencia mais confiavel. Monitorar volume ofensivo no inicio para confirmar tendencia.
              </p>
            </div>
          </>
        )}

        <Divider />
        <div className="px-7 py-6">
          <SectionLabel>O Que Monitorar Ao Vivo</SectionLabel>
          <ul className="space-y-2 text-[12px] text-white/65">
            <li className="flex items-start gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-cyan-400/70 shrink-0" /><span>Ritmo ofensivo nos primeiros 20 minutos define se o jogo abre cedo.</span></li>
            <li className="flex items-start gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-cyan-400/70 shrink-0" /><span>Finalizacoes na trave costumam preceder gols nos minutos seguintes.</span></li>
            <li className="flex items-start gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" /><span>Apos 60', troca de ritmo aumenta risco de gol em ambos os lados.</span></li>
          </ul>
          <p className="text-[10px] text-white/35 mt-3 leading-snug">Perfil sera fortalecido pela Base GoalSense conforme partidas forem registradas.</p>
        </div>
      </div>
    )
  }

  const trend = gp.over25Pct >= 60 || gp.avgGoalsPerMatch >= 2.8 ? 'Forte' : gp.over25Pct >= 45 ? 'Moderada' : 'Baixa'
  const trendTone = trend === 'Forte' ? 'text-emerald-400' : trend === 'Moderada' ? 'text-amber-400' : 'text-white/55'

  return (
    <div>
      {/* Headline metrics */}
      <div className="px-7 pt-6 pb-5">
        <div className="grid grid-cols-3 gap-3">
          <BigMetric value={String(gp.avgGoalsPerMatch)} label="Media/jogo" tone="emerald" />
          <BigMetric value={`${gp.bothScoredPct}%`} label="Ambos marcam" tone={gp.bothScoredPct >= 55 ? 'amber' : 'white'} />
          <BigMetric value={trend} label="Tendencia" tone={trend === 'Forte' ? 'emerald' : trend === 'Moderada' ? 'amber' : 'white'} valueClassName={trendTone} />
        </div>
      </div>

      <Divider />

      {/* Over bars */}
      <div className="px-7 py-6">
        <SectionLabel>Linhas de Over</SectionLabel>
        <div className="space-y-3">
          <Bar label="Over 1.5" pct={gp.over15Pct} from="#06b6d4" to="#3b82f6" />
          <Bar label="Over 2.5" pct={gp.over25Pct} from="#10b981" to="#34d399" />
          <Bar label="Ambos marcam" pct={gp.bothScoredPct} from="#f59e0b" to="#fb923c" />
        </div>
      </div>

      <Divider />

      {/* Per-team goals */}
      <div className="px-7 py-6">
        <SectionLabel>Gols por Equipe</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TeamGoalsCard teamName={homeName} accent={homeAccent} avgFor={gp.homeAvgFor} avgAgainst={gp.homeAvgAgainst} side="Mandante" />
          <TeamGoalsCard teamName={awayName} accent={awayAccent} avgFor={gp.awayAvgFor} avgAgainst={gp.awayAvgAgainst} side="Visitante" />
        </div>
      </div>

      {/* H2H goals */}
      {h2h && h2h.total > 0 && (
        <>
          <Divider />
          <div className="px-7 py-6">
            <SectionLabel>Gols no Confronto Direto</SectionLabel>
            <div className="grid grid-cols-3 gap-3">
              <BigMetric value={String(h2h.homeGoals)} label={`${homeName.split(' ')[0]} pro`} tone="emerald" />
              <BigMetric value={String(h2h.awayGoals)} label={`${awayName.split(' ')[0]} pro`} tone="emerald" />
              <BigMetric value={((h2h.homeGoals + h2h.awayGoals) / h2h.total).toFixed(1)} label={`Media / ${h2h.total}j`} tone="white" />
            </div>
          </div>
        </>
      )}

      <div className="px-7 pb-5">
        <p className="text-[10px] text-white/35">Amostra: {gp.sampleSize} jogos · leitura, nao previsao.</p>
      </div>
    </div>
  )
}

function TeamGoalsCard({ teamName, accent, avgFor, avgAgainst, side }: { teamName: string; accent: TeamAccent; avgFor: number; avgAgainst: number; side: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-white font-bold truncate flex-1 pr-2">{teamName}</p>
        <span className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">{side}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-[22px] font-bold leading-none tabular-nums" style={{ color: accent.from === '#3b82f6' ? '#60a5fa' : accent.from }}>{avgFor.toFixed(1)}</span>
          <p className="text-[10px] text-white/45 mt-1 font-medium">Marcados/jogo</p>
        </div>
        <div>
          <span className="text-[22px] font-bold leading-none tabular-nums text-rose-400">{avgAgainst.toFixed(1)}</span>
          <p className="text-[10px] text-white/45 mt-1 font-medium">Sofridos/jogo</p>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: ELENCO
// ═══════════════════════════════════════════════════════════════════════════

function TabElenco({ adv, loading, onLoad, homeName, awayName }: { adv: PreMatchAdvancedResult | null; loading: boolean; onLoad: () => void; homeName: string; awayName: string }) {
  if (!adv) {
    return (
      <div className="px-7 py-8">
        <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-cyan-500/[0.04] via-blue-500/[0.03] to-transparent px-6 py-7">
          <div className="text-center">
            <h3 className="text-[16px] text-white font-bold mb-1.5">Elenco e Disponibilidade</h3>
            <p className="text-[12px] text-white/60 leading-relaxed max-w-md mx-auto mb-5">
              Carrega ausencias, suspensoes, pendurados, goleadores e jogadores-chave quando o provider disponibiliza.
            </p>
            <button
              onClick={onLoad}
              disabled={loading}
              type="button"
              className="px-5 py-2.5 rounded-xl text-[12px] font-bold bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-200 border border-cyan-400/25 hover:from-cyan-500/30 hover:to-blue-500/30 disabled:opacity-40 transition-all"
            >
              {loading ? 'Carregando...' : 'Carregar analise avancada'}
            </button>
            <p className="text-[10px] text-white/35 mt-3 font-medium">Consulta sob demanda · preserva limite da API.</p>
          </div>
          <div className="mt-6 pt-5 border-t border-white/[0.05] grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[['Ausencias', 'Lesoes do provider'], ['Suspensos', 'Cartao acumulado'], ['Goleadores', 'Top da liga'], ['Pendurados', 'Se provider expor']].map(([t, d]) => (
              <div key={t} className="rounded-lg bg-white/[0.025] border border-white/[0.04] px-3 py-2">
                <p className="text-[10px] text-white/85 font-bold uppercase tracking-wider">{t}</p>
                <p className="text-[10px] text-white/45 mt-0.5 leading-snug">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const hasInjuries = adv.absences.home.injuries.length + adv.absences.away.injuries.length > 0
  const hasSuspensions = adv.absences.home.suspensions.length + adv.absences.away.suspensions.length > 0
  const hasAbs = hasInjuries || hasSuspensions
  const hasScorers = adv.scorers.home.players.length + adv.scorers.away.players.length > 0

  return (
    <div>
      {/* Status header — always show category status after load */}
      <div className="px-7 pt-6 pb-2">
        <SectionLabel>Status por Categoria</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
          <StatusTile title="Lesoes" status={hasInjuries ? 'disponivel' : 'indisponivel'} detail={hasInjuries ? `${adv.absences.home.injuries.length + adv.absences.away.injuries.length} reportadas pelo provider` : 'Provider nao retornou lesoes para esta liga.'} />
          <StatusTile title="Suspensos" status={hasSuspensions ? 'disponivel' : 'indisponivel'} detail={hasSuspensions ? `${adv.absences.home.suspensions.length + adv.absences.away.suspensions.length} reportados` : 'Sem suspensoes ou cobertura limitada.'} />
          <StatusTile title="Goleadores" status={hasScorers ? 'disponivel' : 'indisponivel'} detail={hasScorers ? 'Top da liga consultado' : 'Liga nao identificada ou sem cobertura.'} />
          <StatusTile title="Jogadores-chave" status="indisponivel" detail="Cobertura ainda nao exposta pelo provider." />
        </div>
      </div>

      {hasAbs && (
        <>
          <Divider />
          <div className="px-7 py-6">
            <SectionLabel>Ausencias</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AbsenceColumn teamName={homeName} report={adv.absences.home} />
              <AbsenceColumn teamName={awayName} report={adv.absences.away} />
            </div>
          </div>
        </>
      )}

      {hasScorers && (
        <>
          <Divider />
          <div className="px-7 py-6">
            <SectionLabel>Goleadores</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ScorersColumn teamName={homeName} report={adv.scorers.home} />
              <ScorersColumn teamName={awayName} report={adv.scorers.away} />
            </div>
          </div>
        </>
      )}

      {adv.riskFlags.length > 0 && (
        <>
          <Divider />
          <div className="px-7 py-5">
            <SectionLabel>Sinais</SectionLabel>
            <div className="space-y-1.5">
              {adv.riskFlags.map((f, i) => (
                <div key={i} className="flex items-start gap-2.5 text-[12px]">
                  <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${f.severity === 'attention' ? 'bg-amber-400' : f.severity === 'critical' ? 'bg-rose-400' : 'bg-cyan-400/70'}`} />
                  <div><span className="text-white/85 font-semibold">{f.label}</span><span className="text-white/55 ml-1.5">{f.detail}</span></div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {adv.limitations.length > 0 && (
        <div className="px-7 pb-5">
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5 font-semibold">Limitacoes do provider</p>
          <ul className="space-y-1">
            {adv.limitations.slice(0, 4).map((l, i) => <li key={i} className="text-[11px] text-amber-400/65 flex items-start gap-2"><span className="text-amber-400/45 mt-0.5">!</span><span>{l}</span></li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

function AbsenceColumn({ teamName, report }: { teamName: string; report: PreMatchAdvancedResult['absences']['home'] }) {
  const empty = report.injuries.length + report.suspensions.length === 0
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
      <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3 font-semibold">{teamName}</p>
      {empty ? (
        <p className="text-[11px] text-white/35">Sem ausencias reportadas.</p>
      ) : (
        <div className="space-y-1.5">
          {report.injuries.map((p, i) => (
            <div key={`i-${i}`} className="flex items-center gap-2.5 text-[12px]">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shrink-0" />
              <span className="text-white/85 font-medium truncate">{p.name}</span>
              <span className="text-[10px] text-rose-400/70 ml-auto uppercase tracking-wider font-semibold">Lesao</span>
            </div>
          ))}
          {report.suspensions.map((p, i) => (
            <div key={`s-${i}`} className="flex items-center gap-2.5 text-[12px]">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-white/85 font-medium truncate">{p.name}</span>
              <span className="text-[10px] text-amber-400/70 ml-auto uppercase tracking-wider font-semibold">Suspenso</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ScorersColumn({ teamName, report }: { teamName: string; report: PreMatchAdvancedResult['scorers']['home'] }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
      <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3 font-semibold">{teamName}</p>
      {report.players.length === 0 ? (
        <p className="text-[11px] text-white/35">Sem destaque ofensivo na liga.</p>
      ) : (
        <div className="space-y-2">
          {report.players.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5 text-[12px]">
              <span className="text-white/85 font-medium truncate flex-1">{p.name}</span>
              <span className="text-emerald-400 font-bold tabular-nums">{p.goals}g</span>
              {p.assists ? <span className="text-blue-400 font-bold tabular-nums">{p.assists}a</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: PADROES
// ═══════════════════════════════════════════════════════════════════════════

function TabPadroes({ patterns, hasActivePatterns, score, isAdvanced }: { patterns: PreMatchPatternReadiness[]; hasActivePatterns: boolean; score: PreMatchScore | null; isAdvanced: boolean }) {
  if (!hasActivePatterns) {
    const examples: { name: string; description: string; window: string }[] = [
      { name: 'Pressao por gol', description: 'Volume ofensivo sem gol em jogo equilibrado.', window: '55\'-90\'' },
      { name: 'Reta final perigosa', description: 'Empate ou diferenca minima na reta final.', window: '70\'-90\'' },
      { name: 'Over tendencia', description: 'Perfil de gols + ritmo confirmando jogo aberto.', window: '0\'-90\'' },
      { name: 'Favorito em risco', description: 'Favorito sem dominio nos primeiros 30 minutos.', window: '0\'-30\'' },
    ]
    return (
      <div className="px-7 py-7 space-y-5">
        <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-amber-500/[0.04] via-orange-500/[0.025] to-transparent px-6 py-6">
          <h3 className="text-[16px] text-white font-bold mb-1.5">Nenhum radar ativo</h3>
          <p className="text-[12px] text-white/65 leading-relaxed max-w-md">
            Pre-jogo nao dispara alerta. Configure padroes no Command Center para monitorar condicoes ao vivo.
          </p>
          <p className="text-[10px] text-white/40 mt-3 font-medium uppercase tracking-wider">Pre-jogo prepara monitoramento · alertas sao gerados ao vivo</p>
        </div>

        <div>
          <SectionLabel>Exemplos de Padroes Uteis</SectionLabel>
          <p className="text-[11px] text-white/45 mb-3">Apenas referencia — nao sao radares ativos. Configure-os no Command Center para receberem dados deste confronto.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {examples.map(ex => (
              <div key={ex.name} className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[12px] text-white font-bold">{ex.name}</p>
                  <span className="text-[10px] text-cyan-300/70 font-bold tabular-nums">{ex.window}</span>
                </div>
                <p className="text-[11px] text-white/55 leading-snug">{ex.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (patterns.length === 0) {
    return (
      <div className="px-7 py-10 text-center">
        <p className="text-[13px] text-white/55 font-medium">Nenhum padrao se aplica a este confronto.</p>
        <p className="text-[11px] text-white/35 mt-1">Isso pode acontecer por escopo (favoritos, ligas, times) ou por condicoes.</p>
      </div>
    )
  }

  const visible = isAdvanced ? patterns : patterns.filter(p => p.readiness !== 'not_applicable')

  return (
    <div className="px-7 py-6 space-y-2">
      <SectionLabel>Padroes Monitoraveis</SectionLabel>
      {visible.map(r => <PatternRow key={r.patternId} r={r} />)}
      {score && score.watchPoints.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/[0.05]">
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2 font-semibold">Watch Points Operacionais</p>
          <ul className="space-y-1.5">
            {score.watchPoints.map((wp, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[12px]">
                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${wp.severity === 'attention' ? 'bg-amber-400' : 'bg-cyan-400/70'}`} />
                <span className="text-white/70">{wp.label}</span>
                <span className="text-white/45">· {wp.detail}{wp.timing ? ` · ${wp.timing}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PatternRow({ r }: { r: PreMatchPatternReadiness }) {
  const cfg =
    r.readiness === 'ready'
      ? { dot: 'bg-emerald-400', label: 'Pronto', tone: 'text-emerald-300' }
      : r.readiness === 'needs_live_data'
      ? { dot: 'bg-cyan-400/70', label: 'Aguarda live', tone: 'text-cyan-300' }
      : r.readiness === 'needs_more_data'
      ? { dot: 'bg-amber-400/70', label: 'Mais dados', tone: 'text-amber-300' }
      : { dot: 'bg-white/30', label: 'N/A', tone: 'text-white/40' }
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[13px] text-white/90 font-semibold truncate">{r.patternName}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.tone}`}>{cfg.label}</span>
            {r.triggerWindow && <span className="text-[10px] text-white/45 font-medium">· {r.triggerWindow}</span>}
          </div>
          <p className="text-[11px] text-white/55 mt-1 leading-snug">{r.reason}</p>
          {r.watchPoint && <p className="text-[11px] text-white/40 mt-1 leading-snug italic">{r.watchPoint}</p>}
          {r.requiredData.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {r.requiredData.map((d, i) => <span key={i} className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.04] text-white/40 font-semibold">{d}</span>)}
            </div>
          )}
        </div>
        {r.confidencePreview > 0 && <span className="text-[11px] text-white/55 tabular-nums font-bold">{r.confidencePreview}%</span>}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: AUDITORIA
// ═══════════════════════════════════════════════════════════════════════════

function TabAuditoria({ data, homeId, awayId }: { data: PreMatchIntelligenceResult; homeId?: string | number; awayId?: string | number }) {
  type BlockStatus = 'disponivel' | 'parcial' | 'indisponivel' | 'sob_demanda' | 'nao_consultado'
  const blocks: { title: string; status: BlockStatus; detail: string }[] = [
    { title: 'Team ID mandante', status: homeId ? 'disponivel' : 'indisponivel', detail: homeId ? `Resolvido: ${homeId}` : 'Nao resolvido pelo provider.' },
    { title: 'Team ID visitante', status: awayId ? 'disponivel' : 'indisponivel', detail: awayId ? `Resolvido: ${awayId}` : 'Nao resolvido pelo provider.' },
    { title: 'Forma geral', status: data.homeForm && data.awayForm ? 'disponivel' : data.homeForm || data.awayForm ? 'parcial' : 'indisponivel', detail: data.homeForm && data.awayForm ? `${data.homeForm.matches.length}j / ${data.awayForm.matches.length}j` : 'Provider sem amostra suficiente.' },
    { title: 'Forma casa/fora', status: data.homeAtHome && data.awayAway ? 'disponivel' : data.homeAtHome || data.awayAway ? 'parcial' : 'indisponivel', detail: data.homeAtHome && data.awayAway ? `${data.homeAtHome.matches.length}j em casa / ${data.awayAway.matches.length}j fora` : 'Recorte mandante/visitante limitado.' },
    { title: 'Perfil de gols', status: data.goalsProfile ? (data.goalsProfile.sampleSize >= 6 ? 'disponivel' : 'parcial') : 'indisponivel', detail: data.goalsProfile ? `Amostra ${data.goalsProfile.sampleSize}` : 'Sem amostra suficiente.' },
    { title: 'Disciplina', status: data.disciplineProfile && data.disciplineProfile.trend !== 'unknown' ? 'disponivel' : 'indisponivel', detail: data.disciplineProfile?.trend ? `Tendencia: ${data.disciplineProfile.trend}` : 'Provider sem eventos disciplinares recentes.' },
    { title: 'H2H', status: data.h2h ? 'disponivel' : 'indisponivel', detail: data.h2h ? `${data.h2h.total} confrontos analisados` : 'Provider nao retornou H2H.' },
    { title: 'Elenco avancado', status: 'sob_demanda', detail: 'Carregado apenas via aba Elenco para preservar quota.' },
    { title: 'Base GoalSense', status: data.dataSources.includes('Base GoalSense') ? 'parcial' : 'nao_consultado', detail: data.dataSources.includes('Base GoalSense') ? 'Historico GoalSense aplicado em fallback.' : 'Sem amostra acumulada deste confronto.' },
    { title: 'Cache GoalSense', status: data.dataSources.includes('Cache GoalSense') ? 'disponivel' : 'nao_consultado', detail: data.dataSources.includes('Cache GoalSense') ? 'Resposta servida do cache.' : 'Resposta direta do provider.' },
  ]

  return (
    <div className="px-7 py-6 space-y-5">
      <div>
        <SectionLabel>Status dos Blocos</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {blocks.map(b => <StatusTile key={b.title} title={b.title} status={b.status} detail={b.detail} />)}
        </div>
      </div>

      {data.dataSources.length > 0 && (
        <div>
          <SectionLabel>Fontes</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {data.dataSources.map((s, i) => <span key={i} className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-400/15">{s}</span>)}
          </div>
        </div>
      )}

      {data.limitations.length > 0 && (
        <div>
          <SectionLabel>Limitacoes Detectadas</SectionLabel>
          <ul className="space-y-1">
            {data.limitations.map((l, i) => (
              <li key={i} className="text-[11px] text-amber-400/70 flex items-start gap-2"><span className="text-amber-400/50 mt-0.5">!</span><span>{l}</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Confianca Geral</p>
        <p className="text-[12px] text-white/75 leading-snug">
          Status: <span className="text-white font-bold">{data.status}</span> · Confianca: <span className="text-white font-bold">{data.confidence}</span>
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED: TeamColumn, VsCenter, ComparatorRail, H2HRail, Bar, Stat, BigMetric
// ═══════════════════════════════════════════════════════════════════════════

function TeamColumn({ name, accent, form, venue, venueLabel, align }: { name: string; accent: TeamAccent; form?: TeamFormSummary; venue?: TeamFormSummary; venueLabel: string; align: 'left' | 'right' }) {
  const ta = align === 'right' ? 'text-right' : 'text-left'
  const fj = align === 'right' ? 'justify-end' : 'justify-start'
  return (
    <div className={ta}>
      <div className={`flex items-center gap-2 mb-2.5 ${fj}`}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`, boxShadow: `0 0 12px ${accent.soft}` }} />
        <p className="text-[14px] font-bold text-white truncate">{name}</p>
      </div>
      {form ? (
        <>
          <div className={`flex gap-1 mb-3 ${fj}`}>
            {form.formString.split(' ').map((r, i) => (
              <span key={i} className={`h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold ${r === 'W' ? 'bg-emerald-500/22 text-emerald-300 border border-emerald-400/20' : r === 'D' ? 'bg-amber-500/15 text-amber-300 border border-amber-400/15' : 'bg-rose-500/18 text-rose-300 border border-rose-400/15'}`}>
                {r === 'W' ? 'V' : r === 'D' ? 'E' : 'D'}
              </span>
            ))}
          </div>
          <div className="space-y-1 text-[12px]">
            <div className={`flex items-center gap-3 ${fj}`}><span className="text-white/40">Pro</span><span className="text-emerald-400 font-bold tabular-nums">{form.summary.goalsFor}</span></div>
            <div className={`flex items-center gap-3 ${fj}`}><span className="text-white/40">Contra</span><span className="text-rose-400 font-bold tabular-nums">{form.summary.goalsAgainst}</span></div>
            <div className={`flex items-center gap-3 ${fj}`}>
              <span className="text-white/40">Saldo</span>
              <span className={`font-bold tabular-nums ${form.summary.goalsFor - form.summary.goalsAgainst > 0 ? 'text-emerald-400' : form.summary.goalsFor - form.summary.goalsAgainst < 0 ? 'text-rose-400' : 'text-white/55'}`}>
                {form.summary.goalsFor - form.summary.goalsAgainst > 0 ? '+' : ''}
                {form.summary.goalsFor - form.summary.goalsAgainst}
              </span>
            </div>
          </div>
          {venue && venue.matches.length >= 2 && (
            <div className="mt-3 pt-3 border-t border-white/[0.05]">
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1 font-semibold">{venueLabel}</p>
              <p className="text-[11px] text-white/65">
                <span className="text-emerald-400 font-bold">{venue.summary.wins}V</span> {venue.summary.draws}E <span className="text-rose-400 font-bold">{venue.summary.losses}D</span>
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="text-[11px] text-white/30">Forma indisponivel</p>
      )}
    </div>
  )
}

function VsCenter({ score, balanceLabel, h2hTotal, h2h, homeName, awayName, hasRecentForm }: { score: PreMatchScore | null; balanceLabel: string; h2hTotal?: number; h2h?: PreMatchIntelligenceResult['h2h']; homeName: string; awayName: string; hasRecentForm: boolean }) {
  const balanceTone = !score
    ? 'text-white/45'
    : score.balance.score >= 65
    ? 'text-white/80'
    : score.homeStrength.score > score.awayStrength.score + 10
    ? 'text-blue-300'
    : score.awayStrength.score > score.homeStrength.score + 10
    ? 'text-emerald-300'
    : 'text-white/65'

  // Microcopy: history-based reading
  let historyNote: string | null = null
  if (h2h && h2h.total >= 3) {
    if (h2h.homeWins > h2h.awayWins + 1) historyNote = `Historico favorece ${homeName.split(' ')[0]}`
    else if (h2h.awayWins > h2h.homeWins + 1) historyNote = `Historico favorece ${awayName.split(' ')[0]}`
    else historyNote = 'Historico equilibrado'
  } else if (!hasRecentForm) {
    historyNote = 'Dados recentes limitados'
  }

  return (
    <div className="flex flex-col items-center justify-start pt-1 gap-2">
      <div className="relative h-[68px] w-[68px] rounded-full bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-white/[0.02] border border-white/[0.12] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_8px_24px_-12px_rgba(0,0,0,0.6)]">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.10),transparent_55%)] pointer-events-none" />
        <div className="absolute inset-1 rounded-full border border-white/[0.04]" />
        <span className="relative text-[11px] text-white/65 font-bold tracking-[0.2em]">VS</span>
      </div>
      <span className={`text-[11px] font-bold uppercase tracking-wider whitespace-nowrap ${balanceTone}`}>{balanceLabel}</span>
      {h2hTotal !== undefined && <span className="text-[10px] text-white/45 font-medium tabular-nums">{h2hTotal} confrontos</span>}
      {historyNote && <span className="text-[10px] text-white/55 font-medium text-center leading-tight max-w-[120px]">{historyNote}</span>}
    </div>
  )
}

// ─── Contextual Rail ─────────────────────────────────────────────────────
function ContextualRail({ label, left, right, leftAccent, rightAccent, contextLabel, limited, muted }: { label: string; left: number; right: number; leftAccent: TeamAccent; rightAccent: TeamAccent; contextLabel: string; limited?: boolean; muted?: boolean }) {
  const total = Math.max(left + right, 1)
  const lp = (left / total) * 100
  const rp = (right / total) * 100
  return (
    <div className="flex items-center gap-3" title={limited ? 'base limitada' : undefined}>
      <span className="text-[10px] text-white/55 w-[78px] shrink-0 font-semibold uppercase tracking-wider">{label}</span>
      <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-white/[0.05]">
        <div className="h-full transition-all" style={{ width: `${lp}%`, background: muted ? `linear-gradient(90deg, ${leftAccent.from}90, ${leftAccent.to}90)` : `linear-gradient(90deg, ${leftAccent.from}, ${leftAccent.to})` }} />
        <div className="h-full transition-all" style={{ width: `${rp}%`, background: muted ? `linear-gradient(90deg, ${rightAccent.from}90, ${rightAccent.to}90)` : `linear-gradient(90deg, ${rightAccent.from}, ${rightAccent.to})` }} />
      </div>
      <div className="flex items-center gap-2 w-[110px] justify-end shrink-0">
        <span className="text-[10px] text-white/55 tabular-nums font-bold">{left}–{right}</span>
        <span className={`text-[10px] font-semibold ${limited ? 'text-white/40' : 'text-white/65'}`}>{contextLabel}{limited ? ' · limitado' : ''}</span>
      </div>
    </div>
  )
}

// ─── H2H Reading ─────────────────────────────────────────────────────────
function H2HReading({ h2h, homeName, awayName }: { h2h: NonNullable<PreMatchIntelligenceResult['h2h']>; homeName: string; awayName: string }) {
  const total = h2h.total
  const exhibitedTotal = h2h.homeWins + h2h.draws + h2h.awayWins
  const isPartial = exhibitedTotal < total
  const avg = ((h2h.homeGoals + h2h.awayGoals) / total).toFixed(1)
  let reading: string
  if (h2h.homeWins > h2h.awayWins + 1) reading = `${homeName} tem vantagem no historico recente.`
  else if (h2h.awayWins > h2h.homeWins + 1) reading = `${awayName} tem vantagem no historico recente.`
  else reading = 'Historico equilibrado entre as equipes.'
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5">
      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400/70 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-white/85 leading-snug font-medium">
          {reading} <span className="text-white/55">Media historica de {avg} gols/jogo.</span>
        </p>
        {isPartial && <p className="text-[10px] text-amber-400/65 mt-0.5">Resumo H2H parcial retornado pelo provider.</p>}
      </div>
    </div>
  )
}

// ─── Operational Timeline ────────────────────────────────────────────────
function OperationalTimeline({ score, hasGoalsProfile, hasH2h }: { score: PreMatchScore | null; hasGoalsProfile: boolean; hasH2h: boolean }) {
  // Always present 3 operational checkpoints. Reinforce with engine watch points when available.
  const baseline: { timing: string; label: string; detail: string; severity: 'info' | 'attention' }[] = [
    { timing: '0\'-20\'', label: 'Ritmo inicial', detail: 'Observar posse, pressao e primeiras finalizacoes.', severity: 'info' },
    { timing: '45\'-60\'', label: 'Ajuste pos-intervalo', detail: 'Reacao imediata costuma definir o tom do segundo tempo.', severity: 'info' },
    { timing: '70\'-90\'', label: 'Reta final', detail: 'Volume ofensivo e desgaste fisico aumentam risco de gol e cartao.', severity: 'attention' },
  ]
  const enginePoints = score?.watchPoints ?? []
  // Reinforce baseline detail when engine has matching insight
  const enriched = baseline.map(b => {
    const match = enginePoints.find(p => (p.timing || '').includes(b.timing.slice(0, 3)) || b.label.toLowerCase().includes((p.label || '').toLowerCase().slice(0, 6)))
    return match ? { ...b, detail: match.detail, severity: match.severity === 'critical' ? 'attention' as const : match.severity } : b
  })

  return (
    <>
      <ol className="relative space-y-3">
        <span className="absolute left-[5px] top-2 bottom-2 w-px bg-gradient-to-b from-cyan-400/30 via-white/10 to-amber-400/25" aria-hidden />
        {enriched.map((wp, i) => (
          <li key={i} className="relative flex items-start gap-3 pl-1">
            <span className={`relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-[#0b1018] ${wp.severity === 'attention' ? 'bg-amber-400' : 'bg-cyan-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[10px] text-white/55 font-bold uppercase tracking-wider tabular-nums">{wp.timing}</span>
                <span className="text-[13px] text-white font-semibold">{wp.label}</span>
              </div>
              <p className="text-[12px] text-white/65 leading-snug mt-0.5">{wp.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      {enginePoints.length < 2 && (
        <p className="text-[10px] text-white/45 mt-3 leading-snug">
          Pontos universais aplicados — {hasGoalsProfile ? 'perfil de gols reforca a leitura.' : hasH2h ? 'apenas H2H disponivel para reforco.' : 'dados recentes ainda limitados.'}
        </p>
      )}
    </>
  )
}

function H2HRail({ h2h, homeName, awayName, homeAccent, awayAccent, recent }: { h2h: PreMatchIntelligenceResult['h2h']; homeName: string; awayName: string; homeAccent: TeamAccent; awayAccent: TeamAccent; recent?: PreMatchIntelligenceResult['recentMeetings'] }) {
  if (!h2h) return null
  const total = h2h.total
  const hp = (h2h.homeWins / total) * 100
  const dp = (h2h.draws / total) * 100
  const ap = (h2h.awayWins / total) * 100
  const homeShort = homeName.split(' ')[0]
  const awayShort = awayName.split(' ')[0]
  return (
    <div>
      <div className="h-3.5 w-full rounded-full overflow-hidden bg-white/[0.04] flex shadow-[inset_0_1px_0_rgba(0,0,0,0.4)]">
        <div className="h-full transition-all" style={{ width: `${hp}%`, background: `linear-gradient(90deg, ${homeAccent.from}, ${homeAccent.to})` }} />
        <div className="h-full bg-white/[0.18]" style={{ width: `${dp}%` }} />
        <div className="h-full transition-all" style={{ width: `${ap}%`, background: `linear-gradient(90deg, ${awayAccent.from}, ${awayAccent.to})` }} />
      </div>
      <div className="flex justify-between items-center mt-2.5 text-[12px]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: `linear-gradient(135deg, ${homeAccent.from}, ${homeAccent.to})` }} />
          <span className="text-white/90 font-bold tabular-nums">{h2h.homeWins}V</span>
          <span className="text-white/55">{homeShort}</span>
        </div>
        <div className="text-white/65 font-medium">{h2h.draws} empates</div>
        <div className="flex items-center gap-2">
          <span className="text-white/55">{awayShort}</span>
          <span className="text-white/90 font-bold tabular-nums">{h2h.awayWins}V</span>
          <span className="h-2 w-2 rounded-sm" style={{ background: `linear-gradient(135deg, ${awayAccent.from}, ${awayAccent.to})` }} />
        </div>
      </div>
      {recent && recent.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-1">
          {recent.slice(0, 3).map((m, i) => (
            <div key={i} className="flex items-center gap-3 text-[11px]">
              <span className="text-white/40 tabular-nums w-16 shrink-0">{new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
              <span className="text-white/65 flex-1 truncate text-right">{m.homeTeam}</span>
              <span className="text-white/95 font-bold tabular-nums">{m.homeScore}-{m.awayScore}</span>
              <span className="text-white/65 flex-1 truncate">{m.awayTeam}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Bar({ label, pct, from, to }: { label: string; pct: number; from: string; to: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] text-white/65 font-medium">{label}</span>
        <span className="text-[14px] text-white font-bold tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${from}, ${to})` }} />
      </div>
    </div>
  )
}

function Stat({ value, label, tone, small }: { value: string; label: string; tone: 'emerald' | 'amber' | 'rose' | 'white'; small?: boolean }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : tone === 'rose' ? 'text-rose-400' : 'text-white/90'
  return (
    <div>
      <span className={`${small ? 'text-[14px]' : 'text-[16px]'} font-bold ${c} block leading-none tabular-nums`}>{value}</span>
      <span className="text-[10px] text-white/45 block mt-1 font-medium">{label}</span>
    </div>
  )
}

function BigMetric({ value, label, tone, valueClassName }: { value: string; label: string; tone: 'emerald' | 'amber' | 'rose' | 'white'; valueClassName?: string }) {
  const c = valueClassName || (tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : tone === 'rose' ? 'text-rose-400' : 'text-white')
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
      <span className={`text-[26px] font-bold ${c} block leading-none tabular-nums`}>{value}</span>
      <span className="text-[10px] text-white/50 block mt-1.5 font-semibold uppercase tracking-wider">{label}</span>
    </div>
  )
}
