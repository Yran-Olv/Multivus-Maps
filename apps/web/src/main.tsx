import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { App } from './App'
import { ensureSeed } from './lib/catalog'
import { db } from './lib/db'
import { restoreSession } from './lib/session'
import { createPlatform } from './platform'
import { PlatformProvider } from './platform/context'
import { AdminCorrectionsPage, AdminMapPage, AdminPage } from './pages/AdminPages'
import { HomePage } from './pages/HomePage'
import { SearchPage } from './pages/SearchPage'
import { UnderstandPage } from './pages/UnderstandPage'
import {
  CorrectionPage,
  DeliveriesPage,
  FavoritesPage,
  LoginPage,
  MorePage,
  ProfilePage,
  SettingsPage,
} from './pages/SecondaryPages'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function RouteError() {
  return (
    <div className="grid min-h-full place-items-center bg-[#0e141b] px-6 text-center text-white">
      <div>
        <h1 className="text-xl font-semibold">Não foi possível abrir esta tela</h1>
        <p className="mt-2 text-sm text-slate-300">Recarregue o aplicativo. A busca de ruas continua disponível.</p>
        <a href="/" className="mt-5 inline-flex h-12 items-center rounded-xl bg-[#f0b429] px-5 font-semibold text-slate-900">
          Voltar ao início
        </a>
      </div>
    </div>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'busca', element: <SearchPage /> },
      { path: 'entender', element: <UnderstandPage /> },
      { path: 'favoritos', element: <FavoritesPage /> },
      { path: 'entregas', element: <DeliveriesPage /> },
      { path: 'mais', element: <MorePage /> },
      { path: 'perfil', element: <ProfilePage /> },
      { path: 'configuracoes', element: <SettingsPage /> },
      { path: 'correcao', element: <CorrectionPage /> },
      { path: 'entrar', element: <LoginPage /> },
      { path: 'admin', element: <AdminPage /> },
      { path: 'admin/mapa', element: <AdminMapPage /> },
      { path: 'admin/correcoes', element: <AdminCorrectionsPage /> },
    ],
  },
])

const root = document.getElementById('root')
if (!root) throw new Error('Elemento raiz ausente')

const platform = await createPlatform(db)
await restoreSession(platform.storage)
await ensureSeed()

createRoot(root).render(
  <StrictMode>
    <PlatformProvider value={platform}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </PlatformProvider>
  </StrictMode>,
)
