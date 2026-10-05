import {
  auditLogs,
  cities,
  favorites,
  mapCorrections,
  neighborhoods,
  places,
  recentSearches,
  refreshTokens,
  streetAliases,
  syncQueue,
  users,
  type Database,
} from '@multivus/database'
import { confidenceOf, describeStreet, normalizeAddress, parseAddressText } from '@multivus/map-core'
import type {
  CreateCorrectionInput,
  CreateDeliveryLocationInput,
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
  s.source,
  s.source_date AS "sourceDate",
  s.active,
  s.notes,
  s.neighborhood_id AS "neighborhoodId",
  n.name AS "neighborhoodName",
  ST_AsGeoJSON(s.geometry)::json AS geometry,
  COALESCE((
    SELECT json_agg(json_build_object('id', a.id, 'alias', a.alias, 'aliasType', a.alias_type) ORDER BY a.alias)
    FROM street_aliases a WHERE a.street_id = s.id
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

export async function listStreets(db: Database, includeInactive = false) {
  const where = includeInactive ? sql`true` : sql`s.active = true`
  const result = await db.execute(sql`
    SELECT ${streetSelect}
    FROM streets s
    LEFT JOIN neighborhoods n ON n.id = s.neighborhood_id
    WHERE ${where}
    ORDER BY s.official_name
  `)
  return rowsOf(result)
}

export async function getStreet(db: Database, id: string) {
  const result = await db.execute(sql`
    SELECT ${streetSelect}
    FROM streets s
    LEFT JOIN neighborhoods n ON n.id = s.neighborhood_id
    WHERE s.id = ${id}
  `)
  return rowsOf(result)[0] ?? null
}

export async function searchCatalog(db: Database, rawQuery: string, limit: number): Promise<SearchResult[]> {
  const term = normalizeAddress(parseAddressText(rawQuery).streetQuery)
  if (term.length < 2) return []
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
  }))

  return [...streetHits, ...placeHits, ...neighborhoodHits].slice(0, limit)
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
      END
    WHERE id = ${id}
  `)
  if (input.aliases?.length) await insertAliases(db, id, input.aliases)
  if (input.verified === true) {
    await db.execute(sql`
      UPDATE street_name_history
      SET verified = true, verified_at = now(), verified_by = ${userId}::uuid, confidence_score = 100
      WHERE street_id = ${id} AND verified = false
    `)
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
  }).returning()
  await recordOldName(db, input.streetId, input.alias, input.aliasType)
  await audit(db, { entityType: 'street_alias', entityId: created?.id ?? input.streetId, action: 'create', newData: input, userId })
  return created
}

export async function createSegment(
  db: Database,
  input: { streetId: string; direction: 'BOTH' | 'FORWARD' | 'BACKWARD'; geometry?: unknown },
  userId: string,
) {
  const geometry = input.geometry ? JSON.stringify(input.geometry) : null
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO street_segments (street_id, direction, geometry)
    VALUES (
      ${input.streetId},
      ${input.direction}::segment_direction,
      CASE WHEN ${geometry}::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON(${geometry}), 4326) END
    )
    RETURNING id
  `)
  const id = rowsOf(result)[0]?.id
  await audit(db, { entityType: 'street_segment', entityId: id ?? input.streetId, action: 'create', newData: input, userId })
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
      from_segment_id, to_segment_id, restriction_type, description, geometry_point, active
    ) VALUES (
      ${input.fromSegmentId},
      ${input.toSegmentId},
      ${input.restrictionType}::restriction_type,
      ${input.description ?? null},
      CASE
        WHEN ${input.latitude ?? null}::float8 IS NULL OR ${input.longitude ?? null}::float8 IS NULL THEN NULL
        ELSE ST_SetSRID(ST_MakePoint(${input.longitude ?? 0}, ${input.latitude ?? 0}), 4326)
      END,
      true
    )
    RETURNING id
  `)
  const id = rowsOf(result)[0]?.id
  await audit(db, { entityType: 'turn_restriction', entityId: id ?? input.fromSegmentId, action: 'create', newData: input, userId })
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
    neighborhoods: number
    places: number
    aliases: number
    users: number
  }>(sql`
    SELECT
      (SELECT count(*) FROM map_corrections WHERE status = 'PENDING')::int AS "pendingCorrections",
      (SELECT count(*) FROM streets WHERE active)::int AS streets,
      (SELECT count(*) FROM streets WHERE active AND verified)::int AS "verifiedStreets",
      (SELECT count(*) FROM streets WHERE active AND geometry IS NULL)::int AS "streetsWithoutGeometry",
      (SELECT count(*) FROM neighborhoods WHERE active)::int AS neighborhoods,
      (SELECT count(*) FROM places WHERE active)::int AS places,
      (SELECT count(*) FROM street_aliases)::int AS aliases,
      (SELECT count(*) FROM users WHERE active)::int AS users
  `)
  return rowsOf(result)[0]
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

