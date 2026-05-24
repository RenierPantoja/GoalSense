/**
 * Global view mode: basic / advanced.
 * Persisted in localStorage.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

type ViewModeType = 'basic' | 'advanced'

interface ViewModeContextValue {
  mode: ViewModeType
  setMode: (m: ViewModeType) => void
  toggleMode: () => void
  isAdvanced: boolean
}

const STORAGE_KEY = 'goalsense_view_mode'

function loadMode(): ViewModeType {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'advanced') return 'advanced'
  } catch { /* */ }
  return 'basic'
}

const ViewModeContext = createContext<ViewModeContextValue | null>(null)

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ViewModeType>(loadMode)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* */ }
  }, [mode])

  const setMode = useCallback((m: ViewModeType) => setModeState(m), [])
  const toggleMode = useCallback(() => setModeState(p => p === 'basic' ? 'advanced' : 'basic'), [])
  const isAdvanced = mode === 'advanced'

  return (
    <ViewModeContext.Provider value={{ mode, setMode, toggleMode, isAdvanced }}>
      {children}
    </ViewModeContext.Provider>
  )
}

export function useViewMode() {
  const ctx = useContext(ViewModeContext)
  if (!ctx) throw new Error('useViewMode must be used within ViewModeProvider')
  return ctx
}
