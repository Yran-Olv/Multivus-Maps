import type { NavigationService, NavigationStart } from '@multivus/services'

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
  }): Promise<NavigationStart> {
    if (input.latitude !== null && input.longitude !== null) {
      openDeviceMaps(
        `https://www.google.com/maps/dir/?api=1&destination=${input.latitude},${input.longitude}`,
      )
      return { status: 'centered', latitude: input.latitude, longitude: input.longitude }
    }
    const query = [input.label, 'Santa Juliana', 'MG'].filter(Boolean).join(', ')
    if (!query.trim()) return { status: 'missing_coordinates' }
    openDeviceMaps(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`)
    return { status: 'external' }
  }
}
