import { normalizeAddress } from './normalize'
import { parseAddressText } from './parse'
import { confidenceOf, presentStreetName } from './present'

export type SearchableAlias = {
  alias: string
  aliasType: string
}

export type SearchableRecord = {
  id: string
  kind: 'street' | 'place' | 'neighborhood'
  title: string
  streetType?: string | null
  neighborhoodName?: string | null
  verified: boolean
  source?: string | null
  sourceDate?: string | null
  latitude?: number | null
  longitude?: number | null
  geometry?: unknown | null
  aliases?: SearchableAlias[]
  extraText?: string | null
  confidence?: number | null
}

export type RankedHit = SearchableRecord & {
  score: number
  matchedAlias: string | null
  matchedAliasType: string | null
  subtitle: string | null
  warning: string | null
  usedOldName: boolean
  oldNames: string[]
  confidence: number
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value}  `
  const grams = new Set<string>()
  for (let i = 0; i < padded.length - 2; i += 1) {
    grams.add(padded.slice(i, i + 3))
  }
  return grams
}

export function trigramSimilarity(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1
  const a = trigrams(left)
  const b = trigrams(right)
  let shared = 0
  for (const gram of a) {
    if (b.has(gram)) shared += 1
  }
  return (2 * shared) / (a.size + b.size)
}

export function levenshtein(left: string, right: string): number {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let previous = i - 1
    row[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j] ?? 0
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      row[j] = Math.min((row[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, previous + cost)
      previous = current
    }
  }
  return row[right.length] ?? 0
}

function scoreText(query: string, candidate: string): number {
  if (!candidate) return 0
  if (candidate === query) return 100
  if (candidate.startsWith(query)) return 84
  const covered = tokenScore(query, candidate)
  if (candidate.includes(query)) return Math.max(74, covered)
  if (covered) return covered
  const distance = levenshtein(query, candidate)
  const limit = query.length <= 5 ? 1 : 2
  if (distance <= limit && Math.abs(query.length - candidate.length) <= 2) {
    return 64 - distance * 4
  }
  const similarity = trigramSimilarity(query, candidate)
  if (similarity >= 0.45) return Math.round(similarity * 60)
  return 0
}

function tokenScore(query: string, candidate: string): number {
  const tokens = query.split(' ').filter((token) => token.length >= 3)
  if (tokens.length < 2) return 0
  return tokens.every((token) => candidate.includes(token)) ? 78 : 0
}

export function searchRecords(
  records: SearchableRecord[],
  rawQuery: string,
  limit = 20,
): RankedHit[] {
  const query = normalizeAddress(parseAddressText(rawQuery).streetQuery)
  if (query.length < 2) return []

  const hits: RankedHit[] = []
  for (const record of records) {
    const nameScore = Math.max(
      scoreText(query, normalizeAddress(record.title)),
      scoreText(query, normalizeAddress(record.extraText ?? '')),
      record.neighborhoodName ? scoreText(query, normalizeAddress(record.neighborhoodName)) - 8 : 0,
    )
    let aliasScore = 0
    let matchedAlias: string | null = null
    let matchedAliasType: string | null = null
    for (const alias of record.aliases ?? []) {
      const current = scoreText(query, normalizeAddress(alias.alias))
      if (current > aliasScore) {
        aliasScore = current
        matchedAlias = alias.alias
        matchedAliasType = alias.aliasType
      }
    }
    const score = Math.max(nameScore, aliasScore)
    if (score < 40) continue
    const aliasWins = aliasScore >= nameScore && aliasScore > 0
    const described = describeStreet({
      title: record.title,
      streetType: record.streetType,
      aliases: record.aliases,
      verified: record.verified,
      confidence: record.confidence,
      source: record.source,
      neighborhoodName: record.neighborhoodName,
      matchedAlias: aliasWins ? matchedAlias : null,
      matchedAliasType: aliasWins ? matchedAliasType : null,
    })
    hits.push({
      ...record,
      score,
      matchedAlias: described.matchedAlias,
      matchedAliasType: aliasWins ? matchedAliasType : null,
      subtitle: described.subtitle ?? (aliasWins ? null : record.neighborhoodName ?? null),
      warning: described.warning,
      usedOldName: described.usedOldName,
      oldNames: described.oldNames,
      confidence: described.confidence,
    })
  }

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'pt-BR'))
  return hits.slice(0, limit)
}

export function describeStreet(input: {
  title: string
  streetType?: string | null
  aliases?: SearchableAlias[]
  verified: boolean
  confidence?: number | null
  source?: string | null
  neighborhoodName?: string | null
  matchedAlias: string | null
  matchedAliasType: string | null
}): {
  subtitle: string | null
  warning: string | null
  usedOldName: boolean
  oldNames: string[]
  matchedAlias: string | null
  confidence: number
} {
  const oldNames = (input.aliases ?? [])
    .filter((alias) => alias.aliasType === 'OLD_NAME')
    .map((alias) => presentStreetName(alias.alias, input.streetType))
  const confidence = confidenceOf(input)
  const usedOldName = input.matchedAliasType === 'OLD_NAME' && Boolean(input.matchedAlias)
  if (usedOldName && input.matchedAlias) {
    const shown = presentStreetName(input.matchedAlias, input.streetType)
    const warning =
      confidence >= 100
        ? `O endereço usa um nome antigo. O nome atual desta rua é ${input.title}. Alguns moradores ainda utilizam o nome antigo.`
        : `O endereço usa um nome antigo. O mapa oficial registra o nome atual como ${input.title}. Essa troca ainda não foi conferida no local.`
    return {
      subtitle: `🔄 Antiga: ${shown}`,
      warning,
      usedOldName: true,
      oldNames,
      matchedAlias: shown,
      confidence,
    }
  }
  if (input.matchedAliasType === 'POPULAR_NAME' && input.matchedAlias) {
    return {
      subtitle: `Nome popular: ${input.matchedAlias}`,
      warning: null,
      usedOldName: false,
      oldNames,
      matchedAlias: input.matchedAlias,
      confidence,
    }
  }
  if (oldNames.length > 0) {
    return {
      subtitle: `Também conhecida como ${oldNames.join(', ')}`,
      warning: null,
      usedOldName: false,
      oldNames,
      matchedAlias: null,
      confidence,
    }
  }
  return {
    subtitle: input.neighborhoodName ?? null,
    warning: null,
    usedOldName: false,
    oldNames,
    matchedAlias: null,
    confidence,
  }
}
