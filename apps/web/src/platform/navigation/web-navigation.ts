import type { ExternalMapApp, NavigationService, NavigationStart } from '@multivus/services'

function openDeviceMaps(url: string): boolean {
  const popup = window.open(url, '_blank', 'noopener,noreferrer')
  if (popup) return true
  window.location.assign(url)
  return true
}

export class WebNavigationService implements NavigationService {
  async startNavigation(input: {
    label: string
    latitude: number | null
    longitude: number | null
    app?: ExternalMapApp
  }): Promise<NavigationStart> {
    if (input.app) {
      await this.openExternalMap(input.app, input)
      return { status: 'external', app: input.app }
    }

    if (input.latitude !== null && input.longitude !== null) {
      openDeviceMaps(
        `https://www.google.com/maps/dir/?api=1&destination=${input.latitude},${input.longitude}`,
      )
      return { status: 'centered', latitude: input.latitude, longitude: input.longitude }
    }

    const query = [input.label, 'Santa Juliana', 'MG'].filter(Boolean).join(', ')
    if (!query.trim()) return { status: 'missing_coordinates' }
    openDeviceMaps(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`)
    return { status: 'external', app: 'google' }
  }

  async openExternalMap(
    app: ExternalMapApp,
    input: {
      label: string
      latitude: number | null
      longitude: number | null
    },
  ): Promise<boolean> {
    const hasCoords = input.latitude !== null && input.longitude !== null
    const query = [input.label, 'Santa Juliana', 'MG'].filter(Boolean).join(', ')

    if (app === 'waze') {
      const url = hasCoords
        ? `https://waze.com/ul?ll=${input.latitude},${input.longitude}&navigate=yes`
        : `https://waze.com/ul?q=${encodeURIComponent(query)}`
      return openDeviceMaps(url)
    }

    if (app === 'apple') {
      const url = hasCoords
        ? `https://maps.apple.com/?daddr=${input.latitude},${input.longitude}&dirflg=d`
        : `https://maps.apple.com/?q=${encodeURIComponent(query)}`
      return openDeviceMaps(url)
    }

    // Default: Google Maps
    const url = hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${input.latitude},${input.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    return openDeviceMaps(url)
  }
}
