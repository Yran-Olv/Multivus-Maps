import type { NetworkService, NetworkStatus } from '@multivus/services'

export async function createCapacitorNetwork(): Promise<NetworkService> {
  const { Network } = await import('@capacitor/network')
  return {
    async getStatus() {
      const status = await Network.getStatus()
      return status.connected ? 'ONLINE' : 'OFFLINE'
    },
    subscribe(listener) {
      const handle = Network.addListener('networkStatusChange', (status) => {
        const next: NetworkStatus = status.connected ? 'ONLINE' : 'OFFLINE'
        listener(next)
      })
      return () => {
        void handle.then((listenerHandle) => listenerHandle.remove())
      }
    },
  }
}
