/**
 * AlertSignalDrawer — wide premium drawer: the Signal Ledger detail of one alert.
 * Tabs: Resumo · Evidências · Resultado · Linha do tempo · Aprendizado.
 * Read-only: fetches ledger/outcome/learning; never creates alerts/Telegram.
 */
import { useEffect, useState } from 'react'
import { X, FileText, Layers, Flag, Clock, GraduationCap, PlayCircle, FlaskConical, Info } from 'lucide-react'
import { alertIntelligenceApi } from '@/services/alertIntelligenceApi'
import { evidenceLineageApi } from '@/services/evidenceLineageApi'
import { ReplayViewer } from '../../backtest/ReplayViewer'
import { RelatedAlertsPanel } from './RelatedAlertsPanel'
import type {
  SignalLedgerEntry, AlertOutcomeRecord, PatternLearningProfile, LearningEvent, AlertResult, SignalFailureAnalysis, AlertIntelFilters,
} from '../../../../intelligence/alertIntelligenceTypes'
import { RESULT_LABEL, RESULT_TONE, SAMPLE_QUALITY_LABEL, pct } from '../../../../intelligence/alertIntelligenceTypes'
import type { EvidenceLineageBundleDto } from '../../../../intelligence/evidenceLineageTypes'
import { LINK_STRENGTH_LABEL, SOURCE_LABEL } from '../../../../intelligence/evidenceLineageTypes'

interface Props {
  alertId: string | null
  headline: { patternName: string; matchLabel: string; minute: number | null; score: { home: number; away: number }; confidence: number; status: string }
  onClose: () => void
  onGoToBacktest?: () => void
  onOpenFilteredList?: (filters: AlertIntelFilters) => void
}

type DrawerTab = 'resumo' | 'evidencias' | 'resultado' | 'timeline' | 'aprendizado'

const TABS: { id: DrawerTab; label: string; icon: typeof FileText }[] = [
  { id: 'resumo', label: 'Resumo', icon: FileText },
  { id: 'evidencias', label: 'Evidências', icon: Layers },
  { id: 'resultado', label: 'Resultado', icon: Flag },
  { id: 'timeline', label: 'Linha do tempo', icon: Clock },
  { id: 'aprendizado', label: 'Aprendizado', icon: GraduationCap },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2.5">{title}</h4>
      {children}
    </div>
  )
}
function Chips({ items, tone = 'neutral' }: { items: string[]; tone?: 'ok' | 'miss' | 'block' | 'neutral' }) {
  const cls = tone === 'ok' ? 'bg-emerald-500/8 border-emerald-400/15 text-emerald-200/80'
    : tone === 'miss' ? 'bg-white/[0.04] border-white/[0.08] text-white/55'
    : tone === 'block' ? 'bg-amber-500/8 border-amber-400/15 text-amber-100/70'
    : 'bg-white/[0.04] border-white/[0.07] text-white/65'
  if (items.length === 0) return <span className="text-[11px] text-white/30">—</span>
  return <div className="flex flex-wrap gap-1.5">{items.map((c, i) => <span key={i} className={`text-[10.5px] px-1.5 py-0.5 rounded border ${cls}`}>{c}</span>)}</div>
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-1"><span className="text-[11px] text-white/45">{k}</span><span className="text-[12px] text-white/85 text-right">{v}</span></div>
}

export function AlertSignalDrawer({ alertId, headline, onClose, onGoToBacktest, onOpenFilteredList }: Props) {
  const [tab, setTab] = useState<DrawerTab>('resumo')
  const [loading, setLoading] = useState(true)
  const [ledger, setLedger] = useState<SignalLedgerEntry | null>(null)
  const [outcome, setOutcome] = useState<AlertOutcomeRecord | null>(null)
  const [profile, setProfile] = useState<PatternLearningProfile | null>(null)
  const [events, setEvents] = useState<LearningEvent[]>([])
  const [failure, setFailure] = useState<SignalFailureAnalysis | null>(null)
  const [lineage, setLineage] = useState<EvidenceLineageBundleDto | null>(null)
  const [showReplay, setShowReplay] = useState(false)

  useEffect(() => {
    let alive = true
    if (!alertId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      alertIntelligenceApi.getAlertIntelligenceBundle(alertId),
      alertIntelligenceApi.getFailureAnalysis(alertId),
    ]).then(([b, fa]) => {
      if (!alive) return
      setLedger(b.ledger); setOutcome(b.outcome); setProfile(b.profile); setEvents(b.learningEvents)
      setFailure(fa); setLoading(false)
    })
    // B33: evidence lineage is fetched separately (non-blocking, honest empty).
    evidenceLineageApi.getAlertLineage(alertId).then(r => { if (alive && r.ok) setLineage(r.data) })
    return () => { alive = false }
  }, [alertId])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !showReplay) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, showReplay])

  const result = (outcome?.result || (headline.status as AlertResult) || 'pending') as AlertResult
  const tone = RESULT_TONE[result] || RESULT_TONE.pending
  const noLedger = !loading && !ledger
  const isPromoted = !!(ledger?.radarName?.startsWith('Motor Automático')) || !!(headline.patternName?.startsWith('Motor Automático'))
  const fromPromotedResolution = !!outcome?.resolutionType?.startsWith('promoted')

  return (
    <div className="fixed inset-0 z-[130] flex justify-end" role="dialog" aria-label="Análise do sinal">
      <div className="absolute inset-0 bg-[#05080d]/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[680px] h-full bg-[#0b0f16] border-l border-white/[0.1] shadow-2xl flex flex-col animate-fadeIn">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold text-white/95 truncate">{headline.matchLabel}</h3>
              <p className="text-[12px] text-white/50 truncate mt-0.5">{headline.patternName}</p>
            </div>
            <span className={`shrink-0 inline-flex items-center gap-1.5 text-[10.5px] font-medium px-2.5 py-1 rounded-md border ${tone.bg} ${tone.border} ${tone.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />{RESULT_LABEL[result]}
            </span>
            <button onClick={onClose} type="button" aria-label="Fechar" className="shrink-0 h-8 w-8 rounded-full grid place-items-center text-white/50 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white/90 transition-colors"><X size={15} /></button>
          </div>
          {/* Tabs */}
          <div className="flex items-center gap-1 mt-3 -mb-px">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} type="button" className={`flex items-center gap-1.5 px-3 py-2 text-[11.5px] font-medium border-b-2 transition-colors ${tab === t.id ? 'border-[#2DD4BF] text-white/90' : 'border-transparent text-white/45 hover:text-white/70'}`}>
                <t.icon size={13} />{t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto sidebar-scroll px-6 py-5 min-h-0 space-y-3">
          {loading && <div className="py-16 text-center text-[13px] text-white/40">Carregando análise…</div>}

          {noLedger && (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-6 text-center">
              <Info size={18} className="text-white/35 mx-auto mb-2" />
              <p className="text-[13px] text-white/75 font-medium">Sem registro de Signal Ledger</p>
              <p className="text-[11.5px] text-white/50 mt-1.5 max-w-[380px] mx-auto leading-relaxed">
                {alertId ? 'Este alerta foi criado antes da memória de inteligência (B12), ou o backend ainda não registrou seu ledger.' : 'Este alerta não tem id de backend — sem ledger associado.'}
              </p>
            </div>
          )}

          {!loading && ledger && (
            <>
              {tab === 'resumo' && (
                <>
                  {ledger.validationSessionId && (
                    <div className="rounded-xl border border-[#2DD4BF]/15 bg-[#13B8A6]/[0.05] px-3.5 py-2 mb-1">
                      <span className="text-[10px] text-[#7FE9DC]/85">Sessão de validação: <span className="font-mono">{ledger.validationSessionId.slice(0, 12)}…</span> · atribuição exata (B38)</span>
                    </div>
                  )}
                  {isPromoted && (
                    <div className="rounded-xl border border-[#2DD4BF]/20 bg-[#13B8A6]/[0.06] p-4">
                      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#7FE9DC]/85">Origem: Motor Automático</span>
                      <p className="text-[12px] text-white/70 mt-1.5 leading-relaxed">Este alerta foi promovido manualmente de uma oportunidade automática (confirmação humana). O score original é qualidade de sinal, não probabilidade.</p>
                      {ledger.scopeDecision?.reason && <p className="text-[11px] text-white/50 mt-1.5">{ledger.scopeDecision.reason}</p>}
                      <p className="text-[10.5px] text-white/40 mt-1.5">O resultado abaixo avalia o alerta monitorado — não altera o score original da oportunidade. Sem Telegram, sem odds.</p>
                    </div>
                  )}
                  <Section title="Partida">
                    <KV k="Confronto" v={ledger.fixtureLabel} />
                    <KV k="Competição" v={ledger.leagueName} />
                    <KV k="Minuto do alerta" v={ledger.minute == null ? '—' : `${ledger.minute}'`} />
                    <KV k="Placar no alerta" v={`${ledger.scoreState.home}–${ledger.scoreState.away}`} />
                  </Section>
                  <Section title="Radar">
                    <KV k="Nome" v={ledger.radarName} />
                    <KV k="Severidade" v={ledger.severity} />
                    <KV k="Confiança no disparo" v={ledger.confidenceAtSignal ?? '—'} />
                    <KV k="Tipo de sinal" v={ledger.signalType} />
                  </Section>
                  {ledger.matchContext && (
                    <Section title="Contexto da partida (heurístico)">
                      <KV k="Tipo" v={ledger.matchContext.competitionType} />
                      <KV k="Fase" v={ledger.matchContext.stage} />
                      <KV k="Importância" v={`${ledger.matchContext.importanceLabel} (${ledger.matchContext.importance})`} />
                    </Section>
                  )}
                  <Section title="Por que alertou">
                    <Chips items={ledger.evidence?.passedConditions || []} tone="ok" />
                    {ledger.scopeDecision?.reason && <p className="text-[11px] text-white/50 mt-2">Escopo: {ledger.scopeDecision.reason}</p>}
                    <p className="text-[11px] text-white/40 mt-1">Qualidade dos dados: {ledger.evidence?.providerQuality || 'unknown'}</p>
                  </Section>
                </>
              )}

              {tab === 'evidencias' && ledger.evidence && (
                <>
                  <Section title="Condições que bateram"><Chips items={ledger.evidence.passedConditions} tone="ok" /></Section>
                  <Section title="Condições que faltaram"><Chips items={ledger.evidence.failedConditions} tone="miss" /></Section>
                  <div className="grid grid-cols-2 gap-3">
                    <Section title="Sinais"><Chips items={ledger.evidence.signalConditions} /></Section>
                    <Section title="Elegibilidade"><Chips items={ledger.evidence.eligibilityConditions} /></Section>
                  </div>
                  {ledger.evidence.blockers.length > 0 && <Section title="Bloqueios"><Chips items={ledger.evidence.blockers} tone="block" /></Section>}
                  <Section title="Estatísticas usadas">
                    {ledger.evidence.liveStatsUsed && Object.keys(ledger.evidence.liveStatsUsed).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(ledger.evidence.liveStatsUsed).map(([k, v]) => <span key={k} className="text-[10.5px] px-2 py-0.5 rounded border bg-white/[0.04] border-white/[0.07] text-white/70 tabular-nums">{k}: {v}</span>)}
                      </div>
                    ) : <span className="text-[11px] text-white/30">Sem estatísticas registradas no disparo</span>}
                  </Section>
                  {ledger.evidence.missingData.length > 0 && (
                    <Section title="Dados ausentes"><Chips items={ledger.evidence.missingData} tone="miss" /></Section>
                  )}
                  <EvidenceLineageSection lineage={lineage} />
                </>
              )}

              {tab === 'resultado' && (
                outcome ? (
                  <>
                    <div className={`rounded-xl border ${tone.border} ${tone.bg} px-4 py-3.5`}>
                      <span className={`inline-flex items-center gap-2 text-[13px] font-semibold ${tone.text}`}><span className={`h-2 w-2 rounded-full ${tone.dot}`} />{RESULT_LABEL[result]}</span>
                      <p className="text-[12px] text-white/65 mt-2 leading-relaxed">{outcome.outcomeReason}</p>
                    </div>
                    <Section title="Detalhes">
                      <KV k="Tipo de resolução" v={outcome.resolutionType || '—'} />
                      <KV k="Tempo até resolução" v={outcome.timeToResolutionMinutes != null ? `${outcome.timeToResolutionMinutes} min` : '—'} />
                      <KV k="Qualidade na resolução" v={outcome.dataQualityAtResolution} />
                      <KV k="Resolvido em" v={outcome.resolvedAt ? new Date(outcome.resolvedAt).toLocaleString('pt-BR') : '—'} />
                      {fromPromotedResolution && <KV k="Fonte da resolução" v="Motor Automático (promoted_alert_resolution)" />}
                    </Section>
                    {fromPromotedResolution && (result === 'unknown' || result === 'expired') && (
                      <p className="text-[11px] text-amber-100/65 leading-relaxed px-1">Resolução limitada: faltaram dados pós-promoção para confirmar. Unknown nunca é falha.</p>
                    )}
                    {outcome.whatConfirmed.length > 0 && <Section title="O que confirmou"><Chips items={outcome.whatConfirmed} tone="ok" /></Section>}
                    {outcome.whatFailed.length > 0 && <Section title="O que não confirmou"><Chips items={outcome.whatFailed} tone="miss" /></Section>}
                    {outcome.missingForConfirmation.length > 0 && <Section title="O que faltou"><Chips items={outcome.missingForConfirmation} tone="block" /></Section>}
                    {(result === 'unknown' || result === 'expired') && (
                      <p className="text-[11px] text-white/45 leading-relaxed px-1">Sem dados suficientes para classificar como falha — isto não conta como erro do radar.</p>
                    )}
                    {result === 'failed' && (
                      failure ? (
                        <Section title="Análise da falha">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[11px] font-semibold text-rose-200/85">{failure.failureReason.replace(/_/g, ' ')}</span>
                            <span className="text-[9.5px] uppercase tracking-wider text-white/40">diagnóstico {failure.confidenceInDiagnosis}</span>
                          </div>
                          {failure.contributingFactors.length > 0 && <Chips items={failure.contributingFactors} tone="block" />}
                          {failure.suggestedReview && <p className="text-[11.5px] text-white/60 mt-2 leading-relaxed">{failure.suggestedReview}</p>}
                          <p className="text-[10px] text-white/30 mt-2">Linguagem de possibilidade — não é causa confirmada.</p>
                        </Section>
                      ) : (
                        <p className="text-[11px] text-amber-100/65 leading-relaxed px-1">Análise da falha ainda não registrada para este alerta.</p>
                      )
                    )}
                  </>
                ) : (
                  <div className="rounded-xl border border-amber-400/15 bg-amber-500/[0.05] px-4 py-6 text-center">
                    <p className="text-[13px] text-amber-100/85 font-medium">Resultado ainda não resolvido</p>
                    <p className="text-[11.5px] text-white/50 mt-1.5">O motor de resolução ainda não fechou este sinal (aguardando snapshots pós-disparo).</p>
                  </div>
                )
              )}

              {tab === 'timeline' && (
                <>
                  <div className="relative pl-5">
                    <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/[0.08]" />
                    <TimelineStep dot="bg-[#2DD4BF]" title="Alerta emitido" when={ledger.createdAt} detail={`aos ${ledger.minute ?? '?'}' · ${ledger.scoreState.home}–${ledger.scoreState.away} · conf ${ledger.confidenceAtSignal ?? '—'}`} />
                    {outcome && <TimelineStep dot={tone.dot} title={`Resolução: ${RESULT_LABEL[result]}`} when={outcome.resolvedAt || outcome.updatedAt} detail={outcome.outcomeReason} />}
                    {events.slice(0, 4).map(e => <TimelineStep key={e.id} dot="bg-white/30" title={`Aprendizado: ${e.type}`} when={e.createdAt} detail={e.message} />)}
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-[11.5px] text-white/55 leading-relaxed flex-1 min-w-[200px]">Replay minuto a minuto depende dos snapshots gravados e da API de backtest habilitada.</p>
                    <button onClick={() => setShowReplay(true)} disabled={!ledger.patternId} type="button" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5EEAD4] hover:text-[#7FE9DC] disabled:opacity-30 transition-colors"><PlayCircle size={14} />Ver replay</button>
                  </div>
                </>
              )}

              {tab === 'aprendizado' && (
                <>
                  {profile ? (
                    <>
                      <Section title="Qualidade do padrão">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px] text-white/80 font-medium">{profile.radarName}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/55">{SAMPLE_QUALITY_LABEL[profile.sampleQuality]}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <Mini k="Útil" v={pct(profile.usefulRate)} tone="text-emerald-200/85" />
                          <Mini k="Falha" v={pct(profile.failedRate)} tone="text-rose-200/80" />
                          <Mini k="Sem dados" v={pct(profile.unknownRate)} tone="text-amber-100/75" />
                        </div>
                        <p className="text-[10px] text-white/35 mt-2 tabular-nums">{profile.resolvedCount} resolvidos de {profile.sampleSize} · conf média {profile.avgConfidenceAtSignal ?? '—'}</p>
                      </Section>
                      {(profile.sampleQuality === 'insufficient' || profile.sampleQuality === 'low') && (
                        <p className="text-[11px] text-amber-100/70 leading-relaxed px-1">Amostra insuficiente para conclusão forte — trate como indício inicial.</p>
                      )}
                      {profile.bestMinuteWindows.length > 0 && (
                        <Section title="Janelas mais fortes (indício)">
                          {profile.bestMinuteWindows.map(s => <div key={s.contextKey} className="flex items-center justify-between py-0.5"><span className="text-[11.5px] text-white/70">{s.label}</span><span className="text-[11px] text-emerald-200/80 tabular-nums">{pct(s.usefulRate)} · n={s.sampleSize}</span></div>)}
                        </Section>
                      )}
                      {profile.topFailureReasons.length > 0 && (
                        <Section title="Motivos de falha frequentes">
                          {profile.topFailureReasons.map((r, i) => <div key={i} className="flex items-center justify-between py-0.5"><span className="text-[11.5px] text-white/65">{r.reason}</span><span className="text-[11px] text-white/40 tabular-nums">{r.count}</span></div>)}
                        </Section>
                      )}
                    </>
                  ) : (
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-6 text-center">
                      <p className="text-[13px] text-white/75 font-medium">Ainda não há aprendizado suficiente</p>
                      <p className="text-[11.5px] text-white/50 mt-1.5">Rode a agregação de aprendizado (B13) ou aguarde mais sinais resolvidos para este padrão.</p>
                    </div>
                  )}
                  {events.length > 0 && (
                    <Section title="Eventos de aprendizado">
                      {events.slice(0, 6).map(e => <p key={e.id} className="text-[11px] text-white/60 leading-relaxed py-1 border-b border-white/[0.04] last:border-0">{e.message}</p>)}
                    </Section>
                  )}
                  {alertId && <RelatedAlertsPanel source={{ kind: 'alert', alertId }} onOpenInList={onOpenFilteredList && ledger.patternId ? () => onOpenFilteredList({ patternId: ledger.patternId! }) : undefined} />}
                  {onGoToBacktest && ledger.patternId && (
                    <button onClick={onGoToBacktest} type="button" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5EEAD4] hover:text-[#7FE9DC] transition-colors"><FlaskConical size={14} />Rodar backtest deste radar</button>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-white/[0.07] shrink-0">
          <span className="text-[10.5px] text-white/35">Análise somente leitura — não cria alertas, não altera o radar, não envia Telegram.</span>
        </div>
      </div>

      {showReplay && ledger?.patternId && (
        <ReplayViewer patternId={ledger.patternId} fixtureId={ledger.fixtureId} onClose={() => setShowReplay(false)} />
      )}
    </div>
  )
}

function TimelineStep({ dot, title, when, detail }: { dot: string; title: string; when: string; detail: string }) {
  return (
    <div className="relative mb-3">
      <span className={`absolute -left-[14px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b0f16] ${dot}`} />
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.012] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-white/85">{title}</span>
          <span className="text-[10px] text-white/35">{when ? new Date(when).toLocaleString('pt-BR') : '—'}</span>
        </div>
        {detail && <p className="text-[11px] text-white/55 mt-0.5 leading-snug">{detail}</p>}
      </div>
    </div>
  )
}
function Mini({ k, v, tone }: { k: string; v: string; tone: string }) {
  return <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-2.5 py-2 text-center"><span className={`text-[15px] font-bold tabular-nums block ${tone}`}>{v}</span><span className="text-[9px] uppercase tracking-wider text-white/40 mt-0.5 block">{k}</span></div>
}

function EvidenceLineageSection({ lineage }: { lineage: EvidenceLineageBundleDto | null }) {
  if (!lineage || (lineage.exactLinks.length === 0 && lineage.inferredLinks.length === 0 && lineage.unknownLinks.length === 0)) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Evidência & Linhagem</h4>
        <p className="text-[11.5px] text-white/50 leading-relaxed">Este alerta foi criado antes do índice de evidências ou não possui snapshot vinculado.</p>
      </div>
    )
  }
  const rows = [...lineage.exactLinks, ...lineage.inferredLinks].slice(0, 12)
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Evidência & Linhagem</h4>
        <span className="text-[10px] text-white/40">{lineage.exactLinks.length} exato(s) · {lineage.inferredLinks.length} inferido(s)</span>
      </div>
      <div className="space-y-1">
        {rows.map(r => (
          <div key={r.id} className="flex items-center gap-2 text-[11px] border-b border-white/[0.04] pb-1 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded-full border text-[9.5px] ${r.linkStrength === 'exact' ? 'border-[#2DD4BF]/25 text-[#7FE9DC]' : 'border-sky-400/20 text-sky-200/80'}`}>{LINK_STRENGTH_LABEL[r.linkStrength]}</span>
            <span className="text-white/60">{SOURCE_LABEL[r.source]}</span>
            <span className="text-white/40 truncate">{r.evidenceKind}</span>
            <span className="ml-auto text-white/45 tabular-nums">{r.snapshotId ? `snap ${r.snapshotId.slice(0, 6)}…` : (r.minute != null ? `${r.minute}'` : '—')}</span>
          </div>
        ))}
      </div>
      {lineage.exactLinks.length === 0 && (
        <p className="text-[10.5px] text-amber-100/70 mt-2">Superproteção conservadora — vínculos inferidos (sem snapshotId exato).</p>
      )}
      {lineage.limitations.length > 0 && <p className="text-[10px] text-white/35 mt-1.5">{lineage.limitations[lineage.limitations.length - 1]}</p>}
      <p className="text-[10px] text-white/30 mt-1">Vínculo inferido nunca finge ser exato. Unknown não autoriza exclusão.</p>
    </div>
  )
}
