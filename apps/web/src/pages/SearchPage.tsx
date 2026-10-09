import { deduplicateEntities, parseAddressText, searchRecords, type RankedHit, type SearchableRecord } from '@multivus/map-core'
import type { SearchResult } from '@multivus/shared'
import { AddressSearch, type AddressHit } from '@multivus/ui'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useCatalog } from '../hooks/use-catalog'
import { api } from '../lib/api'
import { pointOf } from '../lib/catalog'
import { db } from '../lib/db'
import { restoreSavedAddress } from '../lib/saved-address'
import { useUi, type SelectedPlace } from '../stores/ui'

export function SearchPage() {
  const navigate = useNavigate()
  const catalog = useCatalog()
  const online = useUi((state) => state.online)
  const [query, setQuery] = useState('')
  const [recents, setRecents] = useState<AddressHit[]>([])
  const [favorites, setFavorites] = useState<AddressHit[]>([])

  useEffect(() => {
    void db.recents.orderBy('createdAt').reverse().limit(25).toArray().then((rows) => {
      const seen = new Set<string>()
      const uniqueHits: AddressHit[] = []
      for (const row of rows) {
        const dest = row.destination
        const key = dest?.id ?? row.entityId ?? `${row.entityKind || 'unknown'}:${(dest?.title ?? row.title).toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        uniqueHits.push({
          id: row.id,
          title: dest?.title ?? row.title,
          subtitle: dest?.usedOldName && dest.customerInput
            ? `🔄 Antiga: ${dest.matchedAlias ?? dest.customerInput}`
            : (dest?.customerInput && dest.customerInput !== (dest.title ?? row.title) ? dest.customerInput : row.query),
          entityId: row.entityId ?? dest?.id ?? row.streetId ?? row.id,
          entityKind: row.entityKind ?? dest?.kind,
          number: row.number ?? dest?.resolvedNumber,
          customerInput: row.customerInput ?? dest?.customerInput ?? row.query,
          query: row.query,
          matchedAlias: row.matchedAlias ?? dest?.matchedAlias,
          destination: dest,
          latitude: dest?.latitude ?? null,
          longitude: dest?.longitude ?? null,
          source: dest?.source ?? null,
          sourceDate: dest?.sourceDate ?? null,
          oldNames: dest?.oldNames ?? [],
          usedOldName: dest?.usedOldName ?? false,
          verified: dest?.verified ?? false,
          confidence: dest?.confidence ?? 0,
          coordinatesVerified: dest?.coordinatesVerified ?? false,
          coordinateType: dest?.coordinateType ?? null,
          numberVerified: dest?.numberVerified ?? false,
          resolvedNumber: dest?.resolvedNumber ?? null,
        })
      }
      setRecents(uniqueHits.slice(0, 8))
    })

    void db.favorites.orderBy('createdAt').reverse().limit(25).toArray().then((rows) => {
      const seen = new Set<string>()
      const uniqueHits: AddressHit[] = []
      for (const row of rows) {
        const dest = row.destination
        const key = dest?.id ?? row.entityId ?? `${row.entityKind || 'unknown'}:${(dest?.title ?? row.label).toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        uniqueHits.push({
          id: row.id,
          title: dest?.title ?? row.label,
          subtitle: dest?.customerInput ?? 'Favorito',
          entityId: row.entityId ?? dest?.id ?? row.streetId ?? row.placeId ?? row.id,
          entityKind: row.entityKind ?? dest?.kind ?? (row.placeId ? 'place' : 'street'),
          number: row.number ?? dest?.resolvedNumber,
          customerInput: row.customerInput ?? dest?.customerInput ?? row.label,
          matchedAlias: row.matchedAlias ?? dest?.matchedAlias,
          destination: dest,
          latitude: dest?.latitude ?? null,
          longitude: dest?.longitude ?? null,
          source: dest?.source ?? null,
          sourceDate: dest?.sourceDate ?? null,
          oldNames: dest?.oldNames ?? [],
          usedOldName: dest?.usedOldName ?? false,
          verified: dest?.verified ?? false,
          confidence: dest?.confidence ?? 0,
          coordinatesVerified: dest?.coordinatesVerified ?? false,
          coordinateType: dest?.coordinateType ?? null,
          numberVerified: dest?.numberVerified ?? false,
          resolvedNumber: dest?.resolvedNumber ?? null,
        })
      }
      setFavorites(uniqueHits.slice(0, 8))
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
    ? deduplicateEntities(remote.data.results).map(toHit)
    : localHits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        subtitle: hit.subtitle,
        entityKind: hit.kind,
        warning: hit.warning,
        meta: 'Santa Juliana - MG',
        oldNames: hit.oldNames,
        usedOldName: hit.usedOldName,
        matchedAlias: hit.matchedAlias,
        neighborhoodName: hit.neighborhoodName,
        confidence: hit.confidence,
        verified: hit.verified,
        latitude: hit.latitude,
        longitude: hit.longitude,
        source: hit.source,
        sourceDate: hit.sourceDate,
        coordinatesVerified: hit.coordinatesVerified,
        coordinateType: hit.coordinateType,
        coordinateSource: hit.coordinateSource,
        coordinateSourceDate: hit.coordinateSourceDate,
        numberVerified: hit.numberVerified,
        customerInput: query,
      }))

  async function select(hit: AddressHit) {
    const selectionQuery = hit.customerInput ?? hit.query ?? query
    const parsed = parseAddressText(selectionQuery || hit.title)
    const remoteHit = remote.data?.results.find((item) => item.id === hit.id)
    const localHit = localHits.find((item) => item.id === hit.id)
    const record = records.find((item) => item.id === hit.id)
    const savedSelection = (hit.entityId || hit.destination)
      ? restoreSavedAddress({
          id: hit.id,
          entityId: hit.entityId ?? hit.destination?.id,
          entityKind: hit.entityKind ?? hit.destination?.kind,
          number: hit.number ?? hit.destination?.resolvedNumber,
          query: selectionQuery,
          customerInput: hit.customerInput ?? hit.destination?.customerInput,
          matchedAlias: hit.matchedAlias ?? hit.destination?.matchedAlias,
          destination: hit.destination,
          title: hit.title,
          latitude: hit.latitude ?? hit.destination?.latitude,
          longitude: hit.longitude ?? hit.destination?.longitude,
        }, records)
      : null

    const selected = savedSelection?.destination ?? (remoteHit
      ? fromRemote(remoteHit, selectionQuery)
      : localHit
        ? fromRanked(localHit, selectionQuery, records)
        : record
          ? fromRecord(record, selectionQuery, records)
          : hit.destination ?? null)

    const number = savedSelection?.number ?? parsed.number ?? hit.number ?? ''
    if (selected) {
      useUi.getState().setSelected(selected, number)
      if (selected.latitude === null || selected.longitude === null) {
        useUi.getState().setNotice('Este destino não possui coordenadas confirmadas. Você pode informar uma correção no mapa.')
      }
    }

    const recentId = selected?.id ? `recent:${selected.kind}:${selected.id}` : crypto.randomUUID()
    await db.recents.put({
      id: recentId,
      query: selectionQuery || hit.title,
      title: selected?.title ?? hit.title,
      streetId: selected?.kind === 'street' ? selected.id : null,
      entityId: selected?.id ?? hit.entityId ?? hit.id,
      entityKind: selected?.kind ?? hit.entityKind,
      number,
      destination: selected ?? hit.destination,
      customerInput: selected?.customerInput ?? selectionQuery,
      matchedAlias: selected?.matchedAlias ?? hit.matchedAlias,
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

export function toRecords(catalog: {
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
    ...(catalog.localReferences ?? []).map((ref) => {
      const targetStreet = ref.targetStreetId
        ? catalog.streets?.find((s) => s.id === ref.targetStreetId)
        : (ref.targetStreetName ? catalog.streets?.find((s) => s.officialName === ref.targetStreetName) : null)
      const targetLandmark = ref.landmarkId
        ? catalog.landmarks?.find((l) => l.id === ref.landmarkId)
        : (ref.landmarkName ? catalog.landmarks?.find((l) => l.name === ref.landmarkName) : null)
      const streetPoint = pointOf(targetStreet?.geometry)
      const latitude = targetLandmark?.latitude ?? streetPoint?.latitude ?? null
      const longitude = targetLandmark?.longitude ?? streetPoint?.longitude ?? null
      return {
        id: ref.id,
        kind: 'reference' as const,
        title: ref.popularPhrase,
        relationType: ref.relationType,
        targetStreetId: ref.targetStreetId ?? targetStreet?.id ?? null,
        targetStreetName: ref.targetStreetName ?? targetStreet?.officialName ?? null,
        landmarkId: ref.landmarkId ?? targetLandmark?.id ?? null,
        landmarkName: ref.landmarkName ?? targetLandmark?.name ?? null,
        verified: ref.verified,
        confidence: ref.confidence,
        extraText: ref.description,
        latitude,
        longitude,
        coordinatesVerified: Boolean(latitude !== null && longitude !== null),
        coordinateType: (targetLandmark?.latitude ? 'landmark' : streetPoint ? 'street-access' : null) as 'address-point' | 'landmark' | 'place' | 'street' | 'street-access' | 'estimated' | null,
      }
    }),
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
    entityKind: result.kind,
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
    latitude: result.latitude,
    longitude: result.longitude,
    source: result.source,
    sourceDate: result.sourceDate,
    number: result.number,
    coordinatesVerified: result.coordinatesVerified ?? false,
    coordinateType: result.coordinateType ?? null,
    coordinateSource: result.coordinateSource ?? null,
    coordinateSourceDate: result.coordinateSourceDate ?? null,
    numberVerified: result.numberVerified ?? false,
  }
}

function resolveCanonicalReference(item: {
  kind: string
  title: string
  targetStreetId?: string | null
  targetStreetName?: string | null
  landmarkId?: string | null
  landmarkName?: string | null
}): { id: string; kind: 'street' | 'landmark'; title: string; reference: string } | null {
  if (item.kind !== 'reference') return null
  if (item.targetStreetName) {
    return {
      id: item.targetStreetId ?? `street:${item.targetStreetName}`,
      kind: 'street',
      title: item.targetStreetName,
      reference: item.title,
    }
  }
  if (item.landmarkName) {
    return {
      id: item.landmarkId ?? `landmark:${item.landmarkName}`,
      kind: 'landmark',
      title: item.landmarkName,
      reference: item.title,
    }
  }
  return null
}

function fromRanked(hit: RankedHit, query: string, records: SearchableRecord[]): SelectedPlace {
  const parsed = parseAddressText(query)
  const point = pointOf(hit.geometry)
  const canonical = resolveCanonicalReference(hit)
  const targetRecord = canonical
    ? records.find((r) => r.id === canonical.id || r.title.toLowerCase() === canonical.title.toLowerCase())
    : null
  const targetPoint = targetRecord ? pointOf(targetRecord.geometry) : null

  const latitude = hit.latitude ?? targetRecord?.latitude ?? targetPoint?.latitude ?? point?.latitude ?? null
  const longitude = hit.longitude ?? targetRecord?.longitude ?? targetPoint?.longitude ?? point?.longitude ?? null
  const coordType = hit.coordinateType ?? targetRecord?.coordinateType ?? point?.coordinateType ?? (latitude !== null ? (canonical?.kind === 'landmark' ? 'landmark' : 'street-access') : null)

  return {
    id: canonical?.id ?? hit.id,
    kind: canonical?.kind ?? hit.kind,
    title: canonical?.title ?? hit.title,
    neighborhoodName: hit.neighborhoodName ?? targetRecord?.neighborhoodName ?? null,
    oldNames: targetRecord?.aliases?.filter((a) => a.aliasType === 'OLD_NAME').map((a) => a.alias) ?? hit.oldNames,
    usedOldName: hit.usedOldName,
    warning: hit.warning,
    confidence: hit.confidence,
    customerInput: query.trim() || null,
    matchedAlias: canonical ? hit.title : hit.matchedAlias,
    reference: canonical ? hit.title : (hit.kind === 'reference' ? (hit.extraText ?? parsed.reference) : parsed.reference),
    source: hit.source ?? targetRecord?.source ?? null,
    sourceDate: hit.sourceDate ?? targetRecord?.sourceDate ?? null,
    verified: targetRecord?.verified ?? hit.verified,
    latitude,
    longitude,
    resolvedNumber: null,
    coordinatesVerified: Boolean(latitude !== null && longitude !== null),
    coordinateType: coordType,
    coordinateSource: hit.coordinateSource ?? targetRecord?.coordinateSource ?? null,
    coordinateSourceDate: hit.coordinateSourceDate ?? null,
    numberVerified: hit.numberVerified ?? false,
    targetStreetName: hit.targetStreetName ?? canonical?.title ?? null,
    landmarkName: hit.landmarkName ?? (canonical?.kind === 'landmark' ? canonical.title : null),
  }
}

function fromRecord(record: SearchableRecord, query: string, records: SearchableRecord[]): SelectedPlace {
  const parsed = parseAddressText(query)
  const point = pointOf(record.geometry)
  const canonical = resolveCanonicalReference(record)
  const targetRecord = canonical
    ? records.find((r) => r.id === canonical.id || r.title.toLowerCase() === canonical.title.toLowerCase())
    : null
  const targetPoint = targetRecord ? pointOf(targetRecord.geometry) : null

  const latitude = record.latitude ?? targetRecord?.latitude ?? targetPoint?.latitude ?? point?.latitude ?? null
  const longitude = record.longitude ?? targetRecord?.longitude ?? targetPoint?.longitude ?? point?.longitude ?? null
  const coordType = record.coordinateType ?? targetRecord?.coordinateType ?? point?.coordinateType ?? (latitude !== null ? (canonical?.kind === 'landmark' ? 'landmark' : 'street-access') : null)

  return {
    id: canonical?.id ?? record.id,
    kind: canonical?.kind ?? record.kind,
    title: canonical?.title ?? record.title,
    neighborhoodName: record.neighborhoodName ?? targetRecord?.neighborhoodName ?? null,
    oldNames: targetRecord?.aliases?.filter((a) => a.aliasType === 'OLD_NAME').map((a) => a.alias) ?? (record.aliases?.filter((a) => a.aliasType === 'OLD_NAME').map((a) => a.alias) ?? []),
    usedOldName: false,
    warning: null,
    confidence: record.confidence ?? (record.verified ? 100 : record.source ? 70 : 0),
    customerInput: query.trim() || null,
    matchedAlias: canonical ? record.title : null,
    reference: canonical ? record.title : parsed.reference,
    source: record.source ?? targetRecord?.source ?? null,
    sourceDate: record.sourceDate ?? targetRecord?.sourceDate ?? null,
    verified: record.verified,
    latitude,
    longitude,
    resolvedNumber: null,
    coordinatesVerified: Boolean(latitude !== null && longitude !== null),
    coordinateType: coordType,
    coordinateSource: record.coordinateSource ?? targetRecord?.coordinateSource ?? null,
    coordinateSourceDate: record.coordinateSourceDate ?? null,
    numberVerified: record.numberVerified ?? false,
    targetStreetName: record.targetStreetName ?? (canonical?.kind === 'street' ? canonical.title : null),
    landmarkName: record.landmarkName ?? (canonical?.kind === 'landmark' ? canonical.title : null),
  }
}

function fromRemote(result: SearchResult, query: string): SelectedPlace {
  const parsed = parseAddressText(query)
  const point = pointOf(result.geometry)
  const canonical = resolveCanonicalReference(result)

  const latitude = result.latitude ?? point?.latitude ?? null
  const longitude = result.longitude ?? point?.longitude ?? null
  const coordType = result.coordinateType ?? point?.coordinateType ?? (latitude !== null ? (canonical?.kind === 'landmark' ? 'landmark' : 'street-access') : null)

  return {
    id: canonical?.id ?? result.id,
    kind: canonical?.kind ?? result.kind,
    title: canonical?.title ?? result.title,
    neighborhoodName: result.neighborhoodName,
    oldNames: result.oldNames,
    usedOldName: result.usedOldName,
    warning: result.warning,
    confidence: result.confidence,
    customerInput: query.trim() || null,
    matchedAlias: canonical ? result.title : result.matchedAlias,
    reference: canonical ? result.title : parsed.reference,
    source: result.source,
    sourceDate: result.sourceDate,
    verified: result.verified,
    latitude,
    longitude,
    resolvedNumber: result.number ?? null,
    coordinatesVerified: Boolean(latitude !== null && longitude !== null),
    coordinateType: coordType,
    coordinateSource: result.coordinateSource ?? null,
    coordinateSourceDate: result.coordinateSourceDate ?? null,
    numberVerified: result.numberVerified ?? false,
    targetStreetName: result.targetStreetName ?? (canonical?.kind === 'street' ? canonical.title : null),
    landmarkName: result.landmarkName ?? (canonical?.kind === 'landmark' ? canonical.title : null),
  }
}
