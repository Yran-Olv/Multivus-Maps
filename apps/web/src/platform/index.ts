import type { MultivusDB } from '@multivus/offline'
import { isCapacitorNative, type LocationService, type NetworkService, type NavigationService, type ShareService, type StorageService, type VoiceService } from '@multivus/services'
import { createCapacitorLocation } from './location/capacitor-location'
import { WebLocationService } from './location/web-location'
import { createCapacitorNetwork } from './network/capacitor-network'
import { WebNetworkService } from './network/web-network'
import { WebNavigationService } from './navigation/web-navigation'
import { WebShareService } from './share/web-share'
import { createWebStorage } from './storage/web-storage'
import { WebVoiceService } from './voice/web-voice'

export type Platform = {
  location: LocationService
  network: NetworkService
  storage: StorageService
  share: ShareService
  navigation: NavigationService
  voice: VoiceService
}

export async function createPlatform(db: MultivusDB): Promise<Platform> {
  const native = isCapacitorNative()
  const [location, network] = await Promise.all([
    native ? createCapacitorLocation() : Promise.resolve(new WebLocationService()),
    native ? createCapacitorNetwork() : Promise.resolve(new WebNetworkService()),
  ])
  return {
    location,
    network,
    storage: createWebStorage(db),
    share: new WebShareService(),
    navigation: new WebNavigationService(),
    voice: new WebVoiceService(),
  }
}
