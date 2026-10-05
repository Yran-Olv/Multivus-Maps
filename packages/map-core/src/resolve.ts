import { parseAddressText, type ParsedAddress } from './parse'
import { presentStreetName } from './present'
import { searchRecords, type RankedHit, type SearchableRecord } from './search'

export type AddressResolution = ParsedAddress & {
  hit: RankedHit | null
  officialName: string | null
  number: string | null
  oldNames: string[]
  matchedAlias: string | null
  usedOldName: boolean
  warning: string | null
  confidence: number
  shareText: string
}

export function resolveAddress(records: SearchableRecord[], raw: string): AddressResolution {
  const parsed = parseAddressText(raw)
  const [hit] = searchRecords(
    records.filter((record) => record.kind === 'street'),
    parsed.streetQuery,
    1,
  )
  const officialName = hit?.title ?? null
  const oldNames = hit?.oldNames ?? []
  return {
    ...parsed,
    hit: hit ?? null,
    officialName,
    number: parsed.number,
    oldNames,
    matchedAlias: hit?.matchedAlias ? presentStreetName(hit.matchedAlias, hit.streetType) : null,
    usedOldName: hit?.usedOldName ?? false,
    warning: hit?.warning ?? null,
    confidence: hit?.confidence ?? 0,
    shareText: formatShareText({
      officialName,
      number: parsed.number,
      oldNames,
      neighborhoodName: hit?.neighborhoodName,
    }),
  }
}

export function formatShareText(input: {
  officialName: string | null
  number?: string | null
  oldNames?: string[]
  neighborhoodName?: string | null
}): string {
  const place = [input.officialName, input.number].filter(Boolean).join(', ')
  const lines = [`📍 ${place || 'Santa Juliana'}`]
  const oldName = input.oldNames?.[0]
  if (oldName) lines.push(`Antiga ${oldName}`)
  if (input.neighborhoodName) lines.push(`Bairro ${input.neighborhoodName}`)
  lines.push('Santa Juliana - MG')
  return lines.join('\n')
}
