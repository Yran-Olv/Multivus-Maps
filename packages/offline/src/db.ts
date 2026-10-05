import Dexie, { type Table } from 'dexie'

export type LocalAlias = {
  alias: string
  aliasType: string
}

export type LocalStreet = {
  id: string
  officialName: string
  streetType: string
  neighborhoodName: string | null
  verified: boolean
  source: string | null
  sourceDate: string | null
  geometry: unknown | null
  aliases: LocalAlias[]
  confidence?: number | null
}

export type LocalPlace = {
  id: string
  name: string
  category: string
  description: string | null
  latitude: number | null
  longitude: number | null
  verified: boolean
  source: string | null
}

export type LocalNeighborhood = {
  id: string
  name: string
}

export type LocalFavorite = {
  id: string
  label: string
  streetId: string | null
  placeId: string | null
  customerInput?: string | null
  matchedAlias?: string | null
  createdAt: string
  pending: boolean
}

export type LocalRecent = {
  id: string
  query: string
  title: string
  streetId: string | null
  createdAt: string
}

export type SyncQueueItem = {
  id?: number
  clientId: string
  operation: 'map-correction' | 'delivery-location' | 'favorite'
  payload: Record<string, unknown>
  createdAt: string
  attempts: number
  lastError?: string
}

export type KvRow = {
  key: string
  value: unknown
}

export type LocalLandmark = {
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
  confidence: number
}

export type LocalReference = {
  id: string
  popularPhrase: string
  relationType: string
  targetStreetId: string | null
  targetStreetName: string | null
  landmarkId: string | null
  landmarkName: string | null
  description: string | null
  confirmationsCount: number
  confidence: number
  verified: boolean
}

export class MultivusDB extends Dexie {
  streets!: Table<LocalStreet, string>
  places!: Table<LocalPlace, string>
  landmarks!: Table<LocalLandmark, string>
  localReferences!: Table<LocalReference, string>
  neighborhoods!: Table<LocalNeighborhood, string>
  favorites!: Table<LocalFavorite, string>
  recents!: Table<LocalRecent, string>
  syncQueue!: Table<SyncQueueItem, number>
  kv!: Table<KvRow, string>

  constructor(name = 'multivus-maps') {
    super(name)
    this.version(1).stores({
      streets: 'id, officialName, verified',
      places: 'id, name, category',
      neighborhoods: 'id, name',
      favorites: 'id, createdAt',
      recents: 'id, createdAt',
      syncQueue: '++id, clientId, operation, createdAt',
      kv: 'key',
    })
    this.version(2).stores({
      streets: 'id, officialName, verified',
      places: 'id, name, category',
      landmarks: 'id, name, category, streetId',
      localReferences: 'id, popularPhrase, targetStreetId, landmarkId',
      neighborhoods: 'id, name',
      favorites: 'id, createdAt',
      recents: 'id, createdAt',
      syncQueue: '++id, clientId, operation, createdAt',
      kv: 'key',
    })
  }
}

export function createDatabase(name?: string): MultivusDB {
  return new MultivusDB(name)
}

