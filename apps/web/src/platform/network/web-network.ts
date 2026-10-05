import type { NetworkService, NetworkStatus } from '@multivus/services'

export class WebNetworkService implements NetworkService {
  async getStatus(): Promise<NetworkStatus> {
    return navigator.onLine ? 'ONLINE' : 'OFFLINE'
  }

  subscribe(listener: (status: NetworkStatus) => void): () => void {
    const emit = () => listener(navigator.onLine ? 'ONLINE' : 'OFFLINE')
    window.addEventListener('online', emit)
    window.addEventListener('offline', emit)
    return () => {
      window.removeEventListener('online', emit)
      window.removeEventListener('offline', emit)
    }
  }
}
