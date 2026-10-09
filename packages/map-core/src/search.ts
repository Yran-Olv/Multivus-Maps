import { normalizeAddress } from './normalize'
import { parseAddressText } from './parse'
import { confidenceOf, presentStreetName } from './present'

export type SearchableAlias = {
  alias: string
  aliasType: string
}

export type SearchableRecord = {
  id: string
  kind: 'street' | 'place' | 'landmark' | 'reference' | 'neighborhood'
  title: string
  streetType?: string | null
  neighborhoodName?: string | null
  verified: boolean
  source?: string | null
  sourceDate?: string | null
  latitude?: number | null
  longitude?: number | null
  coordinatesVerified?: boolean
  coordinateType?: 'address-point' | 'landmark' | 'place' | 'street' | 'street-access' | 'estimated' | null
  coordinateSource?: string | null
  coordinateSourceDate?: string | null
  numberVerified?: boolean
  geometry?: unknown | null
  aliases?: SearchableAlias[]
  extraText?: string | null
  confidence?: number | null
  importanceScore?: number | null
  category?: string | null
  targetStreetId?: string | null
  targetStreetName?: string | null
  landmarkId?: string | null
  landmarkName?: string | null
  relationType?: string | null
  probableRadiusMeters?: number | null
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
  importanceScore: number
  probableRadiusMeters?: number | null
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

export function deduplicateEntities<T extends { id: string; kind: string; score?: number | null; title?: string }>(items: T[]): T[] {
  const entities = new Map<string, T>()
  for (const item of items) {
    const idKey = `${item.kind}:${item.id}`
    const existing = entities.get(idKey)
    if (!existing || (item.score ?? 0) > (existing.score ?? 0)) {
      entities.set(idKey, item)
    }
  }

  const byTitle = new Map<string, T>()
  for (const item of entities.values()) {
    const normTitle = (item.title ?? '').trim().toLowerCase()
    const titleKey = `${item.kind}:${normTitle}`
    const existing = byTitle.get(titleKey)
    if (!existing || (item.score ?? 0) > (existing.score ?? 0)) {
      byTitle.set(titleKey, item)
    }
  }

  return [...byTitle.values()]
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

const CATEGORY_LABELS: Record<string, string> = {
  supermercado: '🛒 Supermercado',
  farmacia: '💊 Farmácia',
  posto: '⛽ Posto de Combustível',
  padaria: '🥖 Padaria & Café',
  materiais_construcao: '🧱 Materiais de Construção',
  hospital: '🏥 Saúde & Hospital',
  rodoviaria: '🚌 Terminal Rodoviário',
  orgao_publico: '🏛️ Órgão Público',
  banco: '🏦 Banco / Cooperativa',
  igreja: '⛪ Igreja / Templo',
  praca: '🌳 Praça / Referência',
  comercio: '🏪 Comércio Local',
  oficina: '🔧 Oficina Mecânica',
  outro: '📍 Ponto de Referência',
}

function spatialRelationPrefix(value: string): string | null {
  return value.match(/^(?:ao lado|em frente|no trevo|atras|perto|depois|antes|vizinho)\b/)?.[0] ?? null
}

export function searchRecords(
  records: SearchableRecord[],
  rawQuery: string,
  limit = 20,
): RankedHit[] {
  const parsed = parseAddressText(rawQuery)
  const query = normalizeAddress(parsed.streetQuery)
  const originalQuery = normalizeAddress(rawQuery)
  const queryRelation = spatialRelationPrefix(normalizeAddress(parsed.reference ?? ''))
  if (query.length < 2) return []

  const stripped = query
    .replace(/\b(?:perto\s+d[aeo]s?|proxim[oa]\s+a[os]?|em\s+frente\s+(?:a[os]?|d[aeo]s?)?|ao\s+lado\s+(?:d[aeo]s?)?|atr[aá]s\s+d[aeo]s?|depois\s+d[aeo]s?|antes\s+d[aeo]s?|no\s+trevo\s+d[aeo]s?|casa\s+[a-zA-Z0-9]+\s*|esquina\s+com)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const targetQuery = stripped.length >= 2 ? stripped : query

  const hits: RankedHit[] = []
  for (const record of records) {
    const normTitle = normalizeAddress(record.title)
    const normExtra = normalizeAddress(record.extraText ?? '')
    const normNeigh = record.neighborhoodName ? normalizeAddress(record.neighborhoodName) : ''

    const isSpatialReference = record.kind === 'reference' &&
      /^(?:atras|perto|ao lado|em frente|depois|antes|no trevo|vizinho)\b/.test(normTitle)
    if (isSpatialReference && (!queryRelation || spatialRelationPrefix(normTitle) !== queryRelation)) continue

    const nameScore = record.kind === 'reference'
      ? Math.max(scoreText(originalQuery, normTitle), scoreText(query, normTitle))
      : Math.max(
          scoreText(query, normTitle),
          scoreText(targetQuery, normTitle),
          scoreText(query, normExtra),
          scoreText(targetQuery, normExtra),
          normNeigh ? Math.max(scoreText(query, normNeigh), scoreText(targetQuery, normNeigh)) - 8 : 0,
        )

    let aliasScore = 0
    let matchedAlias: string | null = null
    let matchedAliasType: string | null = null
    for (const alias of record.aliases ?? []) {
      const normAlias = normalizeAddress(alias.alias)
      const current = record.kind === 'reference'
        ? scoreText(originalQuery, normAlias)
        : Math.max(scoreText(query, normAlias), scoreText(targetQuery, normAlias))
      if (current > aliasScore) {
        aliasScore = current
        matchedAlias = alias.alias
        matchedAliasType = alias.aliasType
      }
    }
    const rawScore = Math.max(nameScore, aliasScore)
    if (rawScore < (record.kind === 'reference' ? 55 : 40)) continue

    const importance = record.importanceScore ?? (record.kind === 'landmark' ? 70 : 60)
    // Pondera a pontuação pelo ranking de importância (estabelecimentos de referência recebem impulso no topo)
    const score = Math.min(100, Math.round(rawScore + (importance / 100) * 10))

    const aliasWins = aliasScore >= nameScore && aliasScore > 0

    if (record.kind === 'landmark') {
      const catLabel = (record.category && CATEGORY_LABELS[record.category]) || '📍 Ponto de Referência'
      const badge = importance >= 90 ? ' · Destaque' : ''
      hits.push({
        ...record,
        score,
        importanceScore: importance,
        matchedAlias: aliasWins ? matchedAlias : null,
        matchedAliasType: aliasWins ? matchedAliasType : null,
        subtitle: record.neighborhoodName
          ? `${catLabel} · Bairro ${record.neighborhoodName}${badge}`
          : `${catLabel}${badge}`,
        warning: null,
        usedOldName: false,
        oldNames: [],
        confidence: record.confidence ?? (record.verified ? 100 : 70),
      })
      continue
    }

    if (record.kind === 'reference') {
      hits.push({
        ...record,
        score: Math.max(score, 78), // referências coloquiais exatas têm alta relevância para entregadores
        importanceScore: importance,
        matchedAlias: aliasWins ? matchedAlias : null,
        matchedAliasType: aliasWins ? matchedAliasType : null,
        subtitle: record.targetStreetName ? `🔗 Referência popular → ${record.targetStreetName}` : '🔗 Referência de entrega',
        warning: `Expressão popular utilizada por entregadores e moradores de Santa Juliana.`,
        usedOldName: false,
        oldNames: [],
        confidence: record.confidence ?? 85,
      })
      continue
    }

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
      importanceScore: importance,
      matchedAlias: described.matchedAlias,
      matchedAliasType: aliasWins ? matchedAliasType : null,
      subtitle: described.subtitle ?? (aliasWins ? null : record.neighborhoodName ?? null),
      warning: described.warning,
      usedOldName: described.usedOldName,
      oldNames: described.oldNames,
      confidence: described.confidence,
    })
  }

  const ranked = deduplicateEntities(hits)
  const prefersReference = parsed.reference !== null
  ranked.sort((a, b) =>
    b.score - a.score ||
    (prefersReference ? Number(b.kind === 'reference') - Number(a.kind === 'reference') : 0) ||
    (b.importanceScore ?? 0) - (a.importanceScore ?? 0) ||
    a.title.localeCompare(b.title, 'pt-BR'),
  )
  return ranked.slice(0, limit)
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
