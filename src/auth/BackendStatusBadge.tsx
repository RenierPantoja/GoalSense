/**
 * BackendStatusBadge (Phase B28) — shows whether the frontend is talking to a
 * live backend (cloud or local), its app env, and auth state. Never exposes
 * diagnostics/secrets; only /health (public) + the already-loaded session.
 */
import { useEffect, useState } from 'react'
import { Cloud, CloudOff, Loader2 } from 'lucide-react'
import { getBackendUrl } from '@/services/commandBackendClient'
import { useAuth } from './useAuth'

type Status = 'checking' | 'online' | 'offline' | 'no_backend'

interface Health { appEnv?: string; status?: string }

export function BackendStatusBadge() {
  const { session } = useAuth()
  const [status, setStatus] = useState<Status>('checking')
  const [appEnv, setAppEnv] = useState<string | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const check = async () => {
      const base = getBackendUrl()
      if (!base) { if (alive) { setStatus('no_backend'); setCheckedAt(new Date().toISOString()) } return }
      try {
        const res = await fetch(`${base}/api/health`, { headers: { 'Content-Type': 'application/json' } })
        if (!alive) return
        if (res.ok) {
          const h = (await res.json().catch(() => ({}))) as Health
          setStatus('online'); setAppEnv(h.appEnv || null)
        } else setStatus('offline')
      } catch { if (alive) setStatus('offline') }
      if (alive) setCheckedAt(new Date().toISOString())
    }
    void check()
    const t = setInterval(check, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const tone = status === 'online' ? 'bg-[#13B8A6]/12 border-[#2DD4BF]/25 text-[#7FE9DC]'
    : status === 'checking' ? 'bg-white/[0.04] border-white/[0.1] text-white/55'
    : 'bg-amber-500/8 border-amber-400/15 text-amber-100/75'
  const label = status === 'online' ? `online${appEnv ? ` · ${appEnv}` : ''}`
    : status === 'checking' ? 'verificando…'
    : status === 'no_backend' ? 'backend não configurado' : 'offline'
  const title = `Backend: ${label}${session.authMode ? ` · auth: ${session.authMode}` : ''}${checkedAt ? ` · checado ${new Date(checkedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}`

  return (
    <span title={title} className={`inline-flex items-center gap-1.5 text-[10.5px] font-medium px-2 py-1 rounded-full border ${tone}`}>
      {status === 'checking' ? <Loader2 size={11} className="animate-spin" /> : status === 'online' ? <Cloud size={11} /> : <CloudOff size={11} />}
      {label}
    </span>
  )
}
