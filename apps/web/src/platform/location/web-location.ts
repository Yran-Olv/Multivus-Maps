import { LocationError, type GeoPosition, type LocationService } from '@multivus/services'

export class WebLocationService implements LocationService {
  private watchId: number | null = null

  async getCurrentPosition(): Promise<GeoPosition> {
    const geolocation = navigator.geolocation
    if (!geolocation) throw new LocationError('Localização indisponível neste aparelho', 'unsupported')
    return new Promise((resolve, reject) => {
      geolocation.getCurrentPosition(
        (position) => resolve(toGeo(position)),
        (error) => reject(toError(error)),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
      )
    })
  }

  async watchPosition(onPosition: (position: GeoPosition) => void, onError: (error: LocationError) => void): Promise<() => void> {
    const geolocation = navigator.geolocation
    if (!geolocation) {
      onError(new LocationError('Localização indisponível neste aparelho', 'unsupported'))
      return () => undefined
    }
    this.watchId = geolocation.watchPosition(
      (position) => onPosition(toGeo(position)),
      (error) => onError(toError(error)),
      { enableHighAccuracy: true, maximumAge: 5000 },
    )
    return () => {
      void this.stopWatching()
    }
  }

  async stopWatching(): Promise<void> {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
  }
}

function toGeo(position: GeolocationPosition): GeoPosition {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    heading: position.coords.heading,
    speed: position.coords.speed,
    timestamp: position.timestamp,
  }
}

function toError(error: GeolocationPositionError): LocationError {
  if (error.code === error.PERMISSION_DENIED) return new LocationError('Permissão de localização negada', 'denied')
  if (error.code === error.TIMEOUT) return new LocationError('Tempo esgotado ao buscar localização', 'timeout')
  return new LocationError('Não foi possível obter a localização', 'unavailable')
}
