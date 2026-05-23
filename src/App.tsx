import { Routes, Route } from 'react-router-dom'
import { LivePage } from './pages/LivePage'

export default function App() {
  return (
    <div className="min-h-screen bg-[var(--bg-main)]">
      <header className="border-b border-slate-700 px-6 py-4">
        <h1 className="text-xl font-bold text-cyan-400">GoalSense</h1>
        <p className="text-sm text-slate-400">Radar de padrões ao vivo no futebol</p>
      </header>
      <main className="mx-auto max-w-7xl p-4">
        <Routes>
          <Route path="/" element={<LivePage />} />
        </Routes>
      </main>
    </div>
  )
}
