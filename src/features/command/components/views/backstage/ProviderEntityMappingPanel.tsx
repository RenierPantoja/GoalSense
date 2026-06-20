/**
 * ProviderEntityMappingPanel (B43).
 * ─────────────────────────────────────────────────────────────────────────────
 * Team/competition mappings (confirm/reject + derive) and per-fixture domain unlock
 * status. Shows exactly why a domain doesn't fetch (missing/ambiguous mapping,
 * provider not configured, endpoint not implemented). Never hides ambiguity.
 */
import { useCallback, useEffect, useState } from 'react'
import { Network, RefreshCw, Check, X, Unlock, Lock } from 'lucide-react'
import { providerEntityMappingApi } from '@/services/providerEntityMappingApi'
import type { ProviderTeamMappingDto, ProviderCompetitionMappingDto, AcquisitionReportV3Dto } from '@/features/matchIntelligence/providerEntityMappingTypes'
import { ENTITY_STATUS_LABEL, UNLOCK_STATUS_LABEL } from '@/features/matchIntelligence/providerEntityMappingTypes'

function statusTone(s: string): string {
  return s === 'manually_confirmed' || s === 'auto_confirmed' || s === 'unlocked' ? 'text-emerald-200/85 border-emerald-400/25'
    : s === 'ambiguous' || s.startsWith('blocked_ambiguous') ? 'text-amber-100/80 border-amber-400/20'
      : s === 'rejected' ? 'text-rose-200/75 border-rose-400/20' : 'text-white/50 border-white/[0.1]'
}

export function ProviderEntityMappingPanel({ fixtureId, isAdmin }: { fixtureId: string | null; isAdmin: boolean }) {
  const [teams, setTeams] = useState<ProviderTeamMappingDto[]>([])
  const [comps, setComps] = useState<ProviderCompetitionMappingDto[]>([])
  const [unlock, setUnlock] = useState<AcquisitionReportV3Dto | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async (id: string | null) => {
    const [t, c] = await Promise.all([providerEntityMappingApi.listTeamMappings(), providerEntityMappingApi.listCompetitionMappings()])
    if (t.ok && t.data) setTeams(t.data)
    if (c.ok && c.data) setComps(c.data)
    if (id) { const u = await providerEntityMappingApi.getDomainUnlockStatus(id); if (u.ok) setUnlock(u.data) }
    else setUnlock(null)
  }, [])

  useEffect(() => { void load(fixtureId) }, [fixtureId, load])

  const derive = async () => {
    const r = await providerEntityMappingApi.deriveEntityMappings()
    if (r.ok) { setMsg(`Derivação: ${r.data?.status ?? 'ok'} (times auto ${r.data?.teamAutoConfirmed ?? 0}, ambíguos ${r.data?.teamAmbiguous ?? 0}).`); await load(fixtureId) }
    else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha na derivação.')
  }
  const act = async (fn: () => Promise<{ ok: boolean; reason: any; error: string | null }>, okMsg: string) => {
    const r = await fn()
    if (r.ok) { setMsg(okMsg); await load(fixtureId) } else setMsg(r.reason === 'forbidden' ? 'Sem permissão.' : r.error || 'Falha.')
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Network size={14} className="text-white/35" />
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">Mapeamento de entidades & desbloqueio (B43)</h4>
        {isAdmin && <button type="button" onClick={derive} className="h-7 px-2 rounded-lg border border-[#2DD4BF]/25 bg-[#13B8A6]/[0.08] hover:bg-[#13B8A6]/[0.15] text-[11px] text-[#7FE9DC] inline-flex items-center gap-1"><RefreshCw size={11} />Derivar mappings</button>}
      </div>
      {msg && <p className="text-[11px] text-white/65 mb-2">{msg}</p>}

      {/* Domain unlock for the selected fixture */}
      {fixtureId && unlock && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Domínios (desbloqueio)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {unlock.domainUnlockStatuses.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-[10.5px] border-b border-white/[0.04] pb-0.5">
                {d.currentStatus === 'unlocked' ? <Unlock size={11} className="text-emerald-300/70" /> : <Lock size={11} className="text-white/30" />}
                <span className="text-white/70 w-32 truncate">{d.domain}</span>
                <span className={`px-1.5 py-0.5 rounded-full border text-[9px] ${statusTone(d.currentStatus)}`}>{UNLOCK_STATUS_LABEL[d.currentStatus] || d.currentStatus}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team mappings */}
      <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Times mapeados ({teams.length})</p>
      {teams.length === 0 ? <p className="text-[11px] text-white/40 mb-2">Nenhum. Confirme fixtures e rode "Derivar mappings".</p> : (
        <div className="space-y-1 max-h-40 overflow-y-auto sidebar-scroll mb-2">
          {teams.slice(0, 30).map(m => (
            <div key={m.id} className="flex items-center gap-2 text-[11px] border-b border-white/[0.04] pb-1">
              <span className="text-white/75 flex-1 truncate">{m.canonicalTeamName} → {m.secondaryProviderTeamId ?? '—'}</span>
              <span className={`px-1.5 py-0.5 rounded-full border text-[9px] ${statusTone(m.status)}`}>{ENTITY_STATUS_LABEL[m.status] || m.status}</span>
              <span className="text-white/30">{m.matchedFixtures.length}fx</span>
              {isAdmin && m.status !== 'manually_confirmed' && m.status !== 'rejected' && (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => act(() => providerEntityMappingApi.confirmTeamMapping(m.id), 'Time confirmado.')} className="text-emerald-300/70 hover:text-emerald-200"><Check size={12} /></button>
                  <button type="button" onClick={() => act(() => providerEntityMappingApi.rejectTeamMapping(m.id), 'Time rejeitado.')} className="text-white/30 hover:text-rose-300/80"><X size={12} /></button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Competition mappings */}
      <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Competições mapeadas ({comps.length})</p>
      {comps.length === 0 ? <p className="text-[11px] text-white/40">Nenhuma.</p> : (
        <div className="space-y-1 max-h-32 overflow-y-auto sidebar-scroll">
          {comps.slice(0, 20).map(m => (
            <div key={m.id} className="flex items-center gap-2 text-[11px] border-b border-white/[0.04] pb-1">
              <span className="text-white/75 flex-1 truncate">{m.canonicalCompetitionName} → {m.secondaryProviderCompetitionId ?? '—'}{m.season ? ` (${m.season})` : ''}</span>
              <span className={`px-1.5 py-0.5 rounded-full border text-[9px] ${statusTone(m.status)}`}>{ENTITY_STATUS_LABEL[m.status] || m.status}</span>
              {isAdmin && m.status !== 'manually_confirmed' && m.status !== 'rejected' && (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => act(() => providerEntityMappingApi.confirmCompetitionMapping(m.id), 'Competição confirmada.')} className="text-emerald-300/70 hover:text-emerald-200"><Check size={12} /></button>
                  <button type="button" onClick={() => act(() => providerEntityMappingApi.rejectCompetitionMapping(m.id), 'Competição rejeitada.')} className="text-white/30 hover:text-rose-300/80"><X size={12} /></button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-white/30 mt-2">Mappings derivados de fixtures confirmadas (evidência), nunca por nome sozinho. Ambíguo exige operador. Confirmado desbloqueia standings/injuries por fixture (endpoints documentados).</p>
    </div>
  )
}
