export type ExtractedCoordinate = {
  latitude: number
  longitude: number
  coordinateType: 'address-point' | 'street-access'
}

function isValidCoord(longitude: unknown, latitude: unknown): longitude is number {
  return (
    typeof longitude === 'number' &&
    typeof latitude === 'number' &&
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  )
}

export function pointOf(
  geometry: unknown,
): { latitude: number; longitude: number; coordinateType?: 'address-point' | 'street-access' } | null {
  if (!geometry || typeof geometry !== 'object') return null
  const value = geometry as { type?: string; coordinates?: unknown }
  if (!value.type || !value.coordinates) return null

  // 1. Ponto geográfico exato (Point)
  if (value.type === 'Point' && Array.isArray(value.coordinates)) {
    const [longitude, latitude] = value.coordinates as number[]
    if (isValidCoord(longitude, latitude)) {
      return { longitude, latitude, coordinateType: 'address-point' }
    }
    return null
  }

  // 2. Linha da via (LineString): ponto acessível representativo da via (ponto médio da geometria)
  if (value.type === 'LineString' && Array.isArray(value.coordinates) && value.coordinates.length >= 2) {
    const coords = value.coordinates as [number, number][]
    const midIndex = Math.floor(coords.length / 2)
    const [longitude, latitude] = coords[midIndex] ?? coords[0]!
    if (isValidCoord(longitude, latitude)) {
      return { longitude, latitude, coordinateType: 'street-access' }
    }
    return null
  }

  // 3. Multilinhas (MultiLineString): ponto médio do segmento principal
  if (value.type === 'MultiLineString' && Array.isArray(value.coordinates) && value.coordinates.length > 0) {
    const lines = value.coordinates as [number, number][][]
    const sorted = [...lines].sort((a, b) => b.length - a.length)
    const longest = sorted[0]
    if (longest && longest.length >= 2) {
      const midIndex = Math.floor(longest.length / 2)
      const [longitude, latitude] = longest[midIndex] ?? longest[0]!
      if (isValidCoord(longitude, latitude)) {
        return { longitude, latitude, coordinateType: 'street-access' }
      }
    }
    return null
  }

  return null
}

