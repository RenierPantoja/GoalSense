import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { FavoritesProvider } from './context/FavoritesContext'
import { ViewModeProvider } from './context/ViewModeContext'
import { AlertsProvider } from './context/AlertsContext'
import { PatternProvider } from './features/command/contexts/PatternContext'
import { runStartupMaintenance } from './services/cache/storageMaintenance'
import { App } from './app/App'
import './styles/globals.css'

// Run cache cleanup on startup
runStartupMaintenance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <FavoritesProvider>
        <ViewModeProvider>
          <AlertsProvider>
            <PatternProvider>
              <App />
            </PatternProvider>
          </AlertsProvider>
        </ViewModeProvider>
      </FavoritesProvider>
    </BrowserRouter>
  </StrictMode>,
)
