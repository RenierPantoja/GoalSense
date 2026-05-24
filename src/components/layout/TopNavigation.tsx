import { NavLink } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'

const navItems = [
  { to: '/app/live', label: 'Live Radar' },
  { to: '/app/matches', label: 'Partidas' },
  { to: '/app/command', label: 'Command Center' },
  { to: '/app/alerts', label: 'Alertas' },
  { to: '/app/leagues', label: 'Ligas' },
  { to: '/app/favorites', label: 'Favoritos' },
]

interface TopNavigationProps {
  onRefresh?: () => void
  refreshing?: boolean
}

export function TopNavigation({ onRefresh, refreshing }: TopNavigationProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-glass)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center px-5">
        {/* Logo */}
        <span className="mr-8 text-[15px] font-semibold tracking-tight text-[var(--accent-cyan)]">
          GoalSense
        </span>

        {/* Nav */}
        <nav className="flex items-center gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Dados reais
          </span>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:opacity-40"
              aria-label="Atualizar dados"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
