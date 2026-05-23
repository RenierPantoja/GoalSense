import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Radio,
  Calendar,
  Bell,
  Crosshair,
  Trophy,
  Star,
  Settings,
  CreditCard,
} from 'lucide-react'

const navGroups = [
  {
    label: 'Core',
    items: [
      { to: '/app/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/app/live', icon: Radio, label: 'Live Radar' },
      { to: '/app/matches', icon: Calendar, label: 'Partidas' },
      { to: '/app/alerts', icon: Bell, label: 'Alertas' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/app/command', icon: Crosshair, label: 'Command Center' },
      { to: '/app/leagues', icon: Trophy, label: 'Ligas' },
    ],
  },
  {
    label: 'Personal',
    items: [
      { to: '/app/favorites', icon: Star, label: 'Favoritos' },
      { to: '/app/settings', icon: Settings, label: 'Configuracoes' },
      { to: '/app/pricing', icon: CreditCard, label: 'Planos' },
    ],
  },
]

export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-60 h-screen bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[var(--border-subtle)]">
        <h1 className="text-lg font-bold tracking-tight text-[var(--accent-cyan)]">
          GoalSense
        </h1>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              {group.label}
            </span>
            <div className="mt-2 space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                    }`
                  }
                >
                  <item.icon size={16} strokeWidth={1.8} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
