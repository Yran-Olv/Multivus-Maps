import {
  auditLogs,
  cities,
  collaborationConfirmations,
  favorites,
  landmarks,
  localReferences,
  mapCorrections,
  neighborhoods,
  osmImportRecords,
  places,
  recentSearches,
  refreshTokens,
  searchAnalytics,
  streetAliases,
  syncQueue,
  users,
  streets,
  type Database,
} from '@multivus/database'
import { confidenceOf, describeStreet, normalizeAddress, parseAddressText } from '@multivus/map-core'
import type {
  ConfirmEntityInput,
  CreateAddressPointInput,
  CreateCorrectionInput,
  CreateDeliveryLocationInput,
  CreateLandmarkInput,
  CreateLocalReferenceInput,
  CreateStreetInput,
  SearchResult,
  UpdateStreetInput,
} from '@multivus/shared'
import { and, desc, eq, sql } from 'drizzle-orm'

import { hashPassword } from './lib/passwords'
import { rowsOf } from './lib/rows'
import { hashToken } from './lib/tokens'

type AliasInput = { alias: string; aliasType: 'OLD_NAME' | 'POPULAR_NAME' | 'ABBREVIATION' | 'OTHER' }

async function audit(
  db: Database,
  entry: {
    entityType: string
    entityId: string
    action: string
    previousData?: unknown
    newData?: unknown
    userId: string | null
  },
): Promise<void> {
  await db.insert(auditLogs).values({
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    previousData: entry.previousData ?? null,
    newData: entry.newData ?? null,
    userId: entry.userId,
  })
}

const streetSelect = sql`
  s.id,
  s.official_name AS "officialName",
  s.street_type AS "streetType",
  s.normalized_name AS "normalizedName",
  s.verified,
  s.confidence_score AS "confidenceScore",
  s.geometry_source AS "geometrySource",
  s.geometry_source_date AS "geometrySourceDate",
  s.geometry_verified AS "geometryVerified",
  s.neighborhood_status AS "neighborhoodStatus",
  s.neighborhood_source AS "neighborhoodSource",
  s.source,
  s.source_date AS "sourceDate",
  s.active,
  s.notes,
  s.neighborhood_id AS "neighborhoodId",
  n.name AS "neighborhoodName",
  ST_AsGeoJSON(s.geometry)::json AS geometry,
  COALESCE((
    SELECT json_agg(json_build_object('id', a.id, 'alias', a.alias, 'aliasType', a.alias_type) ORDER BY a.alias)
    FROM street_aliases a WHERE a.street_id = s.id AND a.active = true
  ), '[]'::json) AS aliases
`

export async function listCities(db: Database) {
  return db.select().from(cities).orderBy(cities.name)
}

export async function listNeighborhoods(db: Database) {
  return db
    .select({
      id: neighborhoods.id,
      cityId: neighborhoods.cityId,
      name: neighborhoods.name,
      normalizedName: neighborhoods.normalizedName,
      source: neighborhoods.source,
      sourceDate: neighborhoods.sourceDate,
      active: neighborhoods.active,
      hasGeometry: sql<boolean>`${neighborhoods.geometry} IS NOT NULL`,
    })
    .from(neighborhoods)
    .where(eq(neighborhoods.active, true))
    .orderBy(neighborhoods.name)
}

export async function listPlaces(db: Database) {
  return db
    .select({
      id: places.id,
      name: places.name,
      category: places.category,
      latitude: places.latitude,
      longitude: places.longitude,
      address: places.address,
      neighborhoodId: places.neighborhoodId,
      description: places.description,
      source: places.source,
      sourceDate: places.sourceDate,
      verified: places.verified,
    })
    .from(places)
    .where(eq(places.active, true))
    .orderBy(places.name)
}

export async function listLandmarks(db: Database, category?: string) {
  const query = db
    .select({
      id: landmarks.id,
      name: landmarks.name,
      category: landmarks.category,
      aliases: landmarks.aliases,
      streetId: landmarks.streetId,
      streetNumber: landmarks.streetNumber,
      neighborhoodId: landmarks.neighborhoodId,
      address: landmarks.address,
      description: landmarks.description,
      latitude: landmarks.latitude,
      longitude: landmarks.longitude,
      verified: landmarks.verified,
      confidenceScore: landmarks.confidenceScore,
      importanceScore: landmarks.importanceScore,
      source: landmarks.source,
      createdAt: landmarks.createdAt,
    })
    .from(landmarks)
    .where(category ? and(eq(landmarks.active, true), eq(landmarks.category, category)) : eq(landmarks.active, true))
    .orderBy(desc(landmarks.importanceScore), landmarks.name)

  return query
}

export async function createLandmark(
  db: Database,
  input: CreateLandmarkInput,
  userId: string | null,
) {
  const city = await db.select({ id: cities.id }).from(cities).limit(1)
  const cityId = city[0]?.id
  if (!cityId) throw new Error('Cidade não cadastrada')

  const pointGeo = input.latitude && input.longitude
    ? sql`ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)`
    : null

  const [created] = await db.insert(landmarks).values({
    cityId,
    name: input.name,
    normalizedName: normalizeAddress(input.name),
    category: input.category,
    aliases: input.aliases ?? [],
    streetId: input.streetId ?? null,
    streetNumber: input.streetNumber ?? null,
    neighborhoodId: input.neighborhoodId ?? null,
    address: input.address ?? null,
    description: input.description ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    geometry: pointGeo as unknown as string,
    verified: false,
    confidenceScore: 70,
  }).returning()

  await audit(db, {
    entityType: 'landmark',
    entityId: created?.id ?? input.name,
    action: 'create',
    newData: input,
    userId,
  })
  return created
}

export async function listLocalReferences(db: Database) {
  const result = await db.execute<{
    id: string
    popularPhrase: string
    relationType: string
    targetStreetId: string | null
    targetStreetName: string | null
    landmarkId: string | null
    landmarkName: string | null
    description: string | null
    confirmationsCount: number
    confidenceScore: number
    verified: boolean
    createdAt: string
  }>(sql`
    SELECT
      lr.id,
      lr.popular_phrase AS "popularPhrase",
      lr.relation_type AS "relationType",
      lr.target_street_id AS "targetStreetId",
      s.official_name AS "targetStreetName",
      lr.landmark_id AS "landmarkId",
      lm.name AS "landmarkName",
      lr.description,
      lr.confirmations_count AS "confirmationsCount",
      lr.confidence_score AS "confidenceScore",
      lr.verified,
      lr.created_at AS "createdAt"
    FROM local_references lr
    LEFT JOIN streets s ON s.id = lr.target_street_id
    LEFT JOIN landmarks lm ON lm.id = lr.landmark_id
    WHERE lr.active = true
    ORDER BY lr.confirmations_count DESC, lr.popular_phrase ASC
  `)
  return rowsOf(result)
}

export async function createLocalReference(
  db: Database,
  input: CreateLocalReferenceInput,
  userId: string | null,
) {
  const city = await db.select({ id: cities.id }).from(cities).limit(1)
  const cityId = city[0]?.id
  if (!cityId) throw new Error('Cidade não cadastrada')

  const [created] = await db.insert(localReferences).values({
    cityId,
    popularPhrase: input.popularPhrase,
    normalizedPhrase: normalizeAddress(input.popularPhrase),
    relationType: input.relationType,
    targetStreetId: input.targetStreetId ?? null,
    landmarkId: input.landmarkId ?? null,
    description: input.description ?? null,
    confirmationsCount: 1,
    confidenceScore: 70,
    verified: false,
    submittedBy: userId,
  }).returning()

  await audit(db, {
    entityType: 'local_reference',
    entityId: created?.id ?? input.popularPhrase,
    action: 'create',
    newData: input,
    userId,
  })
  return created
}

export async function confirmEntity(db: Database, input: ConfirmEntityInput, userId: string | null) {
  await db.insert(collaborationConfirmations).values({
    entityType: input.entityType,
    entityId: input.entityId,
    userId: userId ?? null,
    deviceId: input.deviceId ?? null,
    confirmationType: input.confirmationType ?? 'CONFIRM',
    notes: input.notes ?? null,
  }).onConflictDoNothing()

  const countRes = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count
    FROM collaboration_confirmations
    WHERE entity_type = ${input.entityType}
      AND entity_id = ${input.entityId}
      AND confirmation_type = 'CONFIRM'
  `)
  const count = rowsOf(countRes)[0]?.count ?? 1

  let newConfidence = 70
  if (count >= 3) newConfidence = 95
  else if (count === 2) newConfidence = 85

  if (input.entityType === 'local_reference') {
    await db.update(localReferences).set({
      confirmationsCount: count,
      confidenceScore: newConfidence,
    }).where(eq(localReferences.id, input.entityId))
  } else if (input.entityType === 'street') {
    await db.update(streets).set({
      confidenceScore: newConfidence,
    }).where(eq(streets.id, input.entityId))
  } else if (input.entityType === 'landmark') {
    await db.update(landmarks).set({
      confidenceScore: newConfidence,
    }).where(eq(landmarks.id, input.entityId))
  }

  return { entityId: input.entityId, confirmationsCount: count, confidenceScore: newConfidence }
}


export type StreetRecord = {
  id: string
  officialName: string
  streetType: string
  normalizedName: string
  verified: boolean
  confidenceScore: number
  geometrySource: string | null
  geometrySourceDate: string | null
  geometryVerified: boolean
  neighborhoodStatus: string
  neighborhoodSource: string | null
  source: string
  sourceDate: string | null
  active: boolean
  notes: string | null
  neighborhoodId: string | null
  neighborhoodName: string | null
  geometry: unknown
  aliases: Array<{ id: string; alias: string; aliasType: string }>
}

export async function listStreets(db: Database, includeInactive = false): Promise<StreetRecord[]> {
  const where = includeInactive ? sql`true` : sql`s.active = true`
  const result = await db.execute<StreetRecord>(sql`
    SELECT ${streetSelect}
    FROM streets s
    LEFT JOIN neighborhoods n ON n.id = s.neighborhood_id
    WHERE ${where}
    ORDER BY s.official_name
  `)
  return rowsOf(result)
}

export async function getStreet(db: Database, id: string): Promise<StreetRecord | null> {
  const result = await db.execute<StreetRecord>(sql`
    SELECT ${streetSelect}
    FROM streets s
    LEFT JOIN neighborhoods n ON n.id = s.neighborhood_id
    WHERE s.id = ${id}
  `)
  return rowsOf(result)[0] ?? null
}

export async function searchCatalog(db: Database, rawQuery: string, limit: number): Promise<SearchResult[]> {
  const parsed = parseAddressText(rawQuery)
  const term = normalizeAddress(parsed.streetQuery)
  if (term.length < 2) return []

  const stripped = term
    .replace(/\b(?:perto\s+d[aeo]s?|proxim[oa]\s+a[os]?|em\s+frente\s+(?:a[os]?|d[aeo]s?)?|ao\s+lado\s+(?:d[aeo]s?)?|atr[aá]s\s+d[aeo]s?|depois\s+d[aeo]s?|antes\s+d[aeo]s?|no\s+trevo\s+d[aeo]s?|casa\s+[a-zA-Z0-9]+\s*|esquina\s+com)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const targetTerm = stripped.length >= 2 ? stripped : term

  const streetsResult = await db.execute<{
    id: string
    officialName: string
    streetType: string
    neighborhoodName: string | null
    verified: boolean
    confidenceScore: number
    source: string
    sourceDate: string | null
    geometry: unknown
    aliases: unknown
    matchedAlias: string | null
    matchedAliasType: string | null
    nameScore: number
    aliasScore: number
    score: number
  }>(sql`
    SELECT
      s.id,
      s.official_name AS "officialName",
      s.street_type AS "streetType",
      n.name AS "neighborhoodName",
      s.verified,
      s.confidence_score AS "confidenceScore",
      s.source,
      s.source_date AS "sourceDate",
      ST_AsGeoJSON(s.geometry)::json AS geometry,
      COALESCE((
        SELECT json_agg(json_build_object('alias', a.alias, 'aliasType', a.alias_type))
        FROM street_aliases a WHERE a.street_id = s.id
      ), '[]'::json) AS aliases,
      best.alias AS "matchedAlias",
      best.alias_type AS "matchedAliasType",
      similarity(s.normalized_name, ${term}) AS "nameScore",
      COALESCE(best.alias_score, 0) AS "aliasScore",
      GREATEST(
        similarity(s.normalized_name, ${term}),
        COALESCE(best.alias_score, 0)
      ) AS score
    FROM streets s
    LEFT JOIN neighborhoods n ON n.id = s.neighborhood_id
    LEFT JOIN LATERAL (
      SELECT alias, alias_type::text, similarity(normalized_alias, ${term}) AS alias_score
      FROM street_aliases
      WHERE street_id = s.id
      ORDER BY similarity(normalized_alias, ${term}) DESC
      LIMIT 1
    ) best ON true
    WHERE s.active = true
      AND (
        s.normalized_name LIKE ${'%' + term + '%'}
        OR COALESCE(best.alias, '') LIKE ${'%' + term + '%'}
        OR similarity(s.normalized_name, ${term}) > 0.25
        OR COALESCE(best.alias_score, 0) > 0.25
      )
    ORDER BY score DESC, s.official_name
    LIMIT ${limit}
  `)

  const placeResult = await db.execute<{
    id: string
    name: string
    category: string
    description: string | null
    latitude: number | null
    longitude: number | null
    verified: boolean
    source: string
    sourceDate: string | null
    score: number
  }>(sql`
    SELECT id, name, category, description, latitude, longitude, verified, source,
           source_date AS "sourceDate",
           GREATEST(
             similarity(normalized_name, ${term}),
             similarity(lower(coalesce(description, '')), ${term})
           ) AS score
    FROM places
    WHERE active = true
      AND (
        normalized_name LIKE ${'%' + term + '%'}
        OR lower(coalesce(description, '')) LIKE ${'%' + term + '%'}
        OR similarity(normalized_name, ${term}) > 0.3
      )
    ORDER BY score DESC
    LIMIT ${limit}
  `)

  const neighborhoodResult = await db.execute<{
    id: string
    name: string
    score: number
  }>(sql`
    SELECT id, name, similarity(normalized_name, ${term}) AS score
    FROM neighborhoods
    WHERE active = true
      AND (normalized_name LIKE ${'%' + term + '%'} OR similarity(normalized_name, ${term}) > 0.3)
    ORDER BY score DESC
    LIMIT ${limit}
  `)

  const landmarkResult = await db.execute<{
    id: string
    name: string
    category: string
    description: string | null
    latitude: number | null
    longitude: number | null
    streetId: string | null
    streetName: string | null
    neighborhoodName: string | null
    verified: boolean
    confidenceScore: number
    importanceScore: number
    source: string
    score: number
  }>(sql`
    SELECT
      l.id,
      l.name,
      l.category,
      l.description,
      l.latitude,
      l.longitude,
      l.street_id AS "streetId",
      s.official_name AS "streetName",
      n.name AS "neighborhoodName",
      l.verified,
      l.confidence_score AS "confidenceScore",
      l.importance_score AS "importanceScore",
      l.source,
      (
        GREATEST(
          similarity(l.normalized_name, ${term}),
          similarity(l.normalized_name, ${targetTerm}),
          similarity(lower(coalesce(l.description, '')), ${term}),
          similarity(lower(coalesce(l.description, '')), ${targetTerm}),
          similarity(lower(coalesce(l.category, '')), ${term})
        ) + (l.importance_score::float / 250.0)
      ) AS score
    FROM landmarks l
    LEFT JOIN streets s ON s.id = l.street_id
    LEFT JOIN neighborhoods n ON n.id = l.neighborhood_id
    WHERE l.active = true
      AND (
        l.normalized_name LIKE ${'%' + term + '%'}
        OR l.normalized_name LIKE ${'%' + targetTerm + '%'}
        OR lower(coalesce(l.description, '')) LIKE ${'%' + term + '%'}
        OR l.aliases::text ILIKE ${'%' + term + '%'}
        OR l.aliases::text ILIKE ${'%' + targetTerm + '%'}
        OR similarity(l.normalized_name, ${term}) > 0.25
        OR similarity(l.normalized_name, ${targetTerm}) > 0.25
      )
    ORDER BY score DESC
    LIMIT ${limit}
  `)

  const referenceResult = await db.execute<{
    id: string
    popularPhrase: string
    relationType: string
    targetStreetId: string | null
    targetStreetName: string | null
    targetStreetGeometry: unknown
    landmarkId: string | null
    landmarkName: string | null
    description: string | null
    confirmationsCount: number
    confidenceScore: number
    verified: boolean
    score: number
  }>(sql`
    SELECT
      lr.id,
      lr.popular_phrase AS "popularPhrase",
      lr.relation_type AS "relationType",
      lr.target_street_id AS "targetStreetId",
      s.official_name AS "targetStreetName",
      ST_AsGeoJSON(s.geometry)::json AS "targetStreetGeometry",
      lr.landmark_id AS "landmarkId",
      lm.name AS "landmarkName",
      lr.description,
      lr.confirmations_count AS "confirmationsCount",
      lr.confidence_score AS "confidenceScore",
      lr.verified,
      similarity(lr.normalized_phrase, ${term}) AS score
    FROM local_references lr
    LEFT JOIN streets s ON s.id = lr.target_street_id
    LEFT JOIN landmarks lm ON lm.id = lr.landmark_id
    WHERE lr.active = true
      AND (
        lr.normalized_phrase LIKE ${'%' + term + '%'}
        OR similarity(lr.normalized_phrase, ${term}) > 0.25
      )
    ORDER BY score DESC
    LIMIT ${limit}
  `)

  const referenceHits: SearchResult[] = rowsOf(referenceResult).map((row) => ({
    kind: 'reference' as const,
    id: row.id,
    title: row.popularPhrase,
    subtitle: row.targetStreetName ? `🔗 Referência popular → ${row.targetStreetName}` : '🔗 Referência de entrega',
    streetType: null,
    neighborhoodName: null,
    matchedAlias: row.popularPhrase,
    matchedAliasType: 'POPULAR_NAME',
    verified: row.verified,
    source: 'Colaboração local',
    sourceDate: null,
    latitude: null,
    longitude: null,
    geometry: row.targetStreetGeometry ?? null,
    warning: row.targetStreetName
      ? `Expressão popular utilizada por moradores. Aponta para ${row.targetStreetName}.`
      : null,
    usedOldName: false,
    oldNames: [],
    confidence: Number(row.confidenceScore) || 80,
    score: Number(row.score) || 0,
    importanceScore: 85,
    targetStreetId: row.targetStreetId,
    targetStreetName: row.targetStreetName,
    landmarkId: row.landmarkId,
    landmarkName: row.landmarkName,
    relationType: row.relationType,
  }))

  const landmarkHits: SearchResult[] = rowsOf(landmarkResult).map((row) => {
    const catLabel = row.category ? row.category.charAt(0).toUpperCase() + row.category.slice(1) : 'Ponto de referência'
    return {
      kind: 'landmark' as const,
      id: row.id,
      title: row.name,
      subtitle: row.streetName ? `📍 ${catLabel} · ${row.streetName}` : `📍 ${catLabel}`,
      streetType: null,
      neighborhoodName: row.neighborhoodName,
      matchedAlias: null,
      matchedAliasType: null,
      verified: row.verified,
      source: row.source || 'Cadastro Municipal / Local',
      sourceDate: null,
      latitude: row.latitude,
      longitude: row.longitude,
      geometry: null,
      warning: null,
      usedOldName: false,
      oldNames: [],
      confidence: Number(row.confidenceScore) || 90,
      importanceScore: Number(row.importanceScore) || 70,
      score: Number(row.score) || 0,
      category: row.category,
      targetStreetId: row.streetId,
      targetStreetName: row.streetName,
    }
  })

  const streetHits: SearchResult[] = rowsOf(streetsResult).map((row) => {
    const nameScore = Number(row.nameScore)
    const aliasScore = Number(row.aliasScore)
    const aliasWins = Boolean(row.matchedAlias) && aliasScore >= nameScore && aliasScore > 0.25
    const described = describeStreet({
      title: row.officialName,
      streetType: row.streetType,
      aliases: aliasList(row.aliases),
      verified: row.verified,
      confidence: Number(row.confidenceScore),
      source: row.source,
      neighborhoodName: row.neighborhoodName,
      matchedAlias: aliasWins ? row.matchedAlias : null,
      matchedAliasType: aliasWins ? row.matchedAliasType : null,
    })
    return {
      kind: 'street' as const,
      id: row.id,
      title: row.officialName,
      subtitle: described.subtitle ?? row.neighborhoodName,
      streetType: row.streetType,
      neighborhoodName: row.neighborhoodName,
      matchedAlias: described.matchedAlias,
      matchedAliasType: aliasWins ? row.matchedAliasType : null,
      verified: row.verified,
      source: row.source,
      sourceDate: row.sourceDate,
      latitude: null,
      longitude: null,
      geometry: row.geometry,
      warning: described.warning,
      usedOldName: described.usedOldName,
      oldNames: described.oldNames,
      confidence: described.confidence,
      score: Number(row.score) || 0,
      importanceScore: 60,
    }
  })

  const placeHits: SearchResult[] = rowsOf(placeResult).map((row) => ({
    kind: 'place' as const,
    id: row.id,
    title: row.name,
    subtitle: row.description,
    streetType: null,
    neighborhoodName: null,
    matchedAlias: null,
    matchedAliasType: null,
    verified: row.verified,
    source: row.source,
    sourceDate: row.sourceDate,
    latitude: row.latitude,
    longitude: row.longitude,
    geometry: null,
    warning: null,
    usedOldName: false,
    oldNames: [],
    confidence: confidenceOf({ verified: row.verified, source: row.source }),
    score: Number(row.score) || 0,
    importanceScore: 50,
  }))

  const neighborhoodHits: SearchResult[] = rowsOf(neighborhoodResult).map((row) => ({
    kind: 'neighborhood' as const,
    id: row.id,
    title: row.name,
    subtitle: 'Bairro',
    streetType: null,
    neighborhoodName: row.name,
    matchedAlias: null,
    matchedAliasType: null,
    verified: false,
    source: null,
    sourceDate: null,
    latitude: null,
    longitude: null,
    geometry: null,
    warning: null,
    usedOldName: false,
    oldNames: [],
    confidence: 0,
    score: Number(row.score) || 0,
    importanceScore: 40,
  }))

  const allHits = [
    ...referenceHits,
    ...streetHits,
    ...landmarkHits,
    ...placeHits,
    ...neighborhoodHits,
  ]
  allHits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.importanceScore ?? 0) - (a.importanceScore ?? 0))
  const topHit = allHits[0] ?? null

  // Aprendizado local: registra o termo buscado e o resultado
  try {
    await db.insert(searchAnalytics).values({
      query: rawQuery,
      normalizedQuery: term,
      matchedKind: topHit?.kind ?? null,
      matchedId: topHit?.id ?? null,
      matchedAlias: topHit?.matchedAlias ?? null,
      usedOldName: topHit?.usedOldName ?? false,
      userId: null,
    })
  } catch (err) {
    console.warn('Aviso: falha ao salvar search analytics:', err)
  }

  return allHits.slice(0, limit)
}


function aliasList(value: unknown): { alias: string; aliasType: string }[] {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const alias = 'alias' in item && typeof item.alias === 'string' ? item.alias : null
    const aliasType = 'aliasType' in item && typeof item.aliasType === 'string' ? item.aliasType : null
    return alias && aliasType ? [{ alias, aliasType }] : []
  })
}

async function insertAliases(db: Database, streetId: string, aliases: AliasInput[]): Promise<void> {
  for (const alias of aliases) {
    await db.insert(streetAliases).values({
      streetId,
      alias: alias.alias,
      normalizedAlias: normalizeAddress(alias.alias),
      aliasType: alias.aliasType,
    }).onConflictDoNothing({
      target: [streetAliases.streetId, streetAliases.normalizedAlias, streetAliases.aliasType],
    })
    await recordOldName(db, streetId, alias.alias, alias.aliasType)
  }
}

async function recordOldName(
  db: Database,
  streetId: string,
  alias: string,
  aliasType: AliasInput['aliasType'],
): Promise<void> {
  if (aliasType !== 'OLD_NAME') return
  const result = await db.execute<{ officialName: string; source: string; sourceDate: string | null }>(sql`
    SELECT official_name AS "officialName", source, source_date AS "sourceDate"
    FROM streets WHERE id = ${streetId}
  `)
  const street = rowsOf(result)[0]
  if (!street) return
  await db.execute(sql`
    INSERT INTO street_name_history (street_id, old_name, new_name, source, source_date, verified, confidence_score)
    SELECT ${streetId}, ${alias}, ${street.officialName}, ${street.source}, ${street.sourceDate}, false, 70
    WHERE NOT EXISTS (
      SELECT 1 FROM street_name_history
      WHERE street_id = ${streetId} AND old_name = ${alias} AND new_name = ${street.officialName}
    )
  `)
}

export async function createStreet(db: Database, input: CreateStreetInput, userId: string) {
  const geometry = input.geometry ? JSON.stringify(input.geometry) : null
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO streets (
      city_id, neighborhood_id, official_name, normalized_name, street_type, geometry,
      source, source_date, verified, confidence_score, active, notes
    )
    SELECT id, ${input.neighborhoodId ?? null}, ${input.officialName}, ${normalizeAddress(input.officialName)},
           ${input.streetType},
           CASE WHEN ${geometry}::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON(${geometry}), 4326) END,
           ${input.source}, ${input.sourceDate ?? null}, false, 70, true, ${input.notes ?? null}
    FROM cities
    ORDER BY created_at
    LIMIT 1
    RETURNING id
  `)
  const id = rowsOf(result)[0]?.id
  if (!id) throw new Error('Cadastre a cidade antes de criar ruas.')
  if (input.aliases?.length) await insertAliases(db, id, input.aliases)
  await audit(db, { entityType: 'street', entityId: id, action: 'create', newData: input, userId })
  return getStreet(db, id)
}

export async function updateStreet(db: Database, id: string, input: UpdateStreetInput, userId: string) {
  const previous = await getStreet(db, id)
  if (!previous) return null
  const geometry = input.geometry === undefined ? undefined : input.geometry ? JSON.stringify(input.geometry) : null
  const nameChanged = Boolean(input.officialName && input.officialName.trim() !== previous.officialName)

  await db.execute(sql`
    UPDATE streets SET
      official_name = COALESCE(${input.officialName ?? null}, official_name),
      normalized_name = CASE
        WHEN ${input.officialName ?? null}::text IS NULL THEN normalized_name
        ELSE ${input.officialName ? normalizeAddress(input.officialName) : null}
      END,
      street_type = COALESCE(${input.streetType ?? null}, street_type),
      neighborhood_id = COALESCE(${input.neighborhoodId ?? null}, neighborhood_id),
      source = COALESCE(${input.source ?? null}, source),
      source_date = COALESCE(${input.sourceDate ?? null}, source_date),
      notes = COALESCE(${input.notes ?? null}, notes),
      active = COALESCE(${input.active ?? null}, active),
      verified = COALESCE(${input.verified ?? null}, verified),
      confidence_score = CASE
        WHEN ${input.verified ?? null}::boolean IS TRUE THEN 100
        WHEN ${input.verified ?? null}::boolean IS FALSE THEN 70
        ELSE confidence_score
      END,
      verified_by = CASE
        WHEN ${input.verified ?? null}::boolean IS TRUE THEN ${userId}::uuid
        WHEN ${input.verified ?? null}::boolean IS FALSE THEN NULL
        ELSE verified_by
      END,
      verified_at = CASE
        WHEN ${input.verified ?? null}::boolean IS TRUE THEN now()
        WHEN ${input.verified ?? null}::boolean IS FALSE THEN NULL
        ELSE verified_at
      END,
      geometry = CASE
        WHEN ${geometry === undefined}::boolean THEN geometry
        WHEN ${geometry ?? null}::text IS NULL THEN NULL
        ELSE ST_SetSRID(ST_GeomFromGeoJSON(${geometry ?? null}), 4326)
      END,
      geometry_verified = CASE
        WHEN ${geometry !== undefined && geometry !== null}::boolean THEN true
        ELSE geometry_verified
      END,
      geometry_source = CASE
        WHEN ${geometry !== undefined && geometry !== null}::boolean THEN COALESCE(${input.source ?? null}, 'Conferência local')
        ELSE geometry_source
      END,
      geometry_source_date = CASE
        WHEN ${geometry !== undefined && geometry !== null}::boolean THEN to_char(now(), 'YYYY-MM-DD')
        ELSE geometry_source_date
      END
    WHERE id = ${id}
  `)

  if (input.aliases?.length) await insertAliases(db, id, input.aliases)

  // Se o nome oficial mudou: cria histórico, alias antigo e audit log
  if (nameChanged && input.officialName) {
    await db.execute(sql`
      INSERT INTO street_name_history (
        street_id, old_name, new_name, source, source_date, verified, verified_at, verified_by, confidence_score
      ) VALUES (
        ${id}, ${previous.officialName}, ${input.officialName},
        ${input.source || 'Conferência local'}, to_char(now(), 'YYYY-MM-DD'),
        true, now(), ${userId}::uuid, 100
      )
    `)

    await db.execute(sql`
      INSERT INTO street_aliases (street_id, alias, normalized_alias, alias_type, active)
      VALUES (${id}, ${previous.officialName}, ${normalizeAddress(previous.officialName)}, 'OLD_NAME', true)
      ON CONFLICT (street_id, normalized_alias, alias_type) DO UPDATE SET active = true
    `)

    await audit(db, {
      entityType: 'street',
      entityId: id,
      action: 'STREET_NAME_CHANGED',
      previousData: { officialName: previous.officialName },
      newData: { officialName: input.officialName },
      userId,
    })
  }

  if (input.verified === true) {
    await db.execute(sql`
      UPDATE street_name_history
      SET verified = true, verified_at = now(), verified_by = ${userId}::uuid, confidence_score = 100
      WHERE street_id = ${id} AND verified = false
    `)
    await audit(db, {
      entityType: 'street',
      entityId: id,
      action: 'STREET_GEOMETRY_APPROVED',
      newData: { verified: true, confidenceScore: 100 },
      userId,
    })
  }

  const next = await getStreet(db, id)
  await audit(db, {
    entityType: 'street',
    entityId: id,
    action: 'update',
    previousData: previous,
    newData: next,
    userId,
  })
  return next
}

export async function deactivateStreet(db: Database, id: string, userId: string) {
  return updateStreet(db, id, { active: false }, userId)
}

export async function createAlias(
  db: Database,
  input: { streetId: string; alias: string; aliasType: AliasInput['aliasType'] },
  userId: string,
) {
  const [created] = await db.insert(streetAliases).values({
    streetId: input.streetId,
    alias: input.alias,
    normalizedAlias: normalizeAddress(input.alias),
    aliasType: input.aliasType,
    active: true,
  }).returning()
  await recordOldName(db, input.streetId, input.alias, input.aliasType)
  await audit(db, { entityType: 'street_alias', entityId: created?.id ?? input.streetId, action: 'STREET_ALIAS_ADDED', newData: input, userId })
  return created
}

export async function deactivateAlias(db: Database, aliasId: string, userId: string) {
  const [updated] = await db
    .update(streetAliases)
    .set({ active: false })
    .where(eq(streetAliases.id, aliasId))
    .returning()
  if (updated) {
    await audit(db, {
      entityType: 'street_alias',
      entityId: aliasId,
      action: 'STREET_ALIAS_REMOVED',
      previousData: { active: true },
      newData: { active: false },
      userId,
    })
  }
  return updated ?? null
}

export async function createSegment(
  db: Database,
  input: { streetId: string; direction: 'BOTH' | 'FORWARD' | 'BACKWARD'; geometry?: unknown },
  userId: string,
) {
  const geometry = input.geometry ? JSON.stringify(input.geometry) : null
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO street_segments (street_id, direction, geometry, verified, source)
    VALUES (
      ${input.streetId},
      ${input.direction}::segment_direction,
      CASE WHEN ${geometry}::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON(${geometry}), 4326) END,
      true, 'Conferência local'
    )
    RETURNING id
  `)
  const id = rowsOf(result)[0]?.id
  await audit(db, { entityType: 'street_segment', entityId: id ?? input.streetId, action: 'STREET_DIRECTION_CHANGED', newData: input, userId })
  return { id }
}

export async function createRestriction(
  db: Database,
  input: {
    fromSegmentId: string
    toSegmentId: string
    restrictionType: 'NO_LEFT' | 'NO_RIGHT' | 'NO_U_TURN' | 'MANDATORY_LEFT' | 'MANDATORY_RIGHT' | 'CLOSED' | 'OTHER'
    description?: string | null
    latitude?: number | null
    longitude?: number | null
  },
  userId: string,
) {
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO turn_restrictions (
      from_segment_id, to_segment_id, restriction_type, description, geometry_point, verified, source, active
    ) VALUES (
      ${input.fromSegmentId},
      ${input.toSegmentId},
      ${input.restrictionType}::restriction_type,
      ${input.description ?? null},
      CASE
        WHEN ${input.latitude ?? null}::float8 IS NULL OR ${input.longitude ?? null}::float8 IS NULL THEN NULL
        ELSE ST_SetSRID(ST_MakePoint(${input.longitude ?? 0}, ${input.latitude ?? 0}), 4326)
      END,
      true, 'Conferência local', true
    )
    RETURNING id
  `)
  const id = rowsOf(result)[0]?.id
  await audit(db, { entityType: 'turn_restriction', entityId: id ?? input.fromSegmentId, action: 'TURN_RESTRICTION_ADDED', newData: input, userId })
  return { id }
}

export async function listOsmImportRecords(db: Database, batchName = 'santa-juliana') {
  const result = await db.execute(sql`
    SELECT
      r.id,
      r.batch_name AS "batchName",
      r.osm_id AS "osmId",
      r.source_name AS "sourceName",
      r.normalized_source_name AS "normalizedSourceName",
      r.street_type AS "streetType",
      ST_AsGeoJSON(r.geometry)::json AS geometry,
      r.multivus_street_id AS "multivusStreetId",
      s.official_name AS "multivusOfficialName",
      r.match_type AS "matchType",
      r.score,
      r.status,
      r.conflicts,
      r.tags,
      r.created_at AS "createdAt"
    FROM osm_import_records r
    LEFT JOIN streets s ON s.id = r.multivus_street_id
    WHERE r.batch_name = ${batchName}
    ORDER BY r.score DESC, r.source_name
  `)
  return rowsOf(result)
}

export async function approveOsmGeometry(
  db: Database,
  input: { streetId: string; importRecordId?: string; geometry?: unknown; source?: string },
  userId: string,
) {
  let geom = input.geometry
  let sourceName = 'OpenStreetMap'
  let score = 100

  if (input.importRecordId) {
    const [record] = await db
      .select()
      .from(osmImportRecords)
      .where(eq(osmImportRecords.id, input.importRecordId))
      .limit(1)

    if (record) {
      if (!geom) {
        const geomRes = await db.execute<{ geometry: unknown }>(sql`
          SELECT ST_AsGeoJSON(geometry)::json AS geometry FROM osm_import_records WHERE id = ${record.id}
        `)
        geom = rowsOf(geomRes)[0]?.geometry
      }
      sourceName = record.sourceName
      score = record.score
      await db
        .update(osmImportRecords)
        .set({
          status: 'APPROVED',
          reviewedBy: userId,
          reviewedAt: new Date(),
        })
        .where(eq(osmImportRecords.id, record.id))
    }
  }

  if (!geom) throw new Error('Geometria não fornecida.')
  const geomStr = JSON.stringify(geom)

  await db.execute(sql`
    UPDATE streets SET
      geometry = ST_SetSRID(ST_GeomFromGeoJSON(${geomStr}), 4326),
      geometry_source = ${input.source ?? 'OpenStreetMap'},
      geometry_source_date = to_char(now(), 'YYYY-MM-DD'),
      geometry_verified = true,
      verified = true,
      confidence_score = 100,
      verified_by = ${userId}::uuid,
      verified_at = now()
    WHERE id = ${input.streetId}
  `)

  await db.execute(sql`
    INSERT INTO street_segments (street_id, geometry, direction, verified, source)
    VALUES (${input.streetId}, ST_SetSRID(ST_GeomFromGeoJSON(${geomStr}), 4326), 'BOTH', false, ${input.source ?? 'OpenStreetMap'})
    ON CONFLICT DO NOTHING
  `)

  const updated = await getStreet(db, input.streetId)
  await audit(db, {
    entityType: 'street',
    entityId: input.streetId,
    action: 'STREET_GEOMETRY_APPROVED',
    newData: {
      streetId: input.streetId,
      officialName: updated?.officialName,
      source: input.source ?? 'OpenStreetMap',
      sourceName,
      score,
    },
    userId,
  })
  return updated
}

export async function rejectOsmGeometry(
  db: Database,
  input: { importRecordId: string; reason?: string },
  userId: string,
) {
  const [updated] = await db
    .update(osmImportRecords)
    .set({
      status: 'REJECTED',
      reviewedBy: userId,
      reviewedAt: new Date(),
    })
    .where(eq(osmImportRecords.id, input.importRecordId))
    .returning()

  await audit(db, {
    entityType: 'osm_import_record',
    entityId: input.importRecordId,
    action: 'STREET_GEOMETRY_REJECTED',
    newData: { reason: input.reason },
    userId,
  })
  return updated
}

export async function mergeStreetWithOsm(
  db: Database,
  input: { importRecordId: string; targetStreetId: string },
  userId: string,
) {
  await db
    .update(osmImportRecords)
    .set({
      multivusStreetId: input.targetStreetId,
      status: 'MERGED',
    })
    .where(eq(osmImportRecords.id, input.importRecordId))

  return approveOsmGeometry(
    db,
    { streetId: input.targetStreetId, importRecordId: input.importRecordId },
    userId,
  )
}

export async function createStreetFromOsm(
  db: Database,
  input: { importRecordId: string; officialName: string; streetType: string; neighborhoodId?: string | null },
  userId: string,
) {
  const [record] = await db
    .select()
    .from(osmImportRecords)
    .where(eq(osmImportRecords.id, input.importRecordId))
    .limit(1)

  if (!record) throw new Error('Registro de importação OSM não encontrado.')

  const geomRes = await db.execute<{ geometry: unknown }>(sql`
    SELECT ST_AsGeoJSON(geometry)::json AS geometry FROM osm_import_records WHERE id = ${record.id}
  `)
  const geom = rowsOf(geomRes)[0]?.geometry
  if (!geom) throw new Error('Geometria OSM ausente.')

  const street = await createStreet(
    db,
    {
      officialName: input.officialName,
      streetType: input.streetType as CreateStreetInput['streetType'],
      neighborhoodId: input.neighborhoodId ?? null,
      source: 'OpenStreetMap',
      sourceDate: new Date().toISOString().slice(0, 10),
      geometry: geom as CreateStreetInput['geometry'],
    },
    userId,
  )

  if (!street) throw new Error('Falha ao criar rua a partir do OSM.')
  await approveOsmGeometry(db, { streetId: street.id, importRecordId: record.id, geometry: geom }, userId)
  return street
}

export async function markOsmConflict(
  db: Database,
  input: { importRecordId: string; notes?: string },
  userId: string,
) {
  const [updated] = await db
    .update(osmImportRecords)
    .set({
      status: 'CONFLICT',
      reviewedBy: userId,
      reviewedAt: new Date(),
    })
    .where(eq(osmImportRecords.id, input.importRecordId))
    .returning()
  return updated
}

export async function confirmStreetNeighborhood(
  db: Database,
  input: { streetId: string; neighborhoodId: string; source?: string },
  userId: string,
) {
  await db.execute(sql`
    UPDATE streets SET
      neighborhood_id = ${input.neighborhoodId},
      neighborhood_status = 'CONFIRMED',
      neighborhood_source = ${input.source ?? 'Conferência local'}
    WHERE id = ${input.streetId}
  `)

  await audit(db, {
    entityType: 'street',
    entityId: input.streetId,
    action: 'STREET_NEIGHBORHOOD_CONFIRMED',
    newData: input,
    userId,
  })
  return getStreet(db, input.streetId)
}

export async function listAddressPoints(db: Database, streetId: string) {
  const result = await db.execute(sql`
    SELECT
      id,
      street_id AS "streetId",
      number,
      ST_AsGeoJSON(geometry)::json AS geometry,
      source,
      source_date AS "sourceDate",
      verified,
      confidence_score AS "confidenceScore"
    FROM address_points
    WHERE street_id = ${streetId}
    ORDER BY number
  `)
  return rowsOf(result)
}

export async function createAddressPoint(
  db: Database,
  input: CreateAddressPointInput,
  userId: string,
) {
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO address_points (
      street_id, number, geometry, source, source_date, verified, confidence_score
    ) VALUES (
      ${input.streetId}, ${input.number},
      ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326),
      ${input.source ?? 'Conferência local'},
      to_char(now(), 'YYYY-MM-DD'),
      true, 100
    )
    ON CONFLICT (street_id, number) DO UPDATE SET
      geometry = EXCLUDED.geometry,
      source = EXCLUDED.source,
      verified = true,
      confidence_score = 100
    RETURNING id
  `)
  const id = rowsOf(result)[0]?.id
  await audit(db, {
    entityType: 'address_point',
    entityId: id ?? input.streetId,
    action: 'create',
    newData: input,
    userId,
  })
  return { id }
}

export async function createNeighborhood(
  db: Database,
  input: { name: string; source?: string; sourceDate?: string | null },
  userId: string,
) {
  const city = await db.select({ id: cities.id }).from(cities).limit(1)
  const cityId = city[0]?.id
  if (!cityId) throw new Error('Cidade não cadastrada')
  const [created] = await db.insert(neighborhoods).values({
    cityId,
    name: input.name,
    normalizedName: normalizeAddress(input.name),
    source: input.source ?? 'Conferência local',
    sourceDate: input.sourceDate ?? null,
  }).returning()
  await audit(db, { entityType: 'neighborhood', entityId: created?.id ?? input.name, action: 'create', newData: input, userId })
  return created
}

export async function createPlace(
  db: Database,
  input: {
    name: string
    category: string
    latitude?: number | null
    longitude?: number | null
    address?: string | null
    neighborhoodId?: string | null
    description?: string | null
    source?: string
    sourceDate?: string | null
  },
  userId: string,
) {
  const city = await db.select({ id: cities.id }).from(cities).limit(1)
  const cityId = city[0]?.id
  if (!cityId) throw new Error('Cidade não cadastrada')
  const [created] = await db.insert(places).values({
    cityId,
    name: input.name,
    normalizedName: normalizeAddress(input.name),
    category: input.category,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    address: input.address ?? null,
    neighborhoodId: input.neighborhoodId ?? null,
    description: input.description ?? null,
    source: input.source ?? 'Conferência local',
    sourceDate: input.sourceDate ?? null,
    verified: false,
  }).returning({
    id: places.id,
    name: places.name,
    category: places.category,
    latitude: places.latitude,
    longitude: places.longitude,
  })
  await audit(db, { entityType: 'place', entityId: created?.id ?? input.name, action: 'create', newData: input, userId })
  return created
}

export async function createCorrection(db: Database, input: CreateCorrectionInput, userId: string | null) {
  const existing = await db.select().from(mapCorrections).where(eq(mapCorrections.clientRequestId, input.clientRequestId)).limit(1)
  if (existing[0]) return existing[0]
  const [created] = await db.insert(mapCorrections).values({
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    correctionType: input.correctionType,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
    latitude: input.latitude,
    longitude: input.longitude,
    description: input.description,
    status: 'PENDING',
    submittedBy: userId,
    clientRequestId: input.clientRequestId,
  }).returning()
  await audit(db, {
    entityType: 'map_correction',
    entityId: created?.id ?? input.clientRequestId,
    action: 'create',
    newData: { ...input, status: 'PENDING' },
    userId,
  })
  return created
}

export async function listCorrections(db: Database, status?: string) {
  const query = db.select().from(mapCorrections).orderBy(desc(mapCorrections.createdAt)).limit(200)
  if (!status) return query
  return db
    .select()
    .from(mapCorrections)
    .where(eq(mapCorrections.status, status as 'PENDING' | 'APPROVED' | 'REJECTED'))
    .orderBy(desc(mapCorrections.createdAt))
    .limit(200)
}

export async function reviewCorrection(
  db: Database,
  id: string,
  status: 'APPROVED' | 'REJECTED',
  userId: string,
  reason?: string,
) {
  const [current] = await db.select().from(mapCorrections).where(eq(mapCorrections.id, id)).limit(1)
  if (!current) return null
  if (current.status !== 'PENDING') return current
  const [updated] = await db
    .update(mapCorrections)
    .set({ status, reviewedBy: userId, reviewedAt: new Date() })
    .where(eq(mapCorrections.id, id))
    .returning()
  await audit(db, {
    entityType: 'map_correction',
    entityId: id,
    action: status === 'APPROVED' ? 'approve' : 'reject',
    previousData: current,
    newData: { ...updated, reason: reason ?? null },
    userId,
  })
  return updated
}

export async function adminStats(db: Database) {
  const result = await db.execute<{
    pendingCorrections: number
    streets: number
    verifiedStreets: number
    streetsWithoutGeometry: number
    streetsWithoutNeighborhood: number
    streetsWithOldNames: number
    neighborhoods: number
    places: number
    landmarks: number
    localReferences: number
    aliases: number
    users: number
  }>(sql`
    SELECT
      (SELECT count(*) FROM map_corrections WHERE status = 'PENDING')::int AS "pendingCorrections",
      (SELECT count(*) FROM streets WHERE active)::int AS streets,
      (SELECT count(*) FROM streets WHERE active AND verified)::int AS "verifiedStreets",
      (SELECT count(*) FROM streets WHERE active AND geometry IS NULL)::int AS "streetsWithoutGeometry",
      (SELECT count(*) FROM streets WHERE active AND (neighborhood_id IS NULL OR neighborhood_status = 'PENDING'))::int AS "streetsWithoutNeighborhood",
      (SELECT count(DISTINCT street_id) FROM street_aliases WHERE alias_type = 'OLD_NAME')::int AS "streetsWithOldNames",
      (SELECT count(*) FROM neighborhoods WHERE active)::int AS neighborhoods,
      (SELECT count(*) FROM places WHERE active)::int AS places,
      (SELECT count(*) FROM landmarks WHERE active)::int AS landmarks,
      (SELECT count(*) FROM local_references WHERE active)::int AS "localReferences",
      (SELECT count(*) FROM street_aliases)::int AS aliases,
      (SELECT count(*) FROM users WHERE active)::int AS users
  `)

  const topSearches = await db.execute<{ query: string; count: number }>(sql`
    SELECT query, count(*)::int AS count
    FROM search_analytics
    GROUP BY query
    ORDER BY count DESC
    LIMIT 6
  `)

  const topReferences = await db.execute<{ popularPhrase: string; targetStreetName: string | null; confirmationsCount: number }>(sql`
    SELECT lr.popular_phrase AS "popularPhrase", s.official_name AS "targetStreetName", lr.confirmations_count AS "confirmationsCount"
    FROM local_references lr
    LEFT JOIN streets s ON s.id = lr.target_street_id
    WHERE lr.active = true
    ORDER BY lr.confirmations_count DESC
    LIMIT 6
  `)

  const correctionsByType = await db.execute<{ correctionType: string; count: number }>(sql`
    SELECT correction_type AS "correctionType", count(*)::int AS count
    FROM map_corrections
    GROUP BY correction_type
    ORDER BY count DESC
  `)

  return {
    ...rowsOf(result)[0],
    topSearches: rowsOf(topSearches),
    topReferences: rowsOf(topReferences),
    correctionsByType: rowsOf(correctionsByType),
  }
}


export async function listAudit(db: Database) {
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100)
}

export async function createUser(
  db: Database,
  input: { name: string; email: string; phone?: string | null; password: string; role: 'ADMIN' | 'EDITOR' | 'DELIVERY_DRIVER' | 'USER' },
  actorId: string,
) {
  const [created] = await db.insert(users).values({
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone ?? null,
    passwordHash: await hashPassword(input.password),
    role: input.role,
  }).returning({
    id: users.id,
    name: users.name,
    email: users.email,
    phone: users.phone,
    role: users.role,
    active: users.active,
  })
  await audit(db, { entityType: 'user', entityId: created?.id ?? input.email, action: 'create', newData: { ...input, password: undefined }, userId: actorId })
  return created
}

export async function createDelivery(db: Database, input: CreateDeliveryLocationInput, userId: string) {
  const existing = await db.execute<{ id: string }>(sql`
    SELECT id FROM delivery_locations WHERE client_request_id = ${input.clientRequestId}
  `)
  const found = rowsOf(existing)[0]
  if (found) return found
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO delivery_locations (
      customer_name, phone, street_id, street_number, complement, reference,
      latitude, longitude, facade_photo, notes, customer_input, matched_alias,
      verified, created_by, client_request_id
    ) VALUES (
      ${input.customerName ?? null}, ${input.phone ?? null}, ${input.streetId ?? null},
      ${input.streetNumber ?? null}, ${input.complement ?? null}, ${input.reference ?? null},
      ${input.latitude}, ${input.longitude}, ${input.facadePhoto ?? null}, ${input.notes ?? null},
      ${input.customerInput ?? null}, ${input.matchedAlias ?? null},
      false, ${userId}, ${input.clientRequestId}
    )
    RETURNING id, customer_name AS "customerName", latitude, longitude, reference, notes, verified, created_at AS "createdAt"
  `)
  const created = rowsOf(result)[0]
  await audit(db, { entityType: 'delivery_location', entityId: created?.id ?? input.clientRequestId, action: 'create', newData: { ...input, facadePhoto: input.facadePhoto ? '[foto]' : null }, userId })
  return created
}

export async function listDeliveries(db: Database, userId: string, seeAll: boolean) {
  const result = await db.execute(sql`
    SELECT id, customer_name AS "customerName", phone, street_id AS "streetId",
           street_number AS "streetNumber", complement, reference, latitude, longitude,
           notes, verified, created_at AS "createdAt",
           (facade_photo IS NOT NULL) AS "hasPhoto"
    FROM delivery_locations
    WHERE ${seeAll ? sql`true` : sql`created_by = ${userId}`}
    ORDER BY created_at DESC
    LIMIT 200
  `)
  return rowsOf(result)
}

export async function createFavorite(
  db: Database,
  input: {
    streetId?: string | null
    placeId?: string | null
    deliveryLocationId?: string | null
    label: string
    customerInput?: string | null
    matchedAlias?: string | null
    clientRequestId: string
  },
  userId: string,
) {
  const existing = await db.select().from(favorites).where(eq(favorites.clientRequestId, input.clientRequestId)).limit(1)
  if (existing[0]) return existing[0]
  const [created] = await db.insert(favorites).values({
    userId,
    streetId: input.streetId ?? null,
    placeId: input.placeId ?? null,
    deliveryLocationId: input.deliveryLocationId ?? null,
    label: input.label,
    customerInput: input.customerInput ?? null,
    matchedAlias: input.matchedAlias ?? null,
    clientRequestId: input.clientRequestId,
  }).returning()
  return created
}

export async function listFavorites(db: Database, userId: string) {
  return db.select().from(favorites).where(eq(favorites.userId, userId)).orderBy(desc(favorites.createdAt))
}

export async function deleteFavorite(db: Database, id: string, userId: string) {
  const [removed] = await db.delete(favorites).where(and(eq(favorites.id, id), eq(favorites.userId, userId))).returning()
  return removed ?? null
}

export async function rememberSearch(db: Database, userId: string, query: string, streetId?: string | null) {
  const [created] = await db.insert(recentSearches).values({
    userId,
    query,
    streetId: streetId ?? null,
  }).returning()
  return created
}

export async function listRecent(db: Database, userId: string) {
  return db.select().from(recentSearches).where(eq(recentSearches.userId, userId)).orderBy(desc(recentSearches.createdAt)).limit(20)
}

export async function recordSync(db: Database, clientId: string, operation: string, payload: unknown, userId: string) {
  await db.insert(syncQueue).values({
    userId,
    clientId,
    operation,
    payload,
    status: 'SYNCED',
    syncedAt: new Date(),
  }).onConflictDoNothing({ target: syncQueue.clientId })
}

export async function storeRefresh(db: Database, userId: string, jti: string, expiresAt: Date) {
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(jti),
    expiresAt,
  })
}

