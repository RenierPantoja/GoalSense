/**
 * Settings page — displays user preferences, mode, favorites summary.
 */
import { useState } from 'react'
import { Zap, Heart, Trash2, Globe2, Database, Shield, Bell } from 'lucide-react'
import { useFavorites } from '@/context/FavoritesContext'
import { useViewMode } from '@/context/ViewModeContext'
import { useAlerts } from '@/context/AlertsContext'

export function SettingsPage() {
  const { teams, leagues, matches, clearAll, hasAnyFavorite } = useFavorites()
  const { mode, toggleMode, isAdvanced } = useViewMode()
  const { totalCount: alertCount, enabledCount: alertsEnabled, clearAllAlerts } = useAlerts()
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmClearAlerts, setConfirmClearAlerts] = useState(false)

  return (
    <div className="max-w-[600px] mx-auto space-y-6">
      <h1 className="text-[20px] font-bold text-white tracking-tight">Configurações</h1>

      {/* Mode */}
      <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.015] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-violet-500/10 border border-violet-500/15">
              <Zap size={16} className="text-violet-400" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-white/70">Modo de experiência</h3>
              <p className="text-[10px] text-white/30 mt-0.5">{isAdvanced ? 'Mais detalhes técnicos e editoriais' : 'Visualização limpa e focada'}</p>
            </div>
          </div>
          <button onClick={toggleMode} className={`px-4 py-2 rounded-xl text-[11px] font-semibold transition-all ${isAdvanced ? 'bg-violet-500/15 text-violet-400 border border-violet-500/25' : 'bg-white/[0.04] text-white/40 border border-white/[0.08] hover:text-white/60'}`}>
            {isAdvanced ? 'Avançado' : 'Básico'}
          </button>
        </div>
        {isAdvanced && (
          <div className="mt-4 pt-3 border-t border-white/[0.04] space-y-1.5">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">Modo avançado ativa:</p>
            <p className="text-[10px] text-white/40 flex items-center gap-2"><span className="text-violet-400">✓</span> Score de relevância nos jogos</p>
            <p className="text-[10px] text-white/40 flex items-center gap-2"><span className="text-violet-400">✓</span> Badge de cobertura de dados</p>
            <p className="text-[10px] text-white/40 flex items-center gap-2"><span className="text-violet-400">✓</span> Sinais do GoalSense Engine</p>
            <p className="text-[10px] text-white/40 flex items-center gap-2"><span className="text-violet-400">✓</span> Explicações de pressão e momentum</p>
            <p className="text-[10px] text-white/40 flex items-center gap-2"><span className="text-violet-400">✓</span> Diagnósticos extras por partida</p>
          </div>
        )}
      </div>

      {/* Favorites summary */}
      <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.015] p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-rose-500/10 border border-rose-500/15">
            <Heart size={16} className="text-rose-400" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-white/70">Favoritos</h3>
            <p className="text-[10px] text-white/30 mt-0.5">Seus times, ligas e partidas salvas</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 text-center">
            <span className="text-[18px] font-bold text-white/60 block">{teams.length}</span>
            <span className="text-[9px] text-white/25">Times</span>
          </div>
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 text-center">
            <span className="text-[18px] font-bold text-white/60 block">{leagues.length}</span>
            <span className="text-[9px] text-white/25">Ligas</span>
          </div>
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 text-center">
            <span className="text-[18px] font-bold text-white/60 block">{matches.length}</span>
            <span className="text-[9px] text-white/25">Partidas</span>
          </div>
        </div>

        {hasAnyFavorite && (
          <div className="pt-3 border-t border-white/[0.04]">
            {!confirmClear ? (
              <button onClick={() => setConfirmClear(true)} className="flex items-center gap-2 text-[11px] text-white/25 hover:text-rose-400/70 transition-colors">
                <Trash2 size={12} />Limpar todos os favoritos
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-rose-400/70">Tem certeza?</span>
                <button onClick={() => { clearAll(); setConfirmClear(false) }} className="px-3 py-1 rounded-lg text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">Sim, limpar</button>
                <button onClick={() => setConfirmClear(false)} className="px-3 py-1 rounded-lg text-[10px] font-medium text-white/30 border border-white/[0.06]">Cancelar</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Alerts summary */}
      <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.015] p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/15">
            <Bell size={16} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-white/70">Alertas</h3>
            <p className="text-[10px] text-white/30 mt-0.5">{alertCount} {alertCount === 1 ? 'regra criada' : 'regras criadas'} · {alertsEnabled} {alertsEnabled === 1 ? 'ativa' : 'ativas'}</p>
          </div>
        </div>
        {alertCount > 0 && (
          <div className="pt-2 border-t border-white/[0.04]">
            {!confirmClearAlerts ? (
              <button onClick={() => setConfirmClearAlerts(true)} className="flex items-center gap-2 text-[11px] text-white/25 hover:text-rose-400/70 transition-colors">
                <Trash2 size={12} />Limpar todos os alertas
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-rose-400/70">Tem certeza?</span>
                <button onClick={() => { clearAllAlerts(); setConfirmClearAlerts(false) }} className="px-3 py-1 rounded-lg text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">Sim, limpar</button>
                <button onClick={() => setConfirmClearAlerts(false)} className="px-3 py-1 rounded-lg text-[10px] font-medium text-white/30 border border-white/[0.06]">Cancelar</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* System info */}
      <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.015] p-5 space-y-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/15">
            <Database size={16} className="text-cyan-400" />
          </div>
          <h3 className="text-[13px] font-semibold text-white/70">Sistema</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe2 size={12} className="text-white/20" />
              <span className="text-[11px] text-white/40">Fuso horário</span>
            </div>
            <span className="text-[11px] text-white/60 font-medium">America/Sao_Paulo</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={12} className="text-white/20" />
              <span className="text-[11px] text-white/40">Providers</span>
            </div>
            <span className="text-[11px] text-white/60 font-medium">ESPN · football-data · API-Football</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database size={12} className="text-white/20" />
              <span className="text-[11px] text-white/40">Versão</span>
            </div>
            <span className="text-[11px] text-white/60 font-medium">GoalSense v1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}
