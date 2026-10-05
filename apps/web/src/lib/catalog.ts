import neighborhoodSeed from '@data/santa-juliana/neighborhoods.seed.json'
import placeSeed from '@data/santa-juliana/places.seed.json'
import streetSeed from '@data/santa-juliana/streets.seed.json'
import { normalizeAddress } from '@multivus/map-core'
import type { LocalNeighborhood, LocalPlace, LocalStreet } from '@multivus/offline'
import { api } from './api'
import { db } from './db'

const SEED_VERSION = 'santa-juliana-2021-07'

export async function ensureSeed(): Promise<void> {
  const current = await db.kv.get('seedVersion')
  if (current?.value === SEED_VERSION && (await db.streets.count()) > 0) return
  const source = await db.kv.get('catalogSource')
  if (source?.value === 'api') return
  await db.transaction('rw', db.streets, db.places, db.neighborhoods, db.kv, async () => {
    await db.streets.clear()
    await db.places.clear()
    await db.neighborhoods.clear()
    await db.streets.bulkAdd(
      streetSeed.streets.map((street) => ({
        id: `seed:${normalizeAddress(street.officialName)}`,
        officialName: street.officialName,
        streetType: street.streetType,
        neighborhoodName: null,
        verified: false,
        source: street.source,
        sourceDate: street.sourceDate,
        geometry: null,
        aliases: street.aliases,
      })),
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
    await db.kv.put({ key: 'seedVersion', value: SEED_VERSION })
    await db.kv.put({ key: 'catalogSource', value: 'seed' })
  })
}

export async function readCatalog(): Promise<{
  streets: LocalStreet[]
  places: LocalPlace[]
  neighborhoods: LocalNeighborhood[]
}> {
  const [streets, places, neighborhoods] = await Promise.all([
    db.streets.orderBy('officialName').toArray(),
    db.places.orderBy('name').toArray(),
    db.neighborhoods.orderBy('name').toArray(),
  ])
  return { streets, places, neighborhoods }
}

export async function refreshCatalogFromApi(): Promise<void> {
  const [streetBody, placeBody, neighborhoodBody] = await Promise.all([
    api<{ streets: ApiStreet[] }>('/api/v1/streets'),
    api<{ places: ApiPlace[] }>('/api/v1/places'),
    api<{ neighborhoods: ApiNeighborhood[] }>('/api/v1/neighborhoods'),
  ])
  await db.transaction('rw', db.streets, db.places, db.neighborhoods, db.kv, async () => {
    await db.streets.clear()
    await db.places.clear()
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
    await db.neighborhoods.bulkAdd(
      neighborhoodBody.neighborhoods.map((neighborhood) => ({
        id: neighborhood.id,
        name: neighborhood.name,
      })),
    )
    await db.kv.put({ key: 'catalogSource', value: 'api' })
  })
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
  if (value.type === 'LineString' && Array.isArray(value.coordinates)) {
    const first = value.coordinates[0] as number[] | undefined
    if (first && typeof first[0] === 'number' && typeof first[1] === 'number') {
      return { longitude: first[0], latitude: first[1] }
    }
  }
  return null
}

export function lineOf(id: string, geometry: unknown): { id: string; coordinates: [number, number][] } | null {
  if (!geometry || typeof geometry !== 'object') return null
  const value = geometry as { type?: string; coordinates?: [number, number][] }
  if (value.type !== 'LineString' || !Array.isArray(value.coordinates) || value.coordinates.length < 2) return null
  return { id, coordinates: value.coordinates }
}
