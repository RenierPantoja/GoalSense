/**
 * CriticalDomainAcquisitionPanel (B44).
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-fixture critical-domain table: provider, status, resolved/missing ids, next
 * action, with refresh per-domain and run-critical-acquisition. Never hides a blocker;
 * never shows "no injuries" when there is no data; never fakes manual as provider.
 */
import { useCallback, useEffect, useState } from 'react'
import { Layers, RefreshCw, Download, Unlock, Lock } from 'lucide-react'
import { criticalDomainApi } from '@/services/criticalDomainApi'
import type { DomainUnlockMatrixEntryDto, ReadinessV5Dto } from '@/features/matchIntelligence/criticalDomainTypes'
import { DOMAIN_STATUS_LABEL, NEXT_ACTION_LABEL } from '@/features/matchIntelligence/criticalDomainTypes'

function tone(s: string): string {
  return s === 'unlocked' || s === 'safe_to_call' ? 'text-emerald-200/85 border-emerald-400/25'
    : s.startsWith('blocked_ambiguous') ? 'text-amber-100/80 border-amber-400/20'
      : 'text-white/50 border-white/[0.1]'
}

export function CriticalDomainAcquisitionPanel({ fixtureId, isAdmin }: { fixtureId: string | null; isAdmin: boolean }) {
  const [matrix, setMatrix] = useState<DomainUnlockMatrixEntryDto[]>([])
  const [readiness, setReadiness] = useState<ReadinessV5Dto | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async (id: string) => {
    const [m, r] = await Promise.all([criticalDomainApi.getDomainUnlockMatrix(id), criticalDomainApi.getReadinessV5(id)])
    if (m.ok && m.data) setMatrix(m.data)
    if (r.ok) setReadiness(r.data)
  }, [])

  useEffect(() => { setMatrix([]); setReadiness(null); setMsg(null); if (fixtureId) void load(fixtureId) }, [fixtureId, load])

  if (!fixtureId) return null

  const runCritical = async () => {
    const r = await criticalDomainApi.runCriticalDomainAcquisition(fixtureId)
    if (r.ok) { setMsg(`Aquisição crítica: ${r.data?.domainsFetched.length ?? 0} buscados, ${r.data?.domainsBlocked.length ?? 0} bloqueados.`); await load(fixtureId) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha.')
  }
  const refreshDomain = async (domain: string) => {
    const r = await criticalDomainApi.refreshCriticalDomain(fixtureId, domain)
    if (r.ok) { setMsg(`Domínio ${domain} atualizado.`); await load(fixtureId) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha.')
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Layers size={14} className="text-white/35" />
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">Domínios críticos (B44)</h4>
        {isAdmin && <button type="button" onClick={runCritical} className="h-7 px-2 rounded-lg border border-[#2DD4BF]/25 bg-[#13B8A6]/[0.08] hover:bg-[#13B8A6]/[0.15] text-[11px] text-[#7FE9DC] inline-flex items-center gap-1"><Download size={11} />Rodar aquisição crítica</button>}
      </div>
      {msg && <p className="text-[11px] text-white/65 mb-2">{msg}</p>}

      {readiness && (
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-white/60 mb-2">
          <span className="text-white/85 font-medium">{readiness.status}</span>
          <span>· cobertura {readiness.criticalDomainReadiness}%</span>
          <span>· confiabilidade {readiness.domainReliabilityScore}%</span>
          {readiness.blockedCriticalDomains.length > 0 && <span className="text-amber-100/70">· bloqueados: {readiness.blockedCriticalDomains.join(', ')}</span>}
        </div>
      )}

      <div className="space-y-1 max-h-[360px] overflow-y-auto sidebar-scroll">
        {matrix.map((d, i) => {
          const st = d.endpointStatus || d.currentStatus
          const missing = d.idsMissing && d.idsMissing.length > 0 ? d.idsMissing.join(',') : null
          return (
            <div key={i} className="flex items-center gap-2 text-[11px] border-b border-white/[0.04] pb-1 flex-wrap">
              {d.currentStatus === 'unlocked' ? <Unlock size={11} className="text-emerald-300/70 shrink-0" /> : <Lock size={11} className="text-white/30 shrink-0" />}
              <span className="text-white/75 w-32 truncate">{d.domain}</span>
              <span className={`px-1.5 py-0.5 rounded-full border text-[9px] ${tone(d.currentStatus)}`}>{DOMAIN_STATUS_LABEL[st] || st}</span>
              {missing && <span className="text-white/40 text-[9.5px]">falta: {missing}</span>}
              {d.manualFallbackAvailable && <span className="text-sky-200/70 text-[9px]">manual</span>}
              <span className="text-white/35 text-[9.5px] ml-auto">{NEXT_ACTION_LABEL[d.recommendedNextAction || 'none'] || d.recommendedNextAction}</span>
              {isAdmin && d.recommendedNextAction === 'ready_to_fetch' && <button type="button" onClick={() => refreshDomain(d.domain)} className="text-white/40 hover:text-white/80 shrink-0"><RefreshCw size={11} /></button>}
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-white/30 mt-2">Bloqueado não é falha. Só busca domínios prontos (provider+env+mapping+endpoint documentado). Ausência nunca vira zero; manual nunca finge ser provider.</p>
    </div>
  )
}
