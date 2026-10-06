import { OfflineIndicator, NavigationBottomBar } from '@multivus/ui'
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { usePlatform } from './platform/context'
import { db } from './lib/db'
import { clearAppCacheAndReload, initPwaUpdater } from './lib/pwa-update'
import { useSession } from './lib/session'
import { flushPending } from './lib/sync'
import { useUi } from './stores/ui'

export function App() {
  const platform = usePlatform()
  const location = useLocation()
  const online = useUi((state) => state.online)
  const pending = useUi((state) => state.pending)
  const updateAvailable = useUi((state) => state.updateAvailable)
  const hideNav = location.pathname === '/entrar' || location.pathname === '/busca' || location.pathname === '/entender' || location.pathname.startsWith('/admin')

  useEffect(() => {
    const stopUpdater = initPwaUpdater(() => {
      useUi.getState().setUpdateAvailable(true)
    })
    return () => {
      stopUpdater?.()
    }
  }, [])

  useEffect(() => {
    let stopWatch: (() => void) | null = null
    const stopNetwork = platform.network.subscribe((status) => {
      const nextOnline = status === 'ONLINE'
      useUi.getState().setOnline(nextOnline)
      if (nextOnline && useSession.getState().accessToken) {
        void flushPending().finally(refreshPending)
      }
    })
    void platform.network.getStatus().then((status) => useUi.getState().setOnline(status === 'ONLINE'))
    void refreshPending()
    void platform.location.watchPosition(
      (position) => useUi.getState().setLocation(position),
      () => undefined,
    ).then((stop) => {
      stopWatch = () => {
        void stop()
      }
    })
    return () => {
      stopNetwork()
      stopWatch?.()
      void platform.location.stopWatching()
    }
  }, [platform])

  return (
    <div className="flex h-dvh flex-col bg-[#0e141b] text-white">
      {updateAvailable ? (
        <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-amber-500 to-yellow-400 px-4 py-2.5 text-slate-950 shadow-md z-50">
          <div className="flex items-center gap-2 text-xs font-bold sm:text-sm">
            <span>🚀 Nova versão disponível!</span>
          </div>
          <button
            type="button"
            onClick={() => void clearAppCacheAndReload()}
            className="rounded-lg bg-slate-950 px-3 py-1 text-xs font-bold text-amber-300 shadow hover:bg-black active:scale-95 transition"
          >
            Atualizar Agora
          </button>
        </div>
      ) : null}
      <OfflineIndicator online={online} pending={pending} />
      <div className="relative min-h-0 flex-1">
        <Outlet />
      </div>
      {hideNav ? null : <NavigationBottomBar />}
    </div>
  )
}

async function refreshPending() {
  useUi.getState().setPending(await db.syncQueue.count())
}
