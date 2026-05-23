import { Outlet } from 'react-router-dom'
import { TopNavigation } from './TopNavigation'

export function AppShell() {
  return (
    <div className="min-h-screen bg-[var(--bg-app)]">
      <TopNavigation />
      <main className="mx-auto max-w-[1400px] px-5 py-8">
        <Outlet />
      </main>
    </div>
  )
}
