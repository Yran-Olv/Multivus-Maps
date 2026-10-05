export type GeoPosition = {
  latitude: number
  longitude: number
  accuracy: number | null
  heading: number | null
  speed: number | null
  timestamp: number
}

export class LocationError extends Error {
  constructor(
    message: string,
    readonly code: 'denied' | 'unavailable' | 'timeout' | 'unsupported',
  ) {
    super(message)
    this.name = 'LocationError'
  }
}

export interface LocationService {
  getCurrentPosition(): Promise<GeoPosition>
  watchPosition(onPosition: (position: GeoPosition) => void, onError: (error: LocationError) => void): Promise<() => void>
  stopWatching(): Promise<void>
}

export type NetworkStatus = 'ONLINE' | 'OFFLINE'

export interface NetworkService {
  getStatus(): Promise<NetworkStatus>
  subscribe(listener: (status: NetworkStatus) => void): () => void
}

export interface StorageService {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}

export interface ShareService {
  share(input: { title: string; text: string; url?: string }): Promise<'shared' | 'copied' | 'cancelled'>
}

export type NavigationStart =
  | { status: 'centered'; latitude: number; longitude: number }
  | { status: 'external' }
  | { status: 'missing_coordinates' }

export interface NavigationService {
  startNavigation(input: {
    label: string
    latitude: number | null
    longitude: number | null
  }): Promise<NavigationStart>
}

type CapacitorGlobal = {
  isNativePlatform?: () => boolean
}

export function isCapacitorNative(): boolean {
  const capacitor = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor
  return Boolean(capacitor?.isNativePlatform?.())
}
