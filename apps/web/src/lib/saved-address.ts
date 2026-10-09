import type { SavedDestination } from '@multivus/shared'
import { parseAddressText, searchRecords, type SearchableRecord } from '@multivus/map-core'

export type SavedAddressRecord = {
  id: string
  title?: string
  label?: string
  query?: string
  streetId?: string | null
  placeId?: string | null
  entityId?: string
  entityKind?: SavedDestination['kind']
  number?: string | null
  customerInput?: string | null
  matchedAlias?: string | null
  latitude?: number | null
  longitude?: number | null
  destination?: SavedDestination
}

export function restoreSavedAddress(
  entry: SavedAddressRecord,
  records: SearchableRecord[],
): { destination: SavedDestination; number: string } {
  const snapshot = entry.destination
  const id = entry.entityId ?? snapshot?.id ?? entry.streetId ?? entry.placeId ?? entry.id
  const kind =
    entry.entityKind ??
    snapshot?.kind ??
    (entry.placeId ? 'place' : 'street')
  const rawInput =
    entry.customerInput ??
    entry.query ??
    snapshot?.customerInput ??
    entry.label ??
    entry.title ??
    ''
  const parsed = parseAddressText(rawInput)
  const number = entry.number ?? parsed.number ?? ''
  const record = records.find((candidate) => candidate.id === id && candidate.kind === kind)

  if (snapshot) {
    const ranked = record ? searchRecords([record], rawInput || record.title, 1)[0] : null
    return {
      number,
      destination: {
        ...snapshot,
        title: record?.title ?? snapshot.title,
        neighborhoodName: record?.neighborhoodName ?? snapshot.neighborhoodName,
        oldNames: ranked?.oldNames ?? snapshot.oldNames,
        usedOldName: ranked?.usedOldName ?? snapshot.usedOldName,
        customerInput: entry.customerInput ?? snapshot.customerInput,
        matchedAlias: entry.matchedAlias ?? snapshot.matchedAlias,
        latitude: entry.latitude ?? snapshot.latitude ?? record?.latitude ?? null,
        longitude: entry.longitude ?? snapshot.longitude ?? record?.longitude ?? null,
      },
    }
  }

  if (record) {
    const ranked = searchRecords([record], rawInput || record.title, 1)[0]
    const isReference = record.kind === 'reference'
    const targetStreetId = record.targetStreetId
    const targetStreet = isReference && targetStreetId
      ? records.find((candidate) => candidate.id === targetStreetId && candidate.kind === 'street')
      : null
    return {
      number,
      destination: {
        id: targetStreet?.id ?? record.id,
        kind: targetStreet ? 'street' : record.kind,
        title: targetStreet?.title ?? record.title,
        neighborhoodName: record.neighborhoodName ?? targetStreet?.neighborhoodName ?? null,
        oldNames: ranked?.oldNames ?? [],
        usedOldName: ranked?.usedOldName ?? false,
        warning: ranked?.warning ?? null,
        confidence: ranked?.confidence ?? record.confidence ?? 0,
        customerInput: rawInput || null,
        matchedAlias: isReference ? record.title : ranked?.matchedAlias ?? entry.matchedAlias ?? null,
        reference: parsed.reference,
        source: record.source ?? targetStreet?.source ?? null,
        sourceDate: record.sourceDate ?? targetStreet?.sourceDate ?? null,
        verified: record.verified,
        latitude: record.latitude ?? targetStreet?.latitude ?? null,
        longitude: record.longitude ?? targetStreet?.longitude ?? null,
        coordinatesVerified: record.coordinatesVerified ?? false,
        coordinateType: record.coordinateType ?? null,
        coordinateSource: record.coordinateSource ?? null,
        coordinateSourceDate: record.coordinateSourceDate ?? null,
        numberVerified: record.numberVerified ?? false,
        targetStreetName: record.targetStreetName ?? null,
        landmarkName: record.landmarkName ?? null,
        probableRadiusMeters: record.probableRadiusMeters ?? null,
        importanceScore: record.importanceScore ?? null,
        category: record.category ?? null,
      },
    }
  }

  return {
    number,
    destination: {
      id,
      kind,
      title: entry.title ?? entry.label ?? rawInput,
      neighborhoodName: null,
      oldNames: [],
      usedOldName: false,
      warning: null,
      confidence: 0,
      customerInput: rawInput || null,
      matchedAlias: entry.matchedAlias ?? null,
      reference: parsed.reference,
      source: null,
      sourceDate: null,
      verified: false,
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null,
    },
  }
}
