/**
 * AutoOpportunityDrawer — the Opportunity Inspector. (B20)
 * ─────────────────────────────────────────────────────────────────────────────
 * Wide right-side drawer with 6 tabs. Everything shown comes from the real
 * AutoOpportunity object (no fetch needed for the core). The "Contexto histórico"
 * tab optionally enriches with the related pattern's B13 learning profile.
 *
 * Opportunity ≠ alert. Score ≠ probability. unknown/missing ≠ failure. No odds,
 * no bet CTA, no Telegram, no "create alert" button.
 */
import { useEffect, useMemo, useState } from 'react'
import { X, FileText, Layers, Gauge, ShieldAlert, History, GraduationCap, FlaskConical, Zap, ExternalLink } from 'lucide-react'
import type { AutoOpportunityDto } from '@/features/command/intelligence/autoEngineTypes'
import {
  OPP_TYPE_LABEL, STATUS_LABEL, STATUS_TONE, BAND_LABEL, SAMPLE_LABEL, DATA_QUALITY_LABEL, blockReasonLabel,
} from '@/features/command/intelligence/autoEngineTypes'
import { alertIntelligenceApi, isAlertIntelligenceConfigured } from '@/services/alertIntelligenceApi'

interface Props {
  opportunity: AutoOpportunityDto
  onClose: () => void
  onGoToBacktest?: () => void
  onGoToAlerts?: () => void
  onOpenMatch?: (fixtureId: string) => void
}

type DrawerTab = 'resumo' | 'evidencias' | 'score' | 'riscos' | 'contexto' | 'aprendizado'

const TABS: { id: DrawerTab; label: string; icon: typeof FileText }[] = [
  { id: 'resumo', label: 'Resumo', icon: FileText },
  { id: 'evidencias', label: 'Evidências', icon: Layers },
  { id: 'score', label: 'Score', icon: Gauge },
  { id: 'riscos', label: 'Riscos / Bloqueios', icon: ShieldAlert },
  { id: 'contexto', label: 'Contexto histórico', icon: History },
  { id: 'aprendizado', label: 'Aprendizado', icon: GraduationCap },
]

interface RelatedProfile {
  usefulRate?: number | null
  failedRate?: number | null
  unknownRate?: number | null
  sampleQuality?: string
  totalSignals?: number
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2.5">{title}</h4>
      {children}
    </div>
  )
}
function List({ items, empty = '—', tone = 'neutral' }: { items: string[]; empty?: string; tone?: 'neutral' | 'ok' | 'miss' | 'risk' }) {
  if (!items || items.length === 0) return <p className="text-[11px] text-white/30">{empty}</p>
  const dot = tone === 'ok' ? 'text-[#5EEAD4]/70' : tone === 'risk' ? 'text-amber-300/60' : tone === 'miss' ? 'text-white/25' : 'text-white/30'
  return (
    <ul className="space-y-1.5">
      {items.map((s, i) => <li key={i} className="text-[12px] text-white/70 flex gap-2"><span className={`${dot} mt-0.5`}>·</span><span className="flex-1">{s}</span></li>)}
    </ul>
  )
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-1"><span className="text-[11px] text-white/45">{k}</span><span className="text-[12px] text-white/85 text-right">{v}</span></div>
}
function pct(n: number | null | undefined): string { return n == null ? '—' : `${Math.round(n * 100)}%` }

export function AutoOpportunityDrawer({ opportunity: o, onClose, onGoToBacktest, onGoToAlerts, onOpenMatch }: Props) {
  const [tab, setTab] = useState<DrawerTab>('resumo')
  const [profile, setProfile] = useState<RelatedProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const relatedPatternId = o.relatedPatternIds?.[0] || null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let alive = true
    if (tab !== 'contexto' || !relatedPatternId || !isAlertIntelligenceConfigured()) return
    setProfileLoading(true)
    alertIntelligenceApi.getPatternLearningProfile(relatedPatternId)
      .then(p => { if (alive) setProfile((p as RelatedProfile) || null) })
      .catch(() => { if (alive) setProfile(null) })
      .finally(() => { if (alive) setProfileLoading(false) })
    return () => { alive = false }
  }, [tab, relatedPatternId])

  const liveStats = useMemo(() => Object.entries(o.evidence?.liveStatsUsed || {}), [o])

  return (
    <div className="fixed inset-0 z-[130] flex justify-end">
      <div className="absolute inset-0 bg-[#05080d]/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-[720px] h-full bg-[#0b0f16] border-l border-white/[0.1] flex flex-col animate-fadeIn">
        {/* Header */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-white/[0.07]">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                <span className="text-[11px] text-white/45">{OPP_TYPE_LABEL[o.opportunityType]}</span>
              </div>
              <h3 className="text-[17px] font-semibold text-white/95 tracking-tight truncate">{o.fixtureLabel}</h3>
              <p className="text-[12px] text-white/45 mt-0.5">{o.leagueName} · {o.minute != null ? `${o.minute}'` : "—'"} · {o.scoreState.home}–{o.scoreState.away}</p>
            </div>
            <button onClick={onClose} type="button" aria-label="Fechar" className="h-8 w-8 rounded-full grid place-items-center text-white/55 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white/90 transition-colors shrink-0"><X size={15} /></button>
          </div>
          {/* Tab strip */}
          <div className="flex items-center gap-0.5 mt-4 -mb-4 overflow-x-auto sidebar-scroll">
            {TABS.map(t => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.id ? 'border-[#2DD4BF] text-white/90' : 'border-transparent text-white/45 hover:text-white/70'}`}>
                <t.icon size={13} />{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto sidebar-scroll p-5 space-y-4">
          {tab === 'resumo' && (
            <>
              <div className="rounded-xl border border-[#2DD4BF]/15 bg-[#13B8A6]/[0.05] p-4">
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <span className="block text-[30px] font-bold text-white/90 tabular-nums leading-none">{o.score}</span>
                    <span className="block text-[9px] text-white/40 uppercase tracking-wider mt-1">{BAND_LABEL[o.confidenceBand]}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] text-white/90 font-medium">{o.explanation.headline}</p>
                    <p className="text-[12px] text-white/55 mt-1">{o.explanation.whyNow.slice(0, 3).join(' ')}</p>
                  </div>
                </div>
              </div>
              <Section title="Por que agora"><List items={o.explanation.whyNow} tone="ok" /></Section>
              <p className="text-[11px] text-white/40 px-1">Oportunidade automática não é alerta nem recomendação de aposta. O score mede a qualidade relativa do sinal com os dados disponíveis — não é probabilidade garantida.</p>
            </>
          )}

          {tab === 'evidencias' && (
            <>
              <Section title="Dados ao vivo usados">
                {liveStats.length === 0
                  ? <p className="text-[11px] text-white/30">Sem estatísticas ao vivo disponíveis para este jogo.</p>
                  : <div className="grid grid-cols-2 sm:grid-cols-3 gap-px rounded-lg overflow-hidden border border-white/[0.06]">
                      {liveStats.map(([k, v]) => (
                        <div key={k} className="bg-[#080d16] px-3 py-2 text-center">
                          <span className="block text-[14px] font-semibold text-white/85 tabular-nums leading-none">{v}</span>
                          <span className="block text-[9px] text-white/40 uppercase tracking-wider mt-1">{k}</span>
                        </div>
                      ))}
                    </div>}
                <div className="mt-2"><KV k="Eventos ofensivos recentes" v={o.evidence.recentOffensiveEvents} /><KV k="Qualidade dos dados" v={DATA_QUALITY_LABEL[o.evidence.dataQuality]} /><KV k="Provedor" v={o.evidence.provider || '—'} /></div>
              </Section>
              <Section title="Sinais que sustentaram"><List items={o.evidence.passedSignals} tone="ok" empty="Nenhum sinal confirmado." /></Section>
              <Section title="Dados ausentes / indisponíveis">
                <List items={o.evidence.missingData} tone="miss" empty="Nenhum dado essencial ausente." />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(o.dataAvailability || {}).map(([k, ok]) => (
                    <span key={k} className={`text-[10.5px] px-1.5 py-0.5 rounded border ${ok ? 'bg-[#13B8A6]/8 border-[#2DD4BF]/20 text-[#7FE9DC]/80' : 'bg-white/[0.03] border-white/[0.08] text-white/40'}`}>{k}: {ok ? 'disponível' : 'indisponível'}</span>
                  ))}
                </div>
              </Section>
              <Section title="Contexto da partida">
                <KV k="Competição" v={o.contextFit.competitionType || 'desconhecida'} />
                <KV k="Importância" v={o.contextFit.importanceLabel || '—'} />
                <KV k="Janela de minuto" v={o.contextFit.minuteWindow} />
                {o.contextFit.source === 'heuristic' && <p className="text-[11px] text-amber-100/60 mt-1">Tipo/fase da competição são heurísticos (derivados do nome) — não é dado estruturado.</p>}
              </Section>
            </>
          )}

          {tab === 'score' && (
            <>
              <Section title="Score Ledger">
                <ScoreRow label="Base da estratégia" v={o.scoreBreakdown.baseScore} />
                <ScoreRow label="Contexto ao vivo" v={o.scoreBreakdown.liveContextScore} />
                <ScoreRow label="Aprendizado do padrão" v={o.scoreBreakdown.patternLearningScore} />
                <ScoreRow label="Competição" v={o.scoreBreakdown.competitionScore} />
                <ScoreRow label="Contexto de time" v={o.scoreBreakdown.teamContextScore} />
                <ScoreRow label="Janela de minuto" v={o.scoreBreakdown.minuteWindowScore} />
                <ScoreRow label="Qualidade dos dados" v={o.scoreBreakdown.dataQualityScore} />
                <ScoreRow label="Penalidade de risco" v={-Math.abs(o.scoreBreakdown.riskPenalty)} />
                <div className="border-t border-white/[0.08] mt-2 pt-2 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-white/85">Score final</span>
                  <span className="text-[16px] font-bold text-white/90 tabular-nums">{o.scoreBreakdown.finalScore}</span>
                </div>
              </Section>
              {o.scoreBreakdown.scoringNotes.length > 0 && <Section title="Notas do cálculo"><List items={o.scoreBreakdown.scoringNotes} /></Section>}
              <p className="text-[11px] text-white/40 px-1">Score mede a qualidade relativa do sinal com os dados disponíveis. Não é probabilidade nem promessa de resultado.</p>
            </>
          )}

          {tab === 'riscos' && (
            <>
              <div className={`rounded-xl border p-4 ${o.riskGate.allowed ? 'border-[#2DD4BF]/15 bg-[#13B8A6]/[0.04]' : 'border-amber-400/18 bg-amber-500/[0.05]'}`}>
                <p className="text-[13px] font-medium text-white/85">Decisão do filtro de risco: <span className="capitalize">{o.riskGate.finalDecision}</span></p>
                <p className="text-[11.5px] text-white/50 mt-1">{o.riskGate.allowed ? 'A oportunidade passou no filtro conservador.' : 'A oportunidade foi bloqueada — isso é o motor sendo conservador, não um erro.'}</p>
              </div>
              <Section title="Motivos de bloqueio">
                <List items={(o.riskGate.blockReasons || []).map(blockReasonLabel)} tone="risk" empty="Nenhum — nada bloqueou esta oportunidade." />
              </Section>
              {o.riskGate.warnings.length > 0 && <Section title="Avisos (não bloqueiam)"><List items={o.riskGate.warnings} tone="risk" /></Section>}
              {o.riskGate.penalties.length > 0 && (
                <Section title="Penalidades aplicadas ao score">
                  {o.riskGate.penalties.map((p, i) => <KV key={i} k={p.reason.replace(/_/g, ' ')} v={`-${p.amount}`} />)}
                </Section>
              )}
              <p className="text-[11px] text-white/40 px-1">Dados ausentes são motivo de bloqueio, nunca uma "falha". unknown ≠ failed.</p>
            </>
          )}

          {tab === 'contexto' && (
            <>
              <Section title="Contextos históricos compatíveis">
                <List items={o.contextFit.matchedLearningContexts} empty="Sem histórico suficiente para este contexto." />
                <div className="mt-2"><KV k="Amostra" v={SAMPLE_LABEL[o.contextFit.sampleQuality]} /><KV k="Origem do contexto" v={o.contextFit.source === 'observed' ? 'observado (histórico)' : o.contextFit.source === 'heuristic' ? 'heurístico (nome)' : 'limitado'} /></div>
              </Section>
              {relatedPatternId && (
                <Section title="Perfil do padrão relacionado (B13)">
                  {profileLoading
                    ? <p className="text-[11px] text-white/40">Carregando perfil de aprendizado…</p>
                    : profile
                      ? <><KV k="Útil" v={pct(profile.usefulRate)} /><KV k="Falhou" v={pct(profile.failedRate)} /><KV k="Sem dados (unknown)" v={pct(profile.unknownRate)} /><KV k="Amostra" v={profile.sampleQuality ? SAMPLE_LABEL[profile.sampleQuality as keyof typeof SAMPLE_LABEL] || profile.sampleQuality : '—'} />
                          <p className="text-[11px] text-white/40 mt-2">"Útil" inclui confirmações parciais. unknown é contabilizado à parte e nunca como falha.</p></>
                      : <p className="text-[11px] text-white/40">Sem perfil de aprendizado disponível para o padrão relacionado.</p>}
                </Section>
              )}
              {o.contextFit.notes.length > 0 && <Section title="Notas de contexto"><List items={o.contextFit.notes} /></Section>}
            </>
          )}

          {tab === 'aprendizado' && (
            <>
              <Section title="Explicação relacionada">
                <List items={o.explanation.historicalContext} empty="Sem contexto histórico registrado." />
                {o.explanation.relatedPatternNote && <p className="text-[12px] text-white/70 mt-2">{o.explanation.relatedPatternNote}</p>}
              </Section>
              <Section title="Investigar">
                <div className="flex flex-col gap-2">
                  {relatedPatternId && onGoToBacktest && (
                    <LinkRow icon={<FlaskConical size={14} />} label="Rodar backtest do padrão relacionado" onClick={onGoToBacktest} />
                  )}
                  {onGoToAlerts && (
                    <LinkRow icon={<Zap size={14} />} label="Ver alertas parecidos" onClick={onGoToAlerts} />
                  )}
                  {onOpenMatch && (
                    <LinkRow icon={<ExternalLink size={14} />} label="Abrir jogo no Command Center" onClick={() => onOpenMatch(o.fixtureId)} />
                  )}
                  {!relatedPatternId && <p className="text-[11px] text-white/40">Sem padrão relacionado para esta oportunidade.</p>}
                </div>
                <p className="text-[11px] text-white/40 mt-3">Nenhuma ação aqui cria alerta, altera radar ou aplica recomendação. São apenas atalhos de investigação.</p>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ScoreRow({ label, v }: { label: string; v: number }) {
  const tone = v > 0 ? 'text-[#7FE9DC]' : v < 0 ? 'text-amber-200/80' : 'text-white/40'
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[12px] text-white/60">{label}</span>
      <span className={`text-[12.5px] font-semibold tabular-nums ${tone}`}>{v > 0 ? `+${v}` : v}</span>
    </div>
  )
}

function LinkRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-white/[0.07] bg-white/[0.012] hover:bg-white/[0.04] hover:border-[#2DD4BF]/25 transition-colors text-left">
      <span className="text-[#5EEAD4]/70">{icon}</span>
      <span className="text-[12.5px] text-white/75 flex-1">{label}</span>
      <span className="text-[#5EEAD4]/60">→</span>
    </button>
  )
}
