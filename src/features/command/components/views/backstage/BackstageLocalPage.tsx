/**
 * BackstageLocalPage (Match Intelligence Fabric).
 * ─────────────────────────────────────────────────────────────────────────────
 * Backstage tab shell: provider capability summary + the match intelligence panel.
 * Observational, operator-facing. No prediction promises, no odds, no stake.
 */
import { useEffect, useState } from 'react'
import { Database } from 'lucide-react'
import { matchIntelligenceApi } from '@/services/matchIntelligenceApi'
import type { ProviderCapabilitiesDto } from '@/features/matchIntelligence/matchIntelligenceTypes'
import { BackstageMatchIntelligencePanel } from './BackstageMatchIntelligencePanel'
import { EspnLiveFirstWorkerPanel } from './EspnLiveFirstWorkerPanel'
import { LiveFirstSignalQualityPanel } from './LiveFirstSignalQualityPanel'
import { SignalQualityCampaignPanel } from './SignalQualityCampaignPanel'

export function BackstageLocalPage() {
  const [caps, setCaps] = useState<ProviderCapabilitiesDto | null>(null)

  useEffect(() => {
    let active = true
    void matchIntelligenceApi.getProviderCapabilities().then(r => { if (active && r.ok && r.data) setCaps(r.data.capabilities) })
    return () => { active = false }
  }, [])

  const counts = caps ? Object.values(caps.domains).reduce((acc, d) => {
    if (d.coverage === 'full' || d.coverage === 'partial' || d.coverage === 'limited') acc.usable++
    else if (d.coverage === 'not_used') acc.notUsed++
    else acc.unavailable++
    return acc
  }, { usable: 0, unavailable: 0, notUsed: 0 }) : null

  return (
    <div className="space-y-4">
      {caps && counts && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.012] p-4">
          <div className="flex items-center gap-2 mb-2"><Database size={14} className="text-white/35" /><h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 flex-1">Capacidade do provider ({caps.provider})</h4></div>
          <div className="flex items-center gap-3 flex-wrap text-[11.5px] text-white/60">
            <span className="text-emerald-200/80">analisáveis {counts.usable}</span>
            <span className="text-white/45">· indisponíveis {counts.unavailable}</span>
            <span className="text-sky-200/70">· não usados (odds) {counts.notUsed}</span>
          </div>
          <p className="text-[10px] text-white/30 mt-1.5">{caps.limitations[0]}</p>
        </div>
      )}
      <EspnLiveFirstWorkerPanel isAdmin />
      <LiveFirstSignalQualityPanel />
      <SignalQualityCampaignPanel />
      <BackstageMatchIntelligencePanel />
    </div>
  )
}
