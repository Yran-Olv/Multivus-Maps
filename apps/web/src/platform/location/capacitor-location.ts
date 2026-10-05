import { LocationError, type GeoPosition, type LocationService } from '@multivus/services'

export async function createCapacitorLocation(): Promise<LocationService> {
  const { Geolocation } = await import('@capacitor/geolocation')
  let watchId: string | null = null
  return {
    async getCurrentPosition() {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 })
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading ?? null,
        speed: position.coords.speed ?? null,
        timestamp: position.timestamp,
      }
    },
    async watchPosition(onPosition, onError) {
      watchId = await Geolocation.watchPosition({ enableHighAccuracy: true }, (position, error) => {
        if (error) {
          onError(new LocationError(error.message, 'unavailable'))
          return
        }
        if (!position) return
        const geo: GeoPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading ?? null,
          speed: position.coords.speed ?? null,
          timestamp: position.timestamp,
        }
        onPosition(geo)
      })
      return async () => {
        if (watchId) await Geolocation.clearWatch({ id: watchId })
        watchId = null
      }
    },
    async stopWatching() {
      if (watchId) await Geolocation.clearWatch({ id: watchId })
      watchId = null
    },
  }
}
