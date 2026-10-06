import { parseAddressText, type ParsedAddress } from './parse'
import { presentStreetName } from './present'
import { searchRecords, type RankedHit, type SearchableRecord } from './search'

export type SpatialRelation = 'NEAR' | 'BEHIND' | 'NEXT_TO' | 'IN_FRONT_OF' | 'AFTER' | 'ON_STREET'

export type AddressResolution = ParsedAddress & {
  hit: RankedHit | null
  officialName: string | null
  number: string | null
  oldNames: string[]
  matchedAlias: string | null
  matchedReference: string | null
  matchedLandmark: string | null
  matchedLandmarkCategory: string | null
  matchedLandmarkImportance: number | null
  additionalLandmarks: string[]
  probableRadiusMeters: number | null
  spatialRelation: SpatialRelation | null
  spatialRelationLabel: string | null
  usedOldName: boolean
  warning: string | null
  confidence: number
  shareText: string
}

function detectSpatialRelation(text: string): {
  relation: SpatialRelation
  radius: number
  label: string
} | null {
  if (/\b(?:atr[aá]s\s+d[aeo]s?|fundos\s+d[aeo]s?)\b/i.test(text)) {
    return {
      relation: 'BEHIND',
      radius: 100,
      label: 'Atrás de (raio provável: 100 metros)',
    }
  }
  if (/\b(?:ao\s+lado\s+d[aeo]s?|vizinho\s+(?:a[os]?|d[aeo]s?)|lado\s+d[aeo]s?)\b/i.test(text)) {
    return {
      relation: 'NEXT_TO',
      radius: 80,
      label: 'Ao lado de (raio provável: 80 metros)',
    }
  }
  if (/\b(?:em\s+frente\s+(?:a[os]?|d[aeo]s?)|de\s+frente\s+com)\b/i.test(text)) {
    return {
      relation: 'IN_FRONT_OF',
      radius: 80,
      label: 'Em frente a (raio provável: 80 metros)',
    }
  }
  if (/\b(?:depois\s+d[aeo]s?|ap[oó]s\s+d[aeo]s?)\b/i.test(text)) {
    return {
      relation: 'AFTER',
      radius: 150,
      label: 'Depois de (raio provável: 150 metros)',
    }
  }
  if (/\b(?:perto\s+d[aeo]s?|proxim[oa]\s+a[os]?|entorno\s+d[aeo]s?|imedia[cç][oõ]es\s+d[aeo]s?)\b/i.test(text)) {
    return {
      relation: 'NEAR',
      radius: 200,
      label: 'Perto de (raio provável: 200 metros)',
    }
  }
  if (/\b(?:no\s+trevo\s+d[aeo]s?|trevo\s+d[aeo]s?)\b/i.test(text)) {
    return {
      relation: 'ON_STREET',
      radius: 100,
      label: 'No trevo de acesso',
    }
  }
  return null
}

export function resolveAddress(records: SearchableRecord[], raw: string): AddressResolution {
  const parsed = parseAddressText(raw)
  const hits = searchRecords(records, parsed.streetQuery, 5)
  const topHit = hits[0] ?? null

  let resolvedStreetHit: RankedHit | null = null
  let matchedReference: string | null = null
  let matchedLandmark: string | null = null
  let matchedLandmarkCategory: string | null = null
  let matchedLandmarkImportance: number | null = null
  const additionalLandmarks: string[] = []

  let spatialRelation: SpatialRelation | null = null
  let probableRadiusMeters: number | null = null
  let spatialRelationLabel: string | null = null

  // 1. Detecta relação espacial presente no texto bruto ou referência
  const detectedRel = detectSpatialRelation(raw)
  if (detectedRel) {
    spatialRelation = detectedRel.relation
    probableRadiusMeters = detectedRel.radius
    spatialRelationLabel = detectedRel.label
  }

  // 2. Se o topHit for uma referência popular de entregador (ex: "Perto do Barbosão", "Atrás do Posto 2000")
  if (topHit?.kind === 'reference') {
    matchedReference = topHit.title
    if (topHit.landmarkName) {
      matchedLandmark = topHit.landmarkName
    }
    if (topHit.targetStreetId) {
      const street = records.find((r) => r.id === topHit.targetStreetId && r.kind === 'street')
      if (street) {
        const [streetRanked] = searchRecords([street], street.title, 1)
        resolvedStreetHit = streetRanked ?? null
      }
    } else if (topHit.landmarkId) {
      const lm = records.find((r) => r.id === topHit.landmarkId && r.kind === 'landmark')
      if (lm) {
        const [lmRanked] = searchRecords([lm], lm.title, 1)
        resolvedStreetHit = lmRanked ?? null
      }
    }
    if (!resolvedStreetHit) resolvedStreetHit = topHit
  }
  // 3. Se o topHit for um comércio / ponto de referência direto (ex: "Barbosão Supermercado", "Posto 2000")
  else if (topHit?.kind === 'landmark') {
    matchedLandmark = topHit.title
    matchedLandmarkCategory = topHit.category ?? null
    matchedLandmarkImportance = topHit.importanceScore ?? 90
    if (!spatialRelation) {
      spatialRelation = 'NEAR'
      probableRadiusMeters = 200
      spatialRelationLabel = 'Perto de (raio provável: 200 metros)'
    }

    if (topHit.targetStreetId) {
      const street = records.find((r) => r.id === topHit.targetStreetId && r.kind === 'street')
      if (street) {
        const [streetRanked] = searchRecords([street], street.title, 1)
        resolvedStreetHit = streetRanked
          ? {
              ...streetRanked,
              // Preserva a coordenada do landmark se existir para o GPS ir direto ao ponto
              latitude: topHit.latitude ?? streetRanked.latitude,
              longitude: topHit.longitude ?? streetRanked.longitude,
            }
          : null
      }
    }
    if (!resolvedStreetHit) {
      resolvedStreetHit = topHit
    }
  } else if (topHit?.kind === 'street') {
    resolvedStreetHit = topHit
  } else if (topHit) {
    resolvedStreetHit = topHit
  }

  // 4. Se houver texto de referência (ex: "perto do Barbosão atrás da rodoviária ao lado da Farma Cunha...")
  const allLandmarks = records.filter((r) => r.kind === 'landmark')
  if (parsed.reference || raw) {
    const searchContext = (parsed.reference ? `${parsed.reference} ${raw}` : raw).toLowerCase()

    for (const lm of allLandmarks) {
      const lmTitle = lm.title.toLowerCase()
      const aliases = (lm.aliases ?? []).map((a) => a.alias.toLowerCase())
      const isMentioned = lmTitle.length >= 3 && searchContext.includes(lmTitle)
        || aliases.some((a) => a.length >= 3 && searchContext.includes(a))

      if (isMentioned) {
        if (!matchedLandmark) {
          matchedLandmark = lm.title
          matchedLandmarkCategory = lm.category ?? null
          matchedLandmarkImportance = lm.importanceScore ?? 85
        } else if (matchedLandmark !== lm.title && !additionalLandmarks.includes(lm.title)) {
          additionalLandmarks.push(lm.title)
        }
      }
    }

    // Se ainda não encontrou por substring exata, tenta busca fonética/trigrama na referência
    if (!matchedLandmark && parsed.reference) {
      const cleanedRef = parsed.reference
        .replace(/\b(?:perto\s+d[aeo]s?|proxim[oa]\s+a[os]?|em\s+frente\s+(?:a[os]?|d[aeo]s?)?|ao\s+lado\s+(?:d[aeo]s?)?|atr[aá]s\s+d[aeo]s?|depois\s+d[aeo]s?|antes\s+d[aeo]s?|casa\s+[a-zA-ZÀ-ÿ0-9]+\s*|esquina\s+com)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      const targetQuery = cleanedRef.length >= 2 ? cleanedRef : parsed.reference
      const landmarkHits = searchRecords(allLandmarks, targetQuery, 1)
      if (landmarkHits[0] && landmarkHits[0].score >= 40) {
        matchedLandmark = landmarkHits[0].title
        matchedLandmarkCategory = landmarkHits[0].category ?? null
        matchedLandmarkImportance = landmarkHits[0].importanceScore ?? 85
      }
    }
  }

  // 5. Se foi encontrado um landmark e não havia relação espacial definida, define um raio seguro
  if (matchedLandmark && !probableRadiusMeters) {
    probableRadiusMeters = 200
    spatialRelation = 'NEAR'
    spatialRelationLabel = 'Perto de (raio provável: 200 metros)'
  }

  // 6. Se não havia resolvido a via mas encontrou um landmark com rua associada
  if ((!resolvedStreetHit || resolvedStreetHit.kind !== 'street') && matchedLandmark) {
    const lmRecord = allLandmarks.find((l) => l.title === matchedLandmark)
    if (lmRecord?.targetStreetId) {
      const street = records.find((r) => r.id === lmRecord.targetStreetId && r.kind === 'street')
      if (street) {
        const [streetRanked] = searchRecords([street], street.title, 1)
        if (streetRanked) {
          resolvedStreetHit = {
            ...streetRanked,
            latitude: lmRecord.latitude ?? streetRanked.latitude,
            longitude: lmRecord.longitude ?? streetRanked.longitude,
          }
        }
      }
    } else if (lmRecord && !resolvedStreetHit) {
      const [lmRanked] = searchRecords([lmRecord], lmRecord.title, 1)
      resolvedStreetHit = lmRanked ?? null
    }
  }

  const officialName = resolvedStreetHit?.title ?? matchedLandmark ?? null
  const oldNames = resolvedStreetHit?.oldNames ?? []

  let warning: string | null = null
  if (matchedReference) {
    warning = `Referência popular identificada: "${matchedReference}". Esta expressão aponta para ${officialName}.`
  } else if (matchedLandmark && resolvedStreetHit?.kind === 'street') {
    const extraInfo = additionalLandmarks.length ? ` (outros pontos próximos: ${additionalLandmarks.slice(0, 2).join(', ')})` : ''
    warning = `Ponto de referência: ${matchedLandmark}${extraInfo}. ${spatialRelationLabel ?? 'Raio estimado de entrega.'}`
  } else if (resolvedStreetHit?.warning) {
    warning = resolvedStreetHit.warning
  }

  return {
    ...parsed,
    hit: resolvedStreetHit,
    officialName,
    number: parsed.number,
    oldNames,
    matchedAlias: resolvedStreetHit?.matchedAlias ? presentStreetName(resolvedStreetHit.matchedAlias, resolvedStreetHit.streetType) : null,
    matchedReference,
    matchedLandmark,
    matchedLandmarkCategory,
    matchedLandmarkImportance,
    additionalLandmarks,
    probableRadiusMeters,
    spatialRelation,
    spatialRelationLabel,
    usedOldName: resolvedStreetHit?.usedOldName ?? false,
    warning,
    confidence: resolvedStreetHit?.confidence ?? (matchedLandmark ? 90 : 0),
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
