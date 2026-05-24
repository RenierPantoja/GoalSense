import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { FavoritesProvider } from './context/FavoritesContext'
import { ViewModeProvider } from './context/ViewModeContext'
import { AlertsProvider } from './context/AlertsContext'
import { App } from './app/App'
import './styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <FavoritesProvider>
        <ViewModeProvider>
          <AlertsProvider>
            <App />
          </AlertsProvider>
        </ViewModeProvider>
      </FavoritesProvider>
    </BrowserRouter>
  </StrictMode>,
)
