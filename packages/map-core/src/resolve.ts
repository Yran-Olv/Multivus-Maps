import { parseAddressText, type ParsedAddress } from './parse'
import { presentStreetName } from './present'
import { searchRecords, type RankedHit, type SearchableRecord } from './search'

export type AddressResolution = ParsedAddress & {
  hit: RankedHit | null
  officialName: string | null
  number: string | null
  oldNames: string[]
  matchedAlias: string | null
  matchedReference: string | null
  matchedLandmark: string | null
  usedOldName: boolean
  warning: string | null
  confidence: number
  shareText: string
}

export function resolveAddress(records: SearchableRecord[], raw: string): AddressResolution {
  const parsed = parseAddressText(raw)
  const hits = searchRecords(records, parsed.streetQuery, 3)
  const topHit = hits[0] ?? null

  let resolvedStreetHit: RankedHit | null = null
  let matchedReference: string | null = null
  let matchedLandmark: string | null = null

  if (topHit?.kind === 'reference' && topHit.targetStreetId) {
    const street = records.find((r) => r.id === topHit.targetStreetId && r.kind === 'street')
    if (street) {
      const [streetRanked] = searchRecords([street], street.title, 1)
      resolvedStreetHit = streetRanked ?? null
      matchedReference = topHit.title
    }
  } else if (topHit?.kind === 'landmark' && topHit.targetStreetId) {
    const street = records.find((r) => r.id === topHit.targetStreetId && r.kind === 'street')
    if (street) {
      const [streetRanked] = searchRecords([street], street.title, 1)
      resolvedStreetHit = streetRanked ?? null
      matchedLandmark = topHit.title
    } else {
      resolvedStreetHit = topHit
    }
  } else if (topHit?.kind === 'street') {
    resolvedStreetHit = topHit
  } else if (topHit) {
    resolvedStreetHit = topHit
  }

  // Se houver texto de referência (ex: "perto da igreja"), verifica se aponta para algum landmark conhecido
  if (parsed.reference) {
    const cleanedRef = parsed.reference
      .replace(/\b(?:perto\s+d[aeo]s?|proxim[oa]\s+a[os]?|em\s+frente\s+(?:a[os]?|d[aeo]s?)?|ao\s+lado\s+(?:d[aeo]s?)?|atr[aá]s\s+d[aeo]s?|casa\s+[a-zA-ZÀ-ÿ0-9]+\s*|esquina\s+com)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const targetQuery = cleanedRef.length >= 2 ? cleanedRef : parsed.reference
    const landmarkHits = searchRecords(
      records.filter((r) => r.kind === 'landmark'),
      targetQuery,
      1,
    )
    if (landmarkHits[0] && landmarkHits[0].score >= 40) {
      matchedLandmark = landmarkHits[0].title
    }
  }


  const officialName = resolvedStreetHit?.title ?? null
  const oldNames = resolvedStreetHit?.oldNames ?? []
  const warning = matchedReference
    ? `Referência popular identificada: "${matchedReference}". Esta expressão aponta para ${officialName}.`
    : resolvedStreetHit?.warning ?? null

  return {
    ...parsed,
    hit: resolvedStreetHit,
    officialName,
    number: parsed.number,
    oldNames,
    matchedAlias: resolvedStreetHit?.matchedAlias ? presentStreetName(resolvedStreetHit.matchedAlias, resolvedStreetHit.streetType) : null,
    matchedReference,
    matchedLandmark,
    usedOldName: resolvedStreetHit?.usedOldName ?? false,
    warning,
    confidence: resolvedStreetHit?.confidence ?? 0,
    shareText: formatShareText({
      officialName,
      number: parsed.number,
      oldNames,
      neighborhoodName: resolvedStreetHit?.neighborhoodName,
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
