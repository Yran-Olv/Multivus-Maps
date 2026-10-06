import landmarkSeed from '@data/santa-juliana/landmarks.seed.json'
import referenceSeed from '@data/santa-juliana/local-references.seed.json'
import neighborhoodSeed from '@data/santa-juliana/neighborhoods.seed.json'
import placeSeed from '@data/santa-juliana/places.seed.json'
import streetSeed from '@data/santa-juliana/streets.seed.json'
import reportData from '@data/import/reports/santa-juliana.json'
import { normalizeAddress } from '@multivus/map-core'
import type { LocalLandmark, LocalNeighborhood, LocalPlace, LocalReference, LocalStreet } from '@multivus/offline'
import { api } from './api'
import { db } from './db'

const SEED_VERSION = 'santa-juliana-2026-10-v4'

const osmGeometries = new Map<string, unknown>()
for (const item of (reportData as { items?: Array<{ multivus_name?: string; source_name?: string; geometry?: unknown }> }).items ?? []) {
  if (item.geometry) {
    if (item.multivus_name) osmGeometries.set(normalizeAddress(item.multivus_name), item.geometry)
    if (item.source_name) osmGeometries.set(normalizeAddress(item.source_name), item.geometry)
  }
}

export async function ensureSeed(): Promise<void> {
  const current = await db.kv.get('seedVersion')
  if (current?.value === SEED_VERSION && (await db.streets.count()) > 0) return
  const source = await db.kv.get('catalogSource')
  if (source?.value === 'api') return
  await db.transaction('rw', [db.streets, db.places, db.landmarks, db.localReferences, db.neighborhoods, db.kv], async () => {
    await db.streets.clear()

    await db.places.clear()
    await db.landmarks.clear()
    await db.localReferences.clear()
    await db.neighborhoods.clear()
    await db.streets.bulkAdd(
      streetSeed.streets.map((street) => {
        const normName = normalizeAddress(street.officialName)
        let geom: unknown = osmGeometries.get(normName) ?? null
        if (!geom && street.aliases) {
          for (const a of street.aliases) {
            geom = osmGeometries.get(normalizeAddress(a.alias)) ?? null
            if (geom) break
          }
        }
        return {
          id: `seed:${normName}`,
          officialName: street.officialName,
          streetType: street.streetType,
          neighborhoodName: null,
          verified: Boolean(geom),
          source: geom ? 'OpenStreetMap' : street.source,
          sourceDate: street.sourceDate,
          geometry: geom,
          aliases: street.aliases,
        }
      }),
    )
    await db.neighborhoods.bulkAdd(
      neighborhoodSeed.neighborhoods.map((neighborhood) => ({
        id: `seed:${normalizeAddress(neighborhood.name)}`,
        name: neighborhood.name,
      })),
    )
    await db.places.bulkAdd(
      placeSeed.places.map((place) => ({
        id: `seed:${normalizeAddress(place.name)}`,
        name: place.name,
        category: place.category,
        description: place.aliases?.length
          ? `Também conhecido como: ${place.aliases.map((alias) => alias.alias).join(', ')}`
          : null,
        latitude: null,
        longitude: null,
        verified: false,
        source: place.source,
      })),
    )
    await db.landmarks.bulkAdd(
      landmarkSeed.landmarks.map((lm) => ({
        id: `seed:${normalizeAddress(lm.name)}`,
        name: lm.name,
        category: lm.category,
        aliases: lm.aliases ?? [],
        streetId: null,
        streetNumber: lm.streetNumber ?? null,
        neighborhoodName: null,
        address: lm.address ?? null,
        description: lm.description ?? null,
        latitude: lm.latitude ?? null,
        longitude: lm.longitude ?? null,
        verified: lm.verified ?? false,
        confidence: lm.confidenceScore ?? 70,
      })),
    )
    await db.localReferences.bulkAdd(
      referenceSeed.references.map((ref) => ({
        id: `seed:${normalizeAddress(ref.popularPhrase)}`,
        popularPhrase: ref.popularPhrase,
        relationType: ref.relationType,
        targetStreetId: ref.targetStreetName ? `seed:${normalizeAddress(ref.targetStreetName)}` : null,
        targetStreetName: ref.targetStreetName ?? null,
        landmarkId: ref.landmarkName ? `seed:${normalizeAddress(ref.landmarkName)}` : null,
        landmarkName: ref.landmarkName ?? null,
        description: ref.description ?? null,
        confirmationsCount: ref.confirmationsCount ?? 1,
        confidence: ref.confidenceScore ?? 70,
        verified: ref.verified ?? false,
      })),
    )
    await db.kv.put({ key: 'seedVersion', value: SEED_VERSION })
    await db.kv.put({ key: 'catalogSource', value: 'seed' })
  })
}

export async function readCatalog(): Promise<{
  streets: LocalStreet[]
  places: LocalPlace[]
  landmarks: LocalLandmark[]
  localReferences: LocalReference[]
  neighborhoods: LocalNeighborhood[]
}> {
  const [streets, places, landmarks, localReferences, neighborhoods] = await Promise.all([
    db.streets.orderBy('officialName').toArray(),
    db.places.orderBy('name').toArray(),
    db.landmarks.orderBy('name').toArray(),
    db.localReferences.orderBy('popularPhrase').toArray(),
    db.neighborhoods.orderBy('name').toArray(),
  ])
  return { streets, places, landmarks, localReferences, neighborhoods }
}

export async function refreshCatalogFromApi(): Promise<void> {
  const [streetBody, placeBody, landmarkBody, refBody, neighborhoodBody] = await Promise.all([
    api<{ streets: ApiStreet[] }>('/api/v1/streets'),
    api<{ places: ApiPlace[] }>('/api/v1/places'),
    api<{ landmarks: ApiLandmark[] }>('/api/v1/landmarks'),
    api<{ references: ApiReference[] }>('/api/v1/local-references'),
    api<{ neighborhoods: ApiNeighborhood[] }>('/api/v1/neighborhoods'),
  ])
  await db.transaction('rw', [db.streets, db.places, db.landmarks, db.localReferences, db.neighborhoods, db.kv], async () => {
    await db.streets.clear()

    await db.places.clear()
    await db.landmarks.clear()
    await db.localReferences.clear()
    await db.neighborhoods.clear()
    await db.streets.bulkAdd(
      streetBody.streets.map((street) => ({
        id: street.id,
        officialName: street.officialName,
        streetType: street.streetType,
        neighborhoodName: street.neighborhoodName,
        verified: street.verified,
        source: street.source,
        sourceDate: street.sourceDate,
        geometry: street.geometry,
        aliases: street.aliases ?? [],
        confidence: street.confidenceScore ?? null,
      })),
    )
    await db.places.bulkAdd(
      placeBody.places.map((place) => ({
        id: place.id,
        name: place.name,
        category: place.category,
        description: place.description,
        latitude: place.latitude,
        longitude: place.longitude,
        verified: place.verified,
        source: place.source,
      })),
    )
    await db.landmarks.bulkAdd(
      landmarkBody.landmarks.map((lm) => ({
        id: lm.id,
        name: lm.name,
        category: lm.category,
        aliases: lm.aliases ?? [],
        streetId: lm.streetId ?? null,
        streetNumber: lm.streetNumber ?? null,
        neighborhoodName: lm.neighborhoodName ?? null,
        address: lm.address ?? null,
        description: lm.description ?? null,
        latitude: lm.latitude,
        longitude: lm.longitude,
        verified: lm.verified,
        confidence: lm.confidenceScore ?? 70,
      })),
    )
    await db.localReferences.bulkAdd(
      refBody.references.map((ref) => ({
        id: ref.id,
        popularPhrase: ref.popularPhrase,
        relationType: ref.relationType,
        targetStreetId: ref.targetStreetId ?? null,
        targetStreetName: ref.targetStreetName ?? null,
        landmarkId: ref.landmarkId ?? null,
        landmarkName: ref.landmarkName ?? null,
        description: ref.description ?? null,
        confirmationsCount: ref.confirmationsCount ?? 1,
        confidence: ref.confidenceScore ?? 70,
        verified: ref.verified,
      })),
    )
    await db.neighborhoods.bulkAdd(
      neighborhoodBody.neighborhoods.map((neighborhood) => ({
        id: neighborhood.id,
        name: neighborhood.name,
      })),
    )
    await db.kv.put({ key: 'catalogSource', value: 'api' })
  })
}

type ApiLandmark = {
  id: string
  name: string
  category: string
  aliases: string[]
  streetId: string | null
  streetNumber: string | null
  neighborhoodName: string | null
  address: string | null
  description: string | null
  latitude: number | null
  longitude: number | null
  verified: boolean
  confidenceScore: number
}

type ApiReference = {
  id: string
  popularPhrase: string
  relationType: string
  targetStreetId: string | null
  targetStreetName: string | null
  landmarkId: string | null
  landmarkName: string | null
  description: string | null
  confirmationsCount: number
  confidenceScore: number
  verified: boolean
}


type ApiStreet = {
  id: string
  officialName: string
  streetType: string
  neighborhoodName: string | null
  verified: boolean
  source: string | null
  sourceDate: string | null
  geometry: unknown
  aliases: { alias: string; aliasType: string }[] | null
  confidenceScore?: number | null
}

type ApiPlace = {
  id: string
  name: string
  category: string
  description: string | null
  latitude: number | null
  longitude: number | null
  verified: boolean
  source: string | null
}

type ApiNeighborhood = {
  id: string
  name: string
}

export function pointOf(geometry: unknown): { latitude: number; longitude: number } | null {
  if (!geometry || typeof geometry !== 'object') return null
  const value = geometry as { type?: string; coordinates?: unknown }
  if (value.type === 'Point' && Array.isArray(value.coordinates)) {
    const [longitude, latitude] = value.coordinates as number[]
    if (typeof longitude === 'number' && typeof latitude === 'number') return { longitude, latitude }
  }
  if (value.type === 'LineString' && Array.isArray(value.coordinates) && value.coordinates.length > 0) {
    const coords = value.coordinates as number[][]
    const mid = coords[Math.floor(coords.length / 2)] || coords[0]
    if (mid && typeof mid[0] === 'number' && typeof mid[1] === 'number') {
      return { longitude: mid[0], latitude: mid[1] }
    }
  }
  if (value.type === 'MultiLineString' && Array.isArray(value.coordinates) && value.coordinates.length > 0) {
    const lines = value.coordinates as number[][][]
    const longest = [...lines].sort((a, b) => b.length - a.length)[0]
    if (longest && longest.length > 0) {
      const mid = longest[Math.floor(longest.length / 2)] || longest[0]
      if (mid && typeof mid[0] === 'number' && typeof mid[1] === 'number') {
        return { longitude: mid[0], latitude: mid[1] }
      }
    }
  }
  return null
}

export function lineOf(id: string, geometry: unknown): { id: string; coordinates: [number, number][] } | null {
  if (!geometry || typeof geometry !== 'object') return null
  const value = geometry as { type?: string; coordinates?: unknown }
  if (value.type === 'LineString' && Array.isArray(value.coordinates) && value.coordinates.length >= 2) {
    return { id, coordinates: value.coordinates as [number, number][] }
  }
  if (value.type === 'MultiLineString' && Array.isArray(value.coordinates) && value.coordinates.length > 0) {
    const lines = value.coordinates as [number, number][][]
    const sorted = [...lines].sort((a, b) => b.length - a.length)
    if (sorted[0] && sorted[0].length >= 2) {
      return { id, coordinates: sorted[0] }
    }
  }
  return null
}

export function linesOf(id: string, geometry: unknown): Array<{ id: string; coordinates: [number, number][] }> {
  if (!geometry || typeof geometry !== 'object') return []
  const value = geometry as { type?: string; coordinates?: unknown }
  if (value.type === 'LineString' && Array.isArray(value.coordinates) && value.coordinates.length >= 2) {
    return [{ id, coordinates: value.coordinates as [number, number][] }]
  }
  if (value.type === 'MultiLineString' && Array.isArray(value.coordinates)) {
    const lines = value.coordinates as [number, number][][]
    return lines
      .filter((line) => line.length >= 2)
      .map((line, idx) => ({ id: `${id}-${idx}`, coordinates: line }))
  }
  return []
}
