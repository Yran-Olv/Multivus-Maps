import { APP_VERSION, APP_BUILD_DATE, APP_BUILD_ID } from '@multivus/shared'

export { APP_VERSION, APP_BUILD_DATE, APP_BUILD_ID }

let swRegistration: ServiceWorkerRegistration | null = null

/**
 * Inicializa o registro e monitoramento do Service Worker nativo.
 * Detecta automaticamente quando uma nova versão foi implantada.
 */
export function initPwaUpdater(onNeedRefresh?: () => void) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  // Registra o Service Worker nativamente gerado pelo VitePWA (/sw.js)
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      swRegistration = reg

      // Escuta novos workers em instalação
      reg.addEventListener('updatefound', () => {
        const installingWorker = reg.installing
        if (!installingWorker) return

        installingWorker.addEventListener('statechange', () => {
          // Se o novo worker foi instalado e já existe um controlador antigo rodando
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[PWA] Nova versão instalada e aguardando ativação.')
            onNeedRefresh?.()
          }
        })
      })

      // Se já houver um worker esperando ativação
      if (reg.waiting && navigator.serviceWorker.controller) {
        onNeedRefresh?.()
      }
    })
    .catch((err) => {
      console.warn('[PWA] Erro ao registrar Service Worker:', err)
    })

  // Checagem periódica a cada 5 minutos
  const interval = setInterval(async () => {
    try {
      if (swRegistration) {
        await swRegistration.update()
      } else {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg) await reg.update()
      }
    } catch {
      // Ignora erro de rede em background
    }
  }, 5 * 60 * 1000)

  const handleFocus = async () => {
    try {
      const reg = swRegistration ?? (await navigator.serviceWorker.getRegistration())
      if (reg) await reg.update()
    } catch {
      // Ignora erro de rede
    }
  }

  window.addEventListener('focus', handleFocus)

  return () => {
    clearInterval(interval)
    window.removeEventListener('focus', handleFocus)
  }
}

/**
 * Limpa todos os caches do navegador (CacheStorage), desregistra Service Workers
 * e força recarregamento imediato com parâmetro quebra-cache.
 * Funciona em celulares Android (Chrome) e iPhone (Safari / PWA).
 */
export async function clearAppCacheAndReload() {
  try {
    // 1. Notifica o service worker ativo para pular espera
    if (swRegistration?.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }

    // 2. Desregistra todos os Service Workers registrados
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const reg of registrations) {
        await reg.unregister()
      }
    }

    // 3. Deleta todos os caches do CacheStorage
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map((name) => caches.delete(name)))
    }

    // 4. Limpa storage de sessão e salva token de recarga
    sessionStorage.clear()
    localStorage.setItem('multivus_cache_busted', Date.now().toString())
  } catch (error) {
    console.error('[PWA] Erro ao limpar caches:', error)
  } finally {
    // 5. Força recarregamento com parâmetro único anti-cache
    const url = new URL(window.location.origin)
    url.searchParams.set('v', `${APP_BUILD_ID}_${Date.now()}`)
    window.location.replace(url.toString())
  }
}
