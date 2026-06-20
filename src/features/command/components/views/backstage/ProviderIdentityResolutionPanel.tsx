/**
 * ProviderIdentityResolutionPanel (B42).
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows the ESPN↔external mapping status for a fixture, candidate matches (home/away,
 * competition, kickoff delta, score, reasons, warnings), and lets the operator run
 * resolution / confirm / reject. Never hides ambiguity; confirm requires a click; never
 * calls an unconfigured provider (backend enforces).
 */
import { useCallback, useEffect, useState } from 'react'
import { Link2, RefreshCw, Check, X, AlertTriangle } from 'lucide-react'
import { providerIdentityApi } from '@/services/providerIdentityApi'
import type { FixtureIdentityCandidateDto, ProviderEntityMappingDto } from '@/features/matchIntelligence/providerIdentityTypes'
import { MAPPING_STATUS_LABEL } from '@/features/matchIntelligence/providerIdentityTypes'

function bandTone(b: string): string {
  return b === 'high' ? 'text-emerald-200/85 border-emerald-400/25' : b === 'medium' ? 'text-amber-100/80 border-amber-400/20' : b === 'low' ? 'text-white/55 border-white/[0.1]' : 'text-white/40 border-white/[0.08]'
}

export function ProviderIdentityResolutionPanel({ fixtureId, isAdmin }: { fixtureId: string | null; isAdmin: boolean }) {
  const [mapping, setMapping] = useState<ProviderEntityMappingDto | null>(null)
  const [candidates, setCandidates] = useState<FixtureIdentityCandidateDto[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    const [m, c] = await Promise.all([providerIdentityApi.getFixtureMapping(id), providerIdentityApi.getFixtureCandidates(id)])
    if (m.ok) setMapping(m.data)
    if (c.ok && c.data) setCandidates(c.data)
    setLoading(false)
  }, [])

  useEffect(() => { setMapping(null); setCandidates([]); setMsg(null); if (fixtureId) void load(fixtureId) }, [fixtureId, load])

  if (!fixtureId) return null

  const resolve = async () => {
    const r = await providerIdentityApi.runFixtureIdentityResolution(fixtureId)
    if (r.ok) { setMsg(`Resolução: ${r.data?.status ?? 'ok'}.`); await load(fixtureId) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha na resolução.')
  }
  const confirm = async () => {
    if (!mapping) return
    if (!window.confirm(`Confirmar mapping ESPN → ${mapping.secondaryProvider} (${mapping.secondaryProviderEntityId})? Isso libera fetch por fixture.`)) return
    const r = await providerIdentityApi.confirmProviderMapping(mapping.id)
    if (r.ok) { setMsg('Mapping confirmado.'); await load(fixtureId) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha ao confirmar.')
  }
  const reject = async () => {
    if (!mapping) return
    const r = await providerIdentityApi.rejectProviderMapping(mapping.id)
    if (r.ok) { setMsg('Mapping rejeitado (não será reaproveitado automaticamente).'); await load(fixtureId) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha ao rejeitar.')
  }

  const confirmed = mapping && (mapping.status === 'manually_confirmed' || mapping.status === 'auto_confirmed')

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Link2 size={14} className="text-white/35" />
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">Identidade cross-provider (B42)</h4>
        {isAdmin && <button type="button" onClick={resolve} className="h-7 px-2 rounded-lg border border-[#2DD4BF]/25 bg-[#13B8A6]/[0.08] hover:bg-[#13B8A6]/[0.15] text-[11px] text-[#7FE9DC] inline-flex items-center gap-1"><RefreshCw size={11} />Resolver identidade</button>}
      </div>
      {msg && <p className="text-[11px] text-white/65 mb-2">{msg}</p>}

      {/* Mapping status */}
      <div className="flex items-center gap-2 flex-wrap mb-2 text-[11px]">
        <span className="text-white/45">ESPN → api_football:</span>
        {mapping ? (
          <>
            <span className={`px-1.5 py-0.5 rounded-full border text-[10px] ${bandTone(mapping.confidenceBand)}`}>{MAPPING_STATUS_LABEL[mapping.status] || mapping.status}</span>
            <span className="text-white/55">score {mapping.confidenceScore} ({mapping.confidenceBand})</span>
            {confirmed && <span className="text-emerald-200/75">id {mapping.secondaryProviderEntityId}</span>}
            {mapping.status === 'ambiguous' && <span className="text-amber-100/80 inline-flex items-center gap-1"><AlertTriangle size={11} />ambíguo — revisar</span>}
            {isAdmin && !confirmed && (
              <span className="flex items-center gap-1">
                <button type="button" onClick={confirm} className="h-6 px-2 rounded-lg border border-emerald-400/20 bg-emerald-500/8 hover:bg-emerald-500/15 text-[10px] text-emerald-200/85 inline-flex items-center gap-1"><Check size={10} />Confirmar</button>
                <button type="button" onClick={reject} className="h-6 px-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[10px] text-white/55 inline-flex items-center gap-1"><X size={10} />Rejeitar</button>
              </span>
            )}
          </>
        ) : <span className="text-white/40">{loading ? 'carregando…' : 'sem mapping — rode a resolução'}</span>}
      </div>

      {/* Candidates */}
      {candidates.length > 0 && (
        <div className="space-y-1 max-h-44 overflow-y-auto sidebar-scroll">
          <p className="text-[10px] uppercase tracking-wide text-white/30">Candidatos ({candidates.length})</p>
          {candidates.slice(0, 8).map((c, i) => (
            <div key={i} className="rounded-lg border border-white/[0.05] bg-white/[0.01] px-2.5 py-1.5">
              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                <span className={`px-1.5 py-0.5 rounded-full border text-[9.5px] ${bandTone(c.confidenceBand)}`}>{c.confidenceBand} {c.score}</span>
                <span className="text-white/75 truncate flex-1">{c.secondaryLabel}</span>
                {c.kickoffDeltaMinutes != null && <span className="text-white/40">Δ {c.kickoffDeltaMinutes}min</span>}
                {c.swappedHomeAway && <span className="text-amber-100/75">invertido</span>}
              </div>
              {(c.warnings.length > 0) && <p className="text-[9.5px] text-amber-100/60 mt-0.5">{c.warnings.join('; ')}</p>}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-white/30 mt-2">Nome sozinho não confirma; ambíguo exige operador; rejeitado não é reaproveitado. Mapping confirmado libera escalação/stats/detalhes por fixture (endpoints documentados).</p>
    </div>
  )
}
