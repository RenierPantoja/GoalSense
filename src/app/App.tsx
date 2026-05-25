import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'

const LiveRadarPage = lazy(() => import('@/features/live/LiveRadarPage').then(m => ({ default: m.LiveRadarPage })))
const MatchCenterPage = lazy(() => import('@/features/matches/MatchCenterPage').then(m => ({ default: m.MatchCenterPage })))
const MatchesPage = lazy(() => import('@/features/matches/MatchesPage').then(m => ({ default: m.MatchesPage })))
const LeaguesPage = lazy(() => import('@/features/leagues/LeaguesPage').then(m => ({ default: m.LeaguesPage })))
const AlertsPage = lazy(() => import('@/features/alerts/AlertsPage').then(m => ({ default: m.AlertsPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then(m => ({ default: m.SettingsPage })))
const CommandCenterPage = lazy(() => import('@/features/command/CommandCenterPage').then(m => ({ default: m.CommandCenterPage })))
const FavoritesPage = lazy(() => import('@/features/favorites/FavoritesPage').then(m => ({ default: m.FavoritesPage })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-cyan-400/20 border-t-cyan-400 animate-spin" />
        <span className="text-[11px] text-white/25">Carregando...</span>
      </div>
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Navigate to="live" replace />} />
        <Route path="live" element={<Suspense fallback={<PageLoader />}><LiveRadarPage /></Suspense>} />
        <Route path="matches/:fixtureId" element={<Suspense fallback={<PageLoader />}><MatchCenterPage /></Suspense>} />
        <Route path="dashboard" element={<Navigate to="/app/live" replace />} />
        <Route path="matches" element={<Suspense fallback={<PageLoader />}><MatchesPage /></Suspense>} />
        <Route path="command" element={<Suspense fallback={<PageLoader />}><CommandCenterPage /></Suspense>} />
        <Route path="alerts" element={<Suspense fallback={<PageLoader />}><AlertsPage /></Suspense>} />
        <Route path="leagues" element={<Suspense fallback={<PageLoader />}><LeaguesPage /></Suspense>} />
        <Route path="favorites" element={<Suspense fallback={<PageLoader />}><FavoritesPage /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
        <Route path="pricing" element={<Navigate to="/app/settings" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/app/live" replace />} />
    </Routes>
  )
}
