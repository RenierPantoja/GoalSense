/**
 * Settings page — displays user preferences, mode, favorites summary.
 */
import { useCallback, useEffect, useState } from 'react'
import { Zap, Heart, Trash2, Globe2, Database, Shield, Bell, HardDrive, Smartphone } from 'lucide-react'
import { useFavorites } from '@/context/FavoritesContext'
import { useViewMode } from '@/context/ViewModeContext'
import { useAlerts } from '@/context/AlertsContext'
import { getGoalSenseStorageStats, cleanupExpiredCache, clearPreMatchCache, clearKnowledgeBase, clearOutcomes, clearTriggeredAlerts, clearAllGoalSense, clearScopeKb } from '@/services/cache/storageMaintenance'
import { getServiceWorkerStatus, type ServiceWorkerStatus } from '@/features/pwa/pwaRegistration'
import { canShowLocalNotification, getNotificationPermission, isNotificationSupported, requestNotificationPermission, showLocalNotification, type NotificationPermissionState } from '@/features/notifications/notificationService'
import { loadNotificationSettings, updateNotificationSettings, type NotificationSettings } from '@/features/notifications/notificationSettings'

export function SettingsPage() {
  const { teams, leagues, matches, clearAll, hasAnyFavorite } = useFavorites()
  const { toggleMode, isAdvanced } = useViewMode()
  const { totalCount: alertCount, enabledCount: alertsEnabled, clearAllAlerts } = useAlerts()
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmClearAlerts, setConfirmClearAlerts] = useState(false)
  // Single source of truth for storage stats so any cleanup action triggers a
  // synchronised refresh across the storage and scope-library sections.
  const [stats, setStats] = useState(() => getGoalSenseStorageStats())
  const refreshStats = useCallback(() => setStats(getGoalSenseStorageStats()), [])

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
                <button onClick={() => { clearAll(); setConfirmClear(false); refreshStats() }} className="px-3 py-1 rounded-lg text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">Sim, limpar</button>
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
                <button onClick={() => { clearAllAlerts(); setConfirmClearAlerts(false); refreshStats() }} className="px-3 py-1 rounded-lg text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">Sim, limpar</button>
                <button onClick={() => setConfirmClearAlerts(false)} className="px-3 py-1 rounded-lg text-[10px] font-medium text-white/30 border border-white/[0.06]">Cancelar</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Storage Management */}
      <StorageSection stats={stats} refreshStats={refreshStats} />
      <ScopeLibrarySection stats={stats} refreshStats={refreshStats} />

      {/* App e notificações */}
      <AppNotificationsSection />

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


interface StorageSectionProps {
  stats: ReturnType<typeof getGoalSenseStorageStats>
  refreshStats: () => void
}

function StorageSection({ stats, refreshStats }: StorageSectionProps) {
  const [confirmAll, setConfirmAll] = useState(false)
  const [feedback, setFeedback] = useState('')

  const showFeedback = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 3000) }
  const runWithFeedback = (op: () => void, msg: string) => { op(); refreshStats(); showFeedback(msg) }

  return (
    <div className="gs-card space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/15"><HardDrive size={16} className="text-emerald-400" /></div>
        <div><h3 className="text-[13px] font-semibold text-white/70">Dados locais e cache</h3><p className="text-[10px] text-white/30 mt-0.5">~{stats.estimatedSizeKB} KB usados · {stats.goalsenseKeys} entradas</p></div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <StatBox label="Cache" value={stats.cacheEntries} />
        <StatBox label="Favoritos" value={stats.favorites} />
        <StatBox label="Padrões" value={stats.patterns} />
        <StatBox label="Alertas" value={stats.alerts} />
        <StatBox label="Cmd Alerts" value={stats.commandAlerts} />
        <StatBox label="Outcomes" value={stats.outcomes} />
      </div>

      <div className="pt-3 border-t border-white/[0.04] space-y-2">
        <button onClick={() => { const n = cleanupExpiredCache(); refreshStats(); showFeedback(`${n} caches expirados removidos`) }} className="flex items-center gap-2 text-[11px] text-white/40 hover:text-white/60 transition-colors" type="button"><Trash2 size={11} />Limpar cache expirado</button>
        <button onClick={() => runWithFeedback(clearPreMatchCache, 'Cache de pré-jogo limpo')} className="flex items-center gap-2 text-[11px] text-white/40 hover:text-white/60 transition-colors" type="button"><Trash2 size={11} />Limpar cache de pré-jogo</button>
        <button onClick={() => runWithFeedback(clearKnowledgeBase, 'Knowledge Base limpa')} className="flex items-center gap-2 text-[11px] text-white/40 hover:text-white/60 transition-colors" type="button"><Trash2 size={11} />Limpar Knowledge Base</button>
        <button onClick={() => runWithFeedback(clearOutcomes, 'Outcomes removidos')} className="flex items-center gap-2 text-[11px] text-white/40 hover:text-white/60 transition-colors" type="button"><Trash2 size={11} />Limpar outcomes</button>
        <button onClick={() => runWithFeedback(clearTriggeredAlerts, 'Alertas disparados limpos')} className="flex items-center gap-2 text-[11px] text-white/40 hover:text-white/60 transition-colors" type="button"><Trash2 size={11} />Limpar alertas disparados</button>
      </div>

      <div className="pt-3 border-t border-white/[0.04]">
        {!confirmAll ? (
          <button onClick={() => setConfirmAll(true)} className="flex items-center gap-2 text-[11px] text-rose-400/50 hover:text-rose-400/80 transition-colors" type="button"><Trash2 size={11} />Limpar tudo do GoalSense</button>
        ) : (
          <div className="rounded-xl bg-rose-500/[0.04] border border-rose-500/15 p-3">
            <p className="text-[11px] text-rose-400/70 mb-2">Isso remove cache, Knowledge Base, outcomes, alertas locais, padrões e favoritos salvos neste navegador.</p>
            <div className="flex gap-2">
              <button onClick={() => { clearAllGoalSense(); refreshStats(); setConfirmAll(false); showFeedback('Todos os dados GoalSense removidos') }} className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/25" type="button">Confirmar limpeza total</button>
              <button onClick={() => setConfirmAll(false)} className="px-3 py-1.5 rounded-lg text-[10px] text-white/30 border border-white/[0.06]" type="button">Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {feedback && <p className="text-[11px] text-emerald-400/60 animate-fadeIn">{feedback}</p>}
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (<div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2 text-center"><span className="text-[14px] font-bold text-white/60 block">{value}</span><span className="text-[9px] text-white/30">{label}</span></div>)
}

function ScopeLibrarySection({ stats, refreshStats }: StorageSectionProps) {
  const [confirm, setConfirm] = useState(false)
  const [feedback, setFeedback] = useState('')
  const showFeedback = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 3000) }

  const total = stats.scopeLeagues + stats.scopeTeams + stats.scopeMatches
  const sizeKb = stats.scopeKbBytes > 0 ? Math.max(1, Math.round(stats.scopeKbBytes / 1024)) : 0

  return (
    <div className="gs-card space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-400/20"><HardDrive size={16} className="text-cyan-300" /></div>
        <div>
          <h3 className="text-[13px] font-semibold text-white/70">Biblioteca de ligas, times e partidas</h3>
          <p className="text-[10px] text-white/40 mt-0.5">{total > 0 ? `${total} entradas · ~${sizeKb} KB` : 'biblioteca vazia'}</p>
        </div>
      </div>

      <p className="text-[11px] text-white/55 leading-relaxed">
        O GoalSense guarda ligas, times e partidas vistos para melhorar sugestões de escopo no Command Center. Não apaga padrões, alertas ou histórico — apenas remove sugestões locais.
      </p>

      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Ligas" value={stats.scopeLeagues} />
        <StatBox label="Times" value={stats.scopeTeams} />
        <StatBox label="Partidas" value={stats.scopeMatches} />
      </div>

      <div className="pt-3 border-t border-white/[0.04] flex items-center gap-3 flex-wrap">
        <button onClick={refreshStats} className="flex items-center gap-2 text-[11px] text-white/55 hover:text-white/85 transition-colors" type="button">Atualizar stats</button>
        {!confirm ? (
          <button onClick={() => setConfirm(true)} disabled={total === 0} className="flex items-center gap-2 text-[11px] text-rose-400/65 hover:text-rose-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" type="button"><Trash2 size={11} />Limpar biblioteca de escopo</button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => { clearScopeKb(); refreshStats(); setConfirm(false); showFeedback('Biblioteca de escopo limpa') }} className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-400/25" type="button">Confirmar</button>
            <button onClick={() => setConfirm(false)} className="px-3 py-1.5 rounded-lg text-[10px] text-white/55 border border-white/[0.07]" type="button">Cancelar</button>
          </div>
        )}
        {feedback && <span className="text-[11px] text-emerald-300 animate-fadeIn">{feedback}</span>}
      </div>
    </div>
  )
}


// ─── App e notificações (V5) ─────────────────────────────────────────────────

function AppNotificationsSection() {
  const [swStatus, setSwStatus] = useState<ServiceWorkerStatus>('inactive')
  const [permission, setPermission] = useState<NotificationPermissionState>(() => getNotificationPermission())
  const [settings, setSettings] = useState<NotificationSettings>(() => loadNotificationSettings())
  const [feedback, setFeedback] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const supported = isNotificationSupported()

  const refresh = useCallback(async () => {
    setSwStatus(await getServiceWorkerStatus())
    setPermission(getNotificationPermission())
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const showFeedback = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 3000) }

  const handleRequestPermission = async () => {
    if (!supported) return
    setBusy(true)
    try {
      const result = await requestNotificationPermission()
      setPermission(result)
      if (result === 'granted') showFeedback('Notificações ativadas')
      else if (result === 'denied') showFeedback('Permissão negada — altere nas permissões do site')
      else showFeedback('Permissão não concedida')
    } finally { setBusy(false) }
  }

  const handleSendTest = () => {
    if (!canShowLocalNotification()) {
      showFeedback('Permissão necessária antes de testar')
      return
    }
    const ok = showLocalNotification('GoalSense', {
      body: 'Notificações locais estão funcionando neste navegador.',
      tag: 'gs-notif-test',
      url: '/app/settings',
    })
    showFeedback(ok ? 'Notificação de teste enviada' : 'Não foi possível disparar a notificação')
  }

  const handleToggleCommandAlerts = () => {
    if (!canShowLocalNotification()) {
      showFeedback('Ative as notificações primeiro')
      return
    }
    const next = !settings.commandAlertsEnabled
    setSettings(updateNotificationSettings({ commandAlertsEnabled: next }))
    showFeedback(next ? 'Alertas do Command Center ligados' : 'Alertas do Command Center desligados')
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  const swBadge = (() => {
    switch (swStatus) {
      case 'active': return { label: 'Ativo', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20' }
      case 'registering': return { label: 'Instalando', tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-400/20' }
      case 'inactive': return { label: 'Inativo', tone: 'text-white/55 bg-white/[0.04] border-white/[0.07]' }
      case 'error': return { label: 'Erro', tone: 'text-rose-300 bg-rose-500/10 border-rose-400/20' }
      case 'unsupported':
      default: return { label: 'Não suportado', tone: 'text-white/40 bg-white/[0.03] border-white/[0.06]' }
    }
  })()

  const permBadge = (() => {
    switch (permission) {
      case 'granted': return { label: 'Permitido', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20' }
      case 'denied': return { label: 'Bloqueado', tone: 'text-rose-300 bg-rose-500/10 border-rose-400/20' }
      case 'default': return { label: 'Não solicitado', tone: 'text-amber-300 bg-amber-500/10 border-amber-400/20' }
      case 'unsupported':
      default: return { label: 'Não suportado', tone: 'text-white/40 bg-white/[0.03] border-white/[0.06]' }
    }
  })()

  return (
    <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.015] p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/15">
          <Smartphone size={16} className="text-cyan-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-white/70">App e notificações</h3>
          <p className="text-[10px] text-white/40 mt-0.5">Instalação como aplicativo e preferências de aviso local.</p>
        </div>
        <button onClick={() => void refresh()} type="button" className="text-[10px] font-semibold uppercase tracking-wider text-white/45 hover:text-white/75 transition-colors">Recarregar</button>
      </div>

      {/* Service worker status */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.012] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-white/85">Service Worker</p>
          <p className="text-[10.5px] text-white/45 mt-0.5">Cache do shell e suporte offline básico.</p>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${swBadge.tone}`}>{swBadge.label}</span>
      </div>

      {/* Notification permission */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.012] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-white/85">Notificações do navegador</p>
          <p className="text-[10.5px] text-white/45 mt-0.5">Apenas avisos locais, com a aba aberta. Push em segundo plano ainda não está disponível.</p>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${permBadge.tone}`}>{permBadge.label}</span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {!supported ? (
          <p className="text-[11px] text-white/45">Este navegador não suporta a API de notificações.</p>
        ) : permission === 'granted' ? (
          <button onClick={handleSendTest} type="button" className="px-4 py-2 rounded-xl text-[11px] font-medium text-white/85 border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.14] transition-colors">
            Enviar notificação de teste
          </button>
        ) : permission === 'denied' ? (
          <p className="text-[11px] text-rose-300/80">As notificações foram bloqueadas no navegador. Altere nas permissões do site.</p>
        ) : (
          <button onClick={handleRequestPermission} disabled={busy} type="button" className="px-4 py-2 rounded-xl text-[11px] font-semibold text-cyan-200 border border-cyan-400/25 bg-cyan-500/12 hover:bg-cyan-500/18 transition-colors disabled:opacity-40">
            Ativar notificações
          </button>
        )}
      </div>

      {/* Toggle: Command Center alerts */}
      {supported && (
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.012] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-white/85">Alertas do Command Center</p>
              <p className="text-[10.5px] text-white/45 mt-0.5">Mostra um aviso local ao registrar um novo alerta enquanto a aba estiver aberta.</p>
            </div>
            <button
              onClick={handleToggleCommandAlerts}
              type="button"
              role="switch"
              aria-checked={settings.commandAlertsEnabled}
              disabled={!canShowLocalNotification()}
              className={`shrink-0 relative inline-flex h-6 w-10 rounded-full border transition-colors ${settings.commandAlertsEnabled && canShowLocalNotification() ? 'bg-emerald-500/55 border-transparent' : 'bg-white/[0.06] border-white/[0.07]'} disabled:opacity-40`}
              style={{ boxSizing: 'border-box' }}
            >
              <span aria-hidden className={`absolute top-[3px] h-3.5 w-3.5 rounded-full transition-[left] ${settings.commandAlertsEnabled && canShowLocalNotification() ? 'left-[20px] bg-white' : 'left-[3px] bg-white/65'}`} />
            </button>
          </div>
          {!canShowLocalNotification() && settings.commandAlertsEnabled && (
            <p className="text-[10.5px] text-amber-300/80 mt-2">Permissão é necessária para receber estes avisos. Ative as notificações acima.</p>
          )}
        </div>
      )}

      {feedback && <p className="text-[11px] text-emerald-300/85 animate-fadeIn">{feedback}</p>}

      <p className="text-[10.5px] text-white/35 leading-relaxed">
        Push em segundo plano — com a aba fechada — exige backend e gerenciamento de tokens, e ainda não está disponível.
      </p>
    </div>
  )
}
