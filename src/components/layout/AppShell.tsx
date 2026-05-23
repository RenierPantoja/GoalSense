import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AppShell() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="lg:ml-60 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
