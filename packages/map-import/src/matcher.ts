import { levenshtein, normalizeAddress, trigramSimilarity } from '@multivus/map-core'
import type {
  MatchConflict,
  MatchResult,
  MultivusStreetCandidate,
  OsmStreetFeature,
} from './types'

type CandidateScore = {
  candidate: MultivusStreetCandidate
  score: number
  matchedAlias: string | null
  matchedAliasType: string | null
  exactOfficial: boolean
  exactAlias: boolean
  typeMatched: boolean
}

/**
 * Calcula distância aproximada em metros entre dois pontos (Haversine)
 */
function haversineDistance(
  coord1: [number, number],
  coord2: [number, number],
): number {
  const [lon1, lat1] = coord1
  const [lon2, lat2] = coord2
  const R = 6371000 // Raio da Terra em metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Extrai ponto médio de uma geometria
 */
function centroidOf(geometry: unknown): [number, number] | null {
  if (!geometry || typeof geometry !== 'object') return null
  const geom = geometry as { type?: string; coordinates?: unknown }
  if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
    const coords = geom.coordinates as [number, number][]
    if (coords.length === 0) return null
    const mid = coords[Math.floor(coords.length / 2)]
    return mid ? [mid[0], mid[1]] : null
  }
  if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
    const lines = geom.coordinates as [number, number][][]
    if (lines.length === 0 || lines[0]!.length === 0) return null
    const firstLine = lines[0]!
    const mid = firstLine[Math.floor(firstLine.length / 2)]
    return mid ? [mid[0], mid[1]] : null
  }
  return null
}

/**
 * Calcula a similaridade textual entre duas cadeias
 */
function scoreStringSimilarity(source: string, target: string): number {
  if (!source || !target) return 0
  if (source === target) return 100
  if (target.startsWith(source) || source.startsWith(target)) return 85

  const trigram = trigramSimilarity(source, target)
  const maxLen = Math.max(source.length, target.length)
  const dist = levenshtein(source, target)
  const levRatio = Math.max(0, 1 - dist / maxLen)

  const combined = trigram * 0.6 + levRatio * 0.4
  return Math.round(combined * 100)
}

/**
 * Algoritmo de matching em 6 etapas:
 * 1. Nome normalizado
 * 2. Tipo do logradouro
 * 3. Aliases
 * 4. Bairro quando disponível
 * 5. Similaridade textual
 * 6. Proximidade espacial quando a geometria existente existir
 */
export function matchOsmWithMultivus(
  osmFeature: OsmStreetFeature,
  candidates: MultivusStreetCandidate[],
): MatchResult {
  if (!osmFeature.name.trim() || !osmFeature.normalizedName) {
    return {
      osmFeature,
      multivusStreetId: null,
      multivusOfficialName: null,
      matchedAlias: null,
      matchType: 'UNRESOLVED',
      score: 0,
      action: 'IGNORE',
      conflicts: [],
      reason: 'Via sem denominação no OpenStreetMap.',
    }
  }

  const osmCentroid = centroidOf(osmFeature.geometry)
  const scoredList: CandidateScore[] = []

  for (const candidate of candidates) {
    // 1. Nome normalizado oficial
    const isExactName = osmFeature.normalizedName === candidate.normalizedName

    // 2. Tipo do logradouro
    const typeMatched =
      !osmFeature.streetType ||
      !candidate.streetType ||
      osmFeature.streetType.toUpperCase() === candidate.streetType.toUpperCase()

    // 3. Aliases
    let bestAliasMatch: { alias: string; aliasType: string; score: number } | null = null
    for (const a of candidate.aliases) {
      if (osmFeature.normalizedName === a.normalizedAlias) {
        bestAliasMatch = { alias: a.alias, aliasType: a.aliasType, score: 95 }
        break
      }
      const sim = scoreStringSimilarity(osmFeature.normalizedName, a.normalizedAlias)
      if (sim >= 75 && (!bestAliasMatch || sim > bestAliasMatch.score)) {
        bestAliasMatch = { alias: a.alias, aliasType: a.aliasType, score: Math.round(sim * 0.9) }
      }
    }

    // Se o OSM também trouxe alt_name/old_name, testa contra o nome oficial
    if (!bestAliasMatch) {
      for (const osmAlias of osmFeature.aliases) {
        const normOsmAlias = normalizeAddress(osmAlias)
        if (normOsmAlias === candidate.normalizedName) {
          bestAliasMatch = { alias: osmAlias, aliasType: 'OLD_NAME', score: 94 }
          break
        }
      }
    }

    // 5. Similaridade textual
    const officialSimilarity = scoreStringSimilarity(
      osmFeature.normalizedName,
      candidate.normalizedName,
    )

    let finalScore = 0
    let exactOfficial = false
    let exactAlias = false

    if (isExactName) {
      exactOfficial = true
      finalScore = typeMatched ? 100 : 92
    } else if (bestAliasMatch && bestAliasMatch.score >= 90) {
      exactAlias = true
      finalScore = bestAliasMatch.score
    } else {
      finalScore = Math.max(officialSimilarity, bestAliasMatch?.score ?? 0)
      if (typeMatched && finalScore > 50) {
        finalScore = Math.min(88, finalScore + 4)
      }
    }

    // 6. Proximidade espacial (se candidato já possui geometria)
    if (candidate.geometry && osmCentroid) {
      const candidateCentroid = centroidOf(candidate.geometry)
      if (candidateCentroid) {
        const dist = haversineDistance(osmCentroid, candidateCentroid)
        if (dist <= 150) {
          finalScore = Math.min(100, finalScore + 5)
        } else if (dist > 2500 && finalScore < 95) {
          finalScore = Math.max(0, finalScore - 25)
        }
      }
    }

    if (finalScore >= 50) {
      scoredList.push({
        candidate,
        score: finalScore,
        matchedAlias: bestAliasMatch?.alias ?? null,
        matchedAliasType: bestAliasMatch?.aliasType ?? null,
        exactOfficial,
        exactAlias,
        typeMatched,
      })
    }
  }

  scoredList.sort((a, b) => b.score - a.score)

  if (scoredList.length === 0) {
    return {
      osmFeature,
      multivusStreetId: null,
      multivusOfficialName: null,
      matchedAlias: null,
      matchType: 'NEW_STREET',
      score: 0,
      action: 'CREATE_STREET',
      conflicts: [],
      reason: 'Nenhuma via correspondente encontrada no Multivus Maps.',
    }
  }

  const top = scoredList[0]!
  const runnerUp = scoredList[1]

  // Detecção de CONFLICT
  // Exemplo: dois candidatos com pontuação alta próxima (diferença <= 6 e ambos >= 65)
  if (runnerUp && runnerUp.score >= 65 && top.score - runnerUp.score <= 6 && !top.exactOfficial) {
    const conflicts: MatchConflict[] = scoredList.slice(0, 3).map((item) => ({
      candidateId: item.candidate.id,
      candidateName: item.candidate.officialName,
      score: item.score,
      reason: item.matchedAlias
        ? `Coincidência com alias "${item.matchedAlias}" (${item.score}%)`
        : `Similaridade textual (${item.score}%)`,
    }))

    return {
      osmFeature,
      multivusStreetId: top.candidate.id,
      multivusOfficialName: top.candidate.officialName,
      matchedAlias: top.matchedAlias,
      matchType: 'CONFLICT',
      score: top.score,
      action: 'REVIEW_REQUIRED',
      conflicts,
      reason: `Múltiplas vias com nomes similares (${top.candidate.officialName} vs ${runnerUp.candidate.officialName}).`,
    }
  }

  // MATCH_EXACT
  if (top.exactOfficial && top.score >= 95) {
    return {
      osmFeature,
      multivusStreetId: top.candidate.id,
      multivusOfficialName: top.candidate.officialName,
      matchedAlias: null,
      matchType: 'MATCH_EXACT',
      score: top.score,
      action: 'APPLY_GEOMETRY',
      conflicts: [],
      reason: 'Correspondência exata de nome oficial.',
    }
  }

  // MATCH_ALIAS
  if (top.exactAlias || (top.matchedAlias && top.score >= 85)) {
    return {
      osmFeature,
      multivusStreetId: top.candidate.id,
      multivusOfficialName: top.candidate.officialName,
      matchedAlias: top.matchedAlias,
      matchType: 'MATCH_ALIAS',
      score: top.score,
      action: 'REVIEW_REQUIRED',
      conflicts: [],
      reason: `Correspondência com alias/nome anterior (${top.matchedAlias}).`,
    }
  }

  // MATCH_FUZZY
  if (top.score >= 60) {
    return {
      osmFeature,
      multivusStreetId: top.candidate.id,
      multivusOfficialName: top.candidate.officialName,
      matchedAlias: top.matchedAlias,
      matchType: 'MATCH_FUZZY',
      score: top.score,
      action: 'REVIEW_REQUIRED',
      conflicts: [],
      reason: `Correspondência aproximada (${top.score}%) com ${top.candidate.officialName}.`,
    }
  }

  return {
    osmFeature,
    multivusStreetId: null,
    multivusOfficialName: null,
    matchedAlias: null,
    matchType: 'UNRESOLVED',
    score: top.score,
    action: 'IGNORE',
    conflicts: [],
    reason: 'Pontuação de similaridade insuficiente (< 60%).',
  }
}
