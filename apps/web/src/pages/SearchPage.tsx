import { parseAddressText, searchRecords, type RankedHit, type SearchableRecord } from '@multivus/map-core'
import type { SearchResult } from '@multivus/shared'
import { AddressSearch, type AddressHit } from '@multivus/ui'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useCatalog } from '../hooks/use-catalog'
import { api } from '../lib/api'
import { pointOf } from '../lib/catalog'
import { db } from '../lib/db'
import { useUi, type SelectedPlace } from '../stores/ui'

export function SearchPage() {
  const navigate = useNavigate()
  const catalog = useCatalog()
  const online = useUi((state) => state.online)
  const [query, setQuery] = useState('')
  const [recents, setRecents] = useState<AddressHit[]>([])
  const [favorites, setFavorites] = useState<AddressHit[]>([])

  useEffect(() => {
    void db.recents.orderBy('createdAt').reverse().limit(8).toArray().then((rows) => {
      setRecents(rows.map((row) => ({ id: row.id, title: row.title, subtitle: row.query })))
    })
    void db.favorites.orderBy('createdAt').reverse().limit(8).toArray().then((rows) => {
      setFavorites(rows.map((row) => ({ id: row.id, title: row.label, subtitle: 'Favorito' })))
    })
  }, [])

  const records = useMemo(() => toRecords(catalog.data), [catalog.data])
  const localHits = searchRecords(records, query)
  const remote = useQuery({
    queryKey: ['search', query],
    enabled: online && query.trim().length > 1,
    queryFn: () => api<{ results: SearchResult[] }>(`/api/v1/search?q=${encodeURIComponent(query)}`),
  })
  const results: AddressHit[] = remote.data
    ? remote.data.results.map(toHit)
    : localHits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        subtitle: hit.subtitle,
        warning: hit.warning,
        meta: 'Santa Juliana - MG',
        oldNames: hit.oldNames,
        usedOldName: hit.usedOldName,
        matchedAlias: hit.matchedAlias,
        neighborhoodName: hit.neighborhoodName,
        confidence: hit.confidence,
        verified: hit.verified,
      }))

  async function select(hit: AddressHit) {
    const parsed = parseAddressText(query)
    const remoteHit = remote.data?.results.find((item) => item.id === hit.id)
    const localHit = localHits.find((item) => item.id === hit.id)
    const record = records.find((item) => item.id === hit.id)
    const selected = remoteHit
      ? fromRemote(remoteHit, query)
      : localHit
        ? fromRanked(localHit, query)
        : record
          ? fromRecord(record, query)
          : null
    if (selected) useUi.getState().setSelected(selected, parsed.number ?? '')
    await db.recents.put({
      id: crypto.randomUUID(),
      query: query || hit.title,
      title: hit.title,
      streetId: hit.id,
      createdAt: new Date().toISOString(),
    })
    navigate('/')
  }

  return (
    <AddressSearch
      query={query}
      onQueryChange={setQuery}
      onBack={() => navigate('/')}
      recents={recents}
      favorites={favorites}
      results={results}
      loading={remote.isFetching}
      onSelect={(hit) => void select(hit)}
      onUnderstand={() => navigate('/entender', { state: { text: query } })}
    />
  )
}

function toRecords(catalog: {
  streets?: Array<{ id: string; officialName: string; streetType: string; neighborhoodName: string | null; verified: boolean; source: string | null; sourceDate: string | null; geometry: unknown; aliases: { alias: string; aliasType: string }[]; confidence?: number | null }>
  places?: Array<{ id: string; name: string; description: string | null; latitude: number | null; longitude: number | null; verified: boolean; source: string | null }>
  landmarks?: Array<{ id: string; name: string; category: string; aliases: string[]; streetId: string | null; streetNumber: string | null; neighborhoodName: string | null; address: string | null; description: string | null; latitude: number | null; longitude: number | null; verified: boolean; confidence: number }>
  localReferences?: Array<{ id: string; popularPhrase: string; relationType: string; targetStreetId: string | null; targetStreetName: string | null; landmarkId: string | null; landmarkName: string | null; description: string | null; confirmationsCount: number; confidence: number; verified: boolean }>
  neighborhoods?: Array<{ id: string; name: string }>
} | undefined): SearchableRecord[] {
  if (!catalog) return []
  return [
    ...(catalog.streets ?? []).map((street) => {
      const point = pointOf(street.geometry)
      return {
        id: street.id,
        kind: 'street' as const,
        title: street.officialName,
        streetType: street.streetType,
        neighborhoodName: street.neighborhoodName,
        verified: street.verified,
        source: street.source,
        sourceDate: street.sourceDate,
        geometry: street.geometry,
        aliases: street.aliases,
        confidence: street.confidence,
        latitude: point?.latitude ?? null,
        longitude: point?.longitude ?? null,
      }
    }),
    ...(catalog.landmarks ?? []).map((lm) => ({
      id: lm.id,
      kind: 'landmark' as const,
      title: lm.name,
      category: lm.category,
      neighborhoodName: lm.neighborhoodName,
      verified: lm.verified,
      confidence: lm.confidence,
      latitude: lm.latitude,
      longitude: lm.longitude,
      targetStreetId: lm.streetId,
      aliases: (lm.aliases ?? []).map((alias) => ({ alias, aliasType: 'POPULAR_NAME' })),
      extraText: lm.description,
    })),
    ...(catalog.localReferences ?? []).map((ref) => ({
      id: ref.id,
      kind: 'reference' as const,
      title: ref.popularPhrase,
      relationType: ref.relationType,
      targetStreetId: ref.targetStreetId,
      targetStreetName: ref.targetStreetName,
      landmarkId: ref.landmarkId,
      landmarkName: ref.landmarkName,
      verified: ref.verified,
      confidence: ref.confidence,
      extraText: ref.description,
    })),
    ...(catalog.places ?? []).map((place) => ({
      id: place.id,
      kind: 'place' as const,
      title: place.name,
      verified: place.verified,
      source: place.source,
      extraText: place.description,
      latitude: place.latitude,
      longitude: place.longitude,
    })),
    ...(catalog.neighborhoods ?? []).map((neighborhood) => ({
      id: neighborhood.id,
      kind: 'neighborhood' as const,
      title: neighborhood.name,
      verified: false,
    })),
  ]
}


function toHit(result: SearchResult): AddressHit {
  return {
    id: result.id,
    title: result.title,
    subtitle: result.subtitle,
    warning: result.warning,
    meta: 'Santa Juliana - MG',
    oldNames: result.oldNames,
    usedOldName: result.usedOldName,
    matchedAlias: result.matchedAlias,
    neighborhoodName: result.neighborhoodName,
    confidence: result.confidence,
    verified: result.verified,
  }
}

function fromRanked(hit: RankedHit, query: string): SelectedPlace {
  const parsed = parseAddressText(query)
  const point = pointOf(hit.geometry)
  const isReference = hit.kind === 'reference'
  return {
    id: isReference && hit.targetStreetId ? hit.targetStreetId : hit.id,
    kind: isReference ? 'street' : hit.kind,
    title: isReference && hit.targetStreetName ? hit.targetStreetName : hit.title,
    neighborhoodName: hit.neighborhoodName ?? null,
    oldNames: hit.oldNames,
    usedOldName: hit.usedOldName,
    warning: hit.warning,
    confidence: hit.confidence,
    customerInput: query.trim() || null,
    matchedAlias: isReference ? hit.title : hit.matchedAlias,
    reference: isReference ? (hit.extraText ?? parsed.reference) : parsed.reference,
    source: hit.source ?? null,
    sourceDate: hit.sourceDate ?? null,
    verified: hit.verified,
    latitude: hit.latitude ?? point?.latitude ?? null,
    longitude: hit.longitude ?? point?.longitude ?? null,
    targetStreetName: hit.targetStreetName ?? null,
    landmarkName: hit.landmarkName ?? null,
  }
}

function fromRecord(record: SearchableRecord, query: string): SelectedPlace {
  const parsed = parseAddressText(query)
  const point = pointOf(record.geometry)
  const isReference = record.kind === 'reference'
  return {
    id: isReference && record.targetStreetId ? record.targetStreetId : record.id,
    kind: isReference ? 'street' : record.kind,
    title: isReference && record.targetStreetName ? record.targetStreetName : record.title,
    neighborhoodName: record.neighborhoodName ?? null,
    oldNames: [],
    usedOldName: false,
    warning: null,
    confidence: record.confidence ?? (record.verified ? 100 : record.source ? 70 : 0),
    customerInput: query.trim() || null,
    matchedAlias: isReference ? record.title : null,
    reference: parsed.reference,
    source: record.source ?? null,
    sourceDate: record.sourceDate ?? null,
    verified: record.verified,
    latitude: record.latitude ?? point?.latitude ?? null,
    longitude: record.longitude ?? point?.longitude ?? null,
    targetStreetName: record.targetStreetName ?? null,
    landmarkName: record.landmarkName ?? null,
  }
}

function fromRemote(result: SearchResult, query: string): SelectedPlace {
  const parsed = parseAddressText(query)
  const point = pointOf(result.geometry)
  const isReference = result.kind === 'reference'
  return {
    id: isReference && result.targetStreetId ? result.targetStreetId : result.id,
    kind: isReference ? 'street' : result.kind,
    title: isReference && result.targetStreetName ? result.targetStreetName : result.title,
    neighborhoodName: result.neighborhoodName,
    oldNames: result.oldNames,
    usedOldName: result.usedOldName,
    warning: result.warning,
    confidence: result.confidence,
    customerInput: query.trim() || null,
    matchedAlias: isReference ? result.title : result.matchedAlias,
    reference: parsed.reference,
    source: result.source,
    sourceDate: result.sourceDate,
    verified: result.verified,
    latitude: result.latitude ?? point?.latitude ?? null,
    longitude: result.longitude ?? point?.longitude ?? null,
    targetStreetName: result.targetStreetName ?? null,
    landmarkName: result.landmarkName ?? null,
  }
}

