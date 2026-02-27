import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from './context/AppContext'
import './index.css'
import App from './App.jsx'

// ── React Query client ────────────────────────────────────────────────────────
// Global defaults applied to every query in the app unless overridden locally.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // avoid spurious refetches on tab focus
      retry: 1,                    // retry a failed request once before error state
      staleTime: 2000,             // treat data as fresh for 2 s after a fetch
    },
  },
})

// ── Provider nesting order (outside → inside) ─────────────────────────────────
//   1. BrowserRouter   – makes routing available everywhere below
//   2. QueryClientProvider – makes React Query available everywhere below
//   3. AppProvider     – global app state (theme, device status, alerts, battery)
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <App />
      </AppProvider>
    </QueryClientProvider>
  </BrowserRouter>
)