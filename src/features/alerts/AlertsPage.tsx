/**
 * Alerts page — manage monitoring rules for teams, matches, leagues.
 * Local persistence only (no push in this phase).
 */
import { useState } from 'react'
import { Bell, Plus, Trash2, Shield, Trophy, Zap } from 'lucide-react'
import { useAlerts, getEventLabel, getDefaultEvents, ALL_ALERT_EVENTS, type AlertRule, type AlertEventType } from '@/context/AlertsContext'
import { useFavorites } from '@/context/FavoritesContext'
import { useViewMode } from '@/context/ViewModeContext'
import { ClubLogo } from '@/components/ui/ClubLogo'

export function AlertsPage() {
  const { alerts, deleteAlert, toggleAlert, totalCount, enabledCount, clearAllAlerts, commandAlerts } = useAlerts()
  const { teams: favTeams, leagues: favLeagues, matches: favMatches } = useFavorites()
  const { isAdvanced } = useViewMode()
  const [showModal, setShowModal] = useState(false)
  const [editingAlert, setEditingAlert] = useState<AlertRule | null>(null)
  const [prefill, setPrefill] = useState<{ type: 'team' | 'match' | 'league'; name: string; logo?: string; targetId?: string } | null>(null)

  const teamAlerts = alerts.filter(a => a.type === 'team')
  const matchAlerts = alerts.filter(a => a.type === 'match')

  const openCreateFromFav = (type: 'team' | 'match' | 'league', name: string, logo?: string, targetId?: string) => {
    setPrefill({ type, name, logo, targetId })
    setEditingAlert(null)
    setShowModal(true)
  }

  return (
    <div className="max-w-[900px] mx-auto space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-white tracking-tight">Alertas</h1>
          <p className="text-[11px] text-white/25 mt-0.5">Monitore seus jogos, times e competições favoritos</p>
        </div>
        <button onClick={() => { setPrefill(null); setEditingAlert(null); setShowModal(true) }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/15 transition-colors">
          <Plus size={13} />Criar alerta
        </button>
      </header>

      {/* Stats */}
      <div className="flex gap-3">
        <StatPill label="Total" value={totalCount} />
        <StatPill label="Ativos" value={enabledCount} highlight />
        <StatPill label="Times" value={teamAlerts.length} />
        <StatPill label="Partidas" value={matchAlerts.length} />
      </div>

      {/* Info banner */}
      <div className="rounded-[16px] border border-white/[0.04] bg-white/[0.015] px-5 py-3 flex items-center gap-3">
        <Bell size={14} className="text-white/20 shrink-0" />
        <p className="text-[10px] text-white/30">Alertas locais configurados no navegador. Notificações em tempo real serão ativadas em fase futura.</p>
      </div>

      {/* Quick create from favorites */}
      {(favTeams.length > 0 || favMatches.length > 0 || favLeagues.length > 0) && (
        <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.015] p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/30 mb-3">Criar a partir dos favoritos</h3>
          <div className="flex flex-wrap gap-2">
            {favTeams.slice(0, 3).map(t => (
              <button key={t.id} onClick={() => openCreateFromFav('team', t.name, t.logo || undefined, t.id)} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-[11px] text-white/50 hover:text-white/70">
                <ClubLogo src={t.logo} name={t.name} size={18} />{t.name}
              </button>
            ))}
            {favLeagues.slice(0, 2).map(l => (
              <button key={l.id} onClick={() => openCreateFromFav('league', l.name, l.logo || undefined, l.id)} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-[11px] text-white/50 hover:text-white/70">
                <Trophy size={14} className="text-white/25" />{l.name}
              </button>
            ))}
            {favMatches.slice(0, 2).map(m => (
              <button key={m.canonicalMatchId} onClick={() => openCreateFromFav('match', `${m.homeTeam} x ${m.awayTeam}`, undefined, m.canonicalMatchId)} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-[11px] text-white/50 hover:text-white/70">
                <Shield size={14} className="text-white/25" />{m.homeTeam} x {m.awayTeam}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Alert list */}
      {alerts.length === 0 && (
        <div className="rounded-[24px] border border-white/[0.04] bg-white/[0.015] py-16 text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-white/[0.03] border border-white/[0.05] mb-4">
            <Bell size={20} className="text-white/20" />
          </div>
          <p className="text-[14px] text-white/40 font-medium">Nenhum alerta criado</p>
          <p className="text-[11px] text-white/20 mt-1">Crie alertas para gols, início de partida e eventos dos seus favoritos.</p>
          <button onClick={() => { setPrefill(null); setEditingAlert(null); setShowModal(true) }} className="mt-4 px-4 py-2 rounded-xl text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/15 transition-colors">
            Criar alerta
          </button>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(a => (
            <AlertCard key={a.id} alert={a} onToggle={() => toggleAlert(a.id)} onDelete={() => deleteAlert(a.id)} onEdit={() => { setEditingAlert(a); setPrefill(null); setShowModal(true) }} isAdvanced={isAdvanced} />
          ))}
        </div>
      )}

      {/* Command Center Triggered Alerts */}
      {commandAlerts.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-400/40 flex items-center gap-2"><Zap size={12} className="text-amber-400/40" />Alertas do Command Center</h3>
          <div className="space-y-2">
            {commandAlerts.slice(0, 15).map(ca => {
              const statusLabel = ca.status === 'pending' ? 'Pendente' : ca.status === 'confirmed' ? 'Confirmado' : ca.status === 'confirmed_partial' ? 'Parcial' : ca.status === 'failed' ? 'Falhou' : ca.status === 'expired' ? 'Expirado' : 'Desconhecido'
              const statusColor = ca.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15' : ca.status === 'confirmed_partial' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/15' : ca.status === 'failed' ? 'bg-rose-500/10 text-rose-400 border-rose-500/15' : ca.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/15' : 'bg-white/[0.03] text-white/30 border-white/[0.05]'
              return (
                <div key={ca.id} className="rounded-[16px] border border-white/[0.05] bg-white/[0.015] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/8 text-amber-400/60 border border-amber-500/10">Command Center</span>
                      <span className="text-[12px] font-semibold text-white/65">{ca.patternName}</span>
                    </div>
                    <span className={`text-[9px] font-semibold px-2.5 py-1 rounded-lg border ${statusColor}`}>{statusLabel}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-white/40 mb-1.5">
                    <span>{ca.homeTeam} x {ca.awayTeam}</span>
                    <span>·</span>
                    <span>{ca.competition}</span>
                    {ca.minuteAtTrigger && <><span>·</span><span>{ca.minuteAtTrigger}'</span></>}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-white/30">
                    <span>Confiança: {ca.confidence}%</span>
                    <span>Placar: {ca.scoreAtTrigger.home}-{ca.scoreAtTrigger.away}</span>
                    {ca.scoreAtResolution && <span className="text-white/45">→ {ca.scoreAtResolution.home}-{ca.scoreAtResolution.away}</span>}
                  </div>
                  {ca.resolutionReason && <p className="text-[10px] text-white/25 mt-1.5">{ca.resolutionReason}</p>}
                  {/* Audit details in advanced mode */}
                  {isAdvanced && ca.triggerSnapshot && (
                    <div className="mt-2 pt-2 border-t border-white/[0.04] space-y-1">
                      <p className="text-[9px] text-white/20 font-medium">Snapshot no disparo:</p>
                      <p className="text-[9px] text-white/15 font-mono">min:{ca.triggerSnapshot.minute} · {ca.triggerSnapshot.homeScore}-{ca.triggerSnapshot.awayScore} · cond:{ca.triggerSnapshot.conditionsMatched}/{ca.triggerSnapshot.conditionsTotal} · provider:{ca.triggerSnapshot.provider}</p>
                      {ca.triggerSnapshot.stats?.shots && <p className="text-[9px] text-white/15 font-mono">shots:{ca.triggerSnapshot.stats.shots.home + ca.triggerSnapshot.stats.shots.away} · sot:{ca.triggerSnapshot.stats.shotsOnTarget ? ca.triggerSnapshot.stats.shotsOnTarget.home + ca.triggerSnapshot.stats.shotsOnTarget.away : '?'}</p>}
                    </div>
                  )}
                  {isAdvanced && <p className="text-[9px] text-white/15 mt-1 font-mono">{ca.evidences.slice(0, 3).join(' · ')}</p>}
                  <span className="text-[9px] text-white/15 mt-1.5 block">{new Date(ca.createdAt).toLocaleString('pt-BR')}{ca.resolvedAt && ` · Resolvido: ${new Date(ca.resolvedAt).toLocaleTimeString('pt-BR')}`}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && <AlertModal onClose={() => setShowModal(false)} editing={editingAlert} prefill={prefill} />}
    </div>
  )
}

// ─── Alert Card ──────────────────────────────────────────────────────────────

function AlertCard({ alert: a, onToggle, onDelete, onEdit, isAdvanced }: { alert: AlertRule; onToggle: () => void; onDelete: () => void; onEdit: () => void; isAdvanced: boolean }) {
  const typeLabel = a.type === 'team' ? 'Time' : a.type === 'match' ? 'Partida' : 'Liga'
  const typeIcon = a.type === 'team' ? <Shield size={12} /> : a.type === 'match' ? <Zap size={12} /> : <Trophy size={12} />

  return (
    <div className={`rounded-[16px] border ${a.enabled ? 'border-white/[0.06] bg-white/[0.02]' : 'border-white/[0.03] bg-white/[0.008] opacity-60'} p-4 transition-all`}>
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className={`flex items-center justify-center h-9 w-9 rounded-xl shrink-0 ${a.enabled ? 'bg-cyan-500/10 border border-cyan-500/15 text-cyan-400' : 'bg-white/[0.03] border border-white/[0.05] text-white/25'}`}>
          {typeIcon}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-white/70 truncate">{a.name}</span>
            <span className="text-[8px] px-1.5 py-0.5 rounded-md border border-white/[0.06] bg-white/[0.02] text-white/25">{typeLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {a.events.map(ev => (
              <span key={ev} className="text-[8px] px-1.5 py-0.5 rounded border border-white/[0.04] bg-white/[0.015] text-white/30">{getEventLabel(ev)}</span>
            ))}
          </div>
          {isAdvanced && (
            <div className="flex items-center gap-2 mt-1.5 text-[8px] text-white/15">
              <span>Criado: {new Date(a.createdAt).toLocaleDateString('pt-BR')}</span>
              {a.targetId && <span>ID: {a.targetId.slice(0, 20)}...</span>}
            </div>
          )}
        </div>
        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onEdit} className="text-[9px] text-white/20 hover:text-white/50 transition-colors px-2 py-1 rounded-lg hover:bg-white/[0.03]">Editar</button>
          <button onClick={onToggle} className={`px-3 py-1.5 rounded-lg text-[9px] font-semibold transition-all ${a.enabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'bg-white/[0.03] text-white/25 border border-white/[0.05]'}`}>
            {a.enabled ? 'Ativo' : 'Inativo'}
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-white/15 hover:text-rose-400/70 hover:bg-rose-500/5 transition-colors"><Trash2 size={12} /></button>
        </div>
      </div>
    </div>
  )
}

// ─── Alert Modal ─────────────────────────────────────────────────────────────

function AlertModal({ onClose, editing, prefill }: { onClose: () => void; editing: AlertRule | null; prefill: { type: 'team' | 'match' | 'league'; name: string; logo?: string; targetId?: string } | null }) {
  const { createAlert, updateAlert } = useAlerts()
  const { teams: favTeams, leagues: favLeagues, matches: favMatches } = useFavorites()

  const [type, setType] = useState<'team' | 'match' | 'league'>(editing?.type || prefill?.type || 'team')
  const [targetName, setTargetName] = useState(editing?.targetName || prefill?.name || '')
  const [targetId, setTargetId] = useState(editing?.targetId || prefill?.targetId || '')
  const [targetLogo, setTargetLogo] = useState(editing?.targetLogo || prefill?.logo || '')
  const [events, setEvents] = useState<AlertEventType[]>(editing?.events || (prefill ? getDefaultEvents(prefill.type) : getDefaultEvents('team')))
  const [name, setName] = useState(editing?.name || (prefill ? `Alerta: ${prefill.name}` : ''))

  const toggleEvent = (ev: AlertEventType) => {
    setEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev])
  }

  const canSave = targetName.trim().length > 0 && events.length > 0

  const handleSave = () => {
    if (!canSave) return
    const alertName = name.trim() || `Alerta: ${targetName}`
    if (editing) {
      updateAlert(editing.id, { name: alertName, events })
    } else {
      createAlert({ name: alertName, enabled: true, type, targetId: targetId || undefined, targetName, targetLogo: targetLogo || undefined, events })
    }
    onClose()
  }

  const selectTarget = (t: { name: string; id?: string; logo?: string }) => {
    setTargetName(t.name)
    setTargetId(t.id || '')
    setTargetLogo(t.logo || '')
    if (!name || name.startsWith('Alerta:')) setName(`Alerta: ${t.name}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-[480px] mx-4 rounded-[24px] border border-white/[0.08] bg-[#0d111a] p-6 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.8)] animate-scaleIn">
        <h2 className="text-[16px] font-bold text-white/80 mb-5">{editing ? 'Editar alerta' : 'Criar alerta'}</h2>

        {/* Type selector */}
        {!editing && (
          <div className="flex gap-2 mb-4">
            {(['team', 'match', 'league'] as const).map(t => (
              <button key={t} onClick={() => { setType(t); setEvents(getDefaultEvents(t)) }} className={`px-3 py-1.5 rounded-xl text-[10px] font-medium transition-all ${type === t ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-white/30 border border-white/[0.06] hover:text-white/50'}`}>
                {t === 'team' ? 'Time' : t === 'match' ? 'Partida' : 'Liga'}
              </button>
            ))}
          </div>
        )}

        {/* Target */}
        {!editing && (
          <div className="mb-4">
            <label className="text-[10px] text-white/30 font-semibold uppercase tracking-wider block mb-2">Alvo</label>
            {/* Quick picks from favorites */}
            {type === 'team' && favTeams.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {favTeams.slice(0, 6).map(t => (
                  <button key={t.id} onClick={() => selectTarget({ name: t.name, id: t.id, logo: t.logo || undefined })} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] transition-all ${targetName === t.name ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-white/40 border border-white/[0.05] hover:bg-white/[0.03]'}`}>
                    <ClubLogo src={t.logo} name={t.name} size={14} />{t.name}
                  </button>
                ))}
              </div>
            )}
            {type === 'league' && favLeagues.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {favLeagues.slice(0, 4).map(l => (
                  <button key={l.id} onClick={() => selectTarget({ name: l.name, id: l.id, logo: l.logo || undefined })} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] transition-all ${targetName === l.name ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-white/40 border border-white/[0.05] hover:bg-white/[0.03]'}`}>
                    {l.name}
                  </button>
                ))}
              </div>
            )}
            {type === 'match' && favMatches.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {favMatches.slice(0, 4).map(m => (
                  <button key={m.canonicalMatchId} onClick={() => selectTarget({ name: `${m.homeTeam} x ${m.awayTeam}`, id: m.canonicalMatchId })} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] transition-all ${targetId === m.canonicalMatchId ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-white/40 border border-white/[0.05] hover:bg-white/[0.03]'}`}>
                    {m.homeTeam} x {m.awayTeam}
                  </button>
                ))}
              </div>
            )}
            {/* Manual input */}
            <input value={targetName} onChange={e => setTargetName(e.target.value)} placeholder="Nome do time, partida ou liga" className="w-full h-9 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 text-[11px] text-white placeholder:text-white/20 outline-none focus:border-white/[0.12]" />
            {targetName.length === 0 && favTeams.length === 0 && favLeagues.length === 0 && favMatches.length === 0 && (
              <p className="text-[9px] text-white/20 mt-2">Favorite times, partidas ou ligas para criar alertas rapidamente.</p>
            )}
          </div>
        )}

        {/* Name */}
        <div className="mb-4">
          <label className="text-[10px] text-white/30 font-semibold uppercase tracking-wider block mb-2">Nome do alerta</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Alerta Flamengo" className="w-full h-9 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 text-[11px] text-white placeholder:text-white/20 outline-none focus:border-white/[0.12]" />
        </div>

        {/* Events */}
        <div className="mb-5">
          <label className="text-[10px] text-white/30 font-semibold uppercase tracking-wider block mb-2">Eventos monitorados</label>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_ALERT_EVENTS.map(ev => (
              <button key={ev} onClick={() => toggleEvent(ev)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-medium transition-all ${events.includes(ev) ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-white/30 border border-white/[0.05] hover:text-white/50'}`}>
                <span className={`h-3 w-3 rounded-md border ${events.includes(ev) ? 'bg-cyan-400 border-cyan-400' : 'border-white/20'}`} />
                {getEventLabel(ev)}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[11px] font-medium text-white/30 border border-white/[0.06] hover:text-white/50 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={!canSave} className={`px-5 py-2 rounded-xl text-[11px] font-semibold transition-all ${canSave ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/20' : 'bg-white/[0.02] text-white/15 border border-white/[0.04] cursor-not-allowed'}`}>
            {editing ? 'Salvar' : 'Criar alerta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Stat Pill ───────────────────────────────────────────────────────────────

function StatPill({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${highlight && value > 0 ? 'border-emerald-500/15 bg-emerald-500/5' : 'border-white/[0.05] bg-white/[0.02]'}`}>
      <span className={`text-[14px] font-bold tabular-nums ${highlight && value > 0 ? 'text-emerald-400' : 'text-white/50'}`}>{value}</span>
      <span className="text-[9px] text-white/25">{label}</span>
    </div>
  )
}
