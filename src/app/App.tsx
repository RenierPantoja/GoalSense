import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { LiveRadarPage } from '@/features/live/LiveRadarPage'
import { MatchCenterPage } from '@/features/matches/MatchCenterPage'
import { MatchesPage } from '@/features/matches/MatchesPage'

export function App() {
  return (
    <Routes>
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Navigate to="live" replace />} />
        <Route path="live" element={<LiveRadarPage />} />
        <Route path="matches/:fixtureId" element={<MatchCenterPage />} />
        <Route path="dashboard" element={<ComingSoon title="Dashboard" />} />
        <Route path="matches" element={<MatchesPage />} />
        <Route path="command" element={<ComingSoon title="Command Center" />} />
        <Route path="alerts" element={<ComingSoon title="Alertas" />} />
        <Route path="leagues" element={<ComingSoon title="Ligas" />} />
        <Route path="favorites" element={<ComingSoon title="Favoritos" />} />
        <Route path="settings" element={<ComingSoon title="Configurações" />} />
        <Route path="pricing" element={<ComingSoon title="Planos" />} />
      </Route>
      <Route path="*" element={<Navigate to="/app/live" replace />} />
    </Routes>
  )
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">Em desenvolvimento</p>
    </div>
  )
}
