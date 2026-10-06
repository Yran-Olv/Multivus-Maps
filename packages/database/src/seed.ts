import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hash } from '@node-rs/argon2'
import { normalizeAddress } from '@multivus/map-core'
import pg from 'pg'

type StreetSeed = {
  officialName: string
  streetType: string
  source: string
  sourceDate: string
  verified: boolean
  geometry: null
  aliases: Array<{ alias: string; aliasType: 'OLD_NAME' | 'POPULAR_NAME' | 'ABBREVIATION' | 'OTHER' }>
}

type NeighborhoodSeed = {
  name: string
  source: string
  sourceDate: string
  verified: boolean
  geometry: null
  active: boolean
}

type PlaceSeed = {
  name: string
  category: string
  source: string
  sourceDate: string
  verified: boolean
  latitude: null
  longitude: null
  aliases?: Array<{ alias: string; aliasType: string }>
}

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../data/santa-juliana')

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(resolve(dataDir, name), 'utf8')) as T
}

export async function seed(connectionString: string): Promise<void> {
  const pool = new pg.Pool({ connectionString })
  const client = await pool.connect()
  try {
    const cityFile = await readJson<{
      name: string
      state: string
      country: string
      centerLat: number
      centerLng: number
      centerSource: string
    }>('city.seed.json')
    const streetFile = await readJson<{ streets: StreetSeed[] }>('streets.seed.json')
    const neighborhoodFile = await readJson<{ neighborhoods: NeighborhoodSeed[] }>('neighborhoods.seed.json')
    const placeFile = await readJson<{ places: PlaceSeed[] }>('places.seed.json')

    await client.query('BEGIN')
    const city = await client.query<{ id: string }>(
      `INSERT INTO cities (name, state, country, center_lat, center_lng, center_source)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name, state) DO UPDATE
         SET center_source = EXCLUDED.center_source
       RETURNING id`,
      [cityFile.name, cityFile.state, cityFile.country, cityFile.centerLat, cityFile.centerLng, cityFile.centerSource],
    )
    const cityId = city.rows[0]?.id
    if (!cityId) throw new Error('Cidade não inserida')

    for (const neighborhood of neighborhoodFile.neighborhoods) {
      await client.query(
        `INSERT INTO neighborhoods (city_id, name, normalized_name, geometry, source, source_date, active)
         VALUES ($1, $2, $3, NULL, $4, $5, $6)
         ON CONFLICT (city_id, normalized_name) DO NOTHING`,
        [
          cityId,
          neighborhood.name,
          normalizeAddress(neighborhood.name),
          neighborhood.source,
          neighborhood.sourceDate,
          neighborhood.active,
        ],
      )
    }

    for (const street of streetFile.streets) {
      if (street.geometry !== null || street.verified !== false) {
        throw new Error(`Seed inválido para ${street.officialName}`)
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO streets (
           city_id, official_name, normalized_name, street_type, geometry, source, source_date, verified, confidence_score, active
         ) VALUES ($1, $2, $3, $4, NULL, $5, $6, false, 70, true)
         ON CONFLICT (city_id, normalized_name) DO UPDATE
           SET official_name = EXCLUDED.official_name,
               street_type = EXCLUDED.street_type,
               source = EXCLUDED.source,
               source_date = EXCLUDED.source_date
           WHERE streets.verified = false
         RETURNING id`,
        [
          cityId,
          street.officialName,
          normalizeAddress(street.officialName),
          street.streetType,
          street.source,
          street.sourceDate,
        ],
      )
      let streetId = inserted.rows[0]?.id
      if (!streetId) {
        const existing = await client.query<{ id: string }>(
          'SELECT id FROM streets WHERE city_id = $1 AND normalized_name = $2',
          [cityId, normalizeAddress(street.officialName)],
        )
        streetId = existing.rows[0]?.id
      }
      if (!streetId) continue
      for (const alias of street.aliases) {
        await client.query(
          `INSERT INTO street_aliases (street_id, alias, normalized_alias, alias_type)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (street_id, normalized_alias, alias_type) DO NOTHING`,
          [streetId, alias.alias, normalizeAddress(alias.alias), alias.aliasType],
        )
        if (alias.aliasType === 'OLD_NAME') {
          await client.query(
            `INSERT INTO street_name_history (
               street_id, old_name, new_name, source, source_date, verified, confidence_score
             )
             SELECT $1, $2, $3, $4, $5, false, 70
             WHERE NOT EXISTS (
               SELECT 1 FROM street_name_history
               WHERE street_id = $1 AND old_name = $2 AND new_name = $3
             )`,
            [streetId, alias.alias, street.officialName, street.source, street.sourceDate],
          )
        }
      }
    }

    for (const place of placeFile.places) {
      const popular = (place.aliases ?? []).map((alias) => alias.alias).join(', ')
      const description = popular ? `Também conhecido como: ${popular}` : null
      await client.query(
        `INSERT INTO places (
           city_id, name, normalized_name, category, latitude, longitude, description, source, source_date, verified, active
         )
         SELECT $1, $2, $3, $4, NULL, NULL, $5, $6, $7, false, true
         WHERE NOT EXISTS (
           SELECT 1 FROM places WHERE city_id = $1 AND normalized_name = $3
         )`,
        [
          cityId,
          place.name,
          normalizeAddress(place.name),
          place.category,
          description,
          place.source,
          place.sourceDate,
        ],
      )
    }

    try {
      const landmarkFile = await readJson<{
        landmarks: Array<{
          name: string
          category: string
          aliases: string[]
          streetName?: string
          streetNumber?: string
          address?: string
          description?: string
          latitude?: number
          longitude?: number
          verified: boolean
          confidenceScore: number
          importanceScore?: number
          source?: string
        }>
      }>('landmarks.seed.json')

      for (const lm of landmarkFile.landmarks) {
        let streetId: string | null = null
        if (lm.streetName) {
          const streetRes = await client.query<{ id: string }>(
            `SELECT id FROM streets WHERE city_id = $1 AND normalized_name = $2 LIMIT 1`,
            [cityId, normalizeAddress(lm.streetName)],
          )
          streetId = streetRes.rows[0]?.id ?? null
        }

        const pointGeo = lm.latitude && lm.longitude
          ? `ST_SetSRID(ST_MakePoint(${lm.longitude}, ${lm.latitude}), 4326)`
          : 'NULL'

        const existingLm = await client.query<{ id: string }>(
          `SELECT id FROM landmarks WHERE city_id = $1 AND normalized_name = $2 LIMIT 1`,
          [cityId, normalizeAddress(lm.name)],
        )

        if (existingLm.rows[0]) {
          await client.query(
            `UPDATE landmarks SET
               category = $1,
               aliases = $2::jsonb,
               street_id = $3,
               street_number = $4,
               address = $5,
               description = $6,
               latitude = $7,
               longitude = $8,
               geometry = ${pointGeo},
               verified = $9,
               confidence_score = $10,
               importance_score = $11,
               source = $12,
               updated_at = now()
             WHERE id = $13`,
            [
              lm.category,
              JSON.stringify(lm.aliases ?? []),
              streetId,
              lm.streetNumber ?? null,
              lm.address ?? null,
              lm.description ?? null,
              lm.latitude ?? null,
              lm.longitude ?? null,
              lm.verified ?? false,
              lm.confidenceScore ?? 70,
              lm.importanceScore ?? 70,
              lm.source ?? 'manual',
              existingLm.rows[0].id,
            ],
          )
        } else {
          await client.query(
            `INSERT INTO landmarks (
               city_id, name, normalized_name, category, aliases, street_id, street_number,
               address, description, latitude, longitude, geometry, verified, confidence_score,
               importance_score, source
             )
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, ${pointGeo}, $12, $13, $14, $15)`,
            [
              cityId,
              lm.name,
              normalizeAddress(lm.name),
              lm.category,
              JSON.stringify(lm.aliases ?? []),
              streetId,
              lm.streetNumber ?? null,
              lm.address ?? null,
              lm.description ?? null,
              lm.latitude ?? null,
              lm.longitude ?? null,
              lm.verified ?? false,
              lm.confidenceScore ?? 70,
              lm.importanceScore ?? 70,
              lm.source ?? 'manual',
            ],
          )
        }
      }
    } catch (e) {
      console.warn('Aviso: landmarks.seed.json não encontrado ou erro:', e)
    }

    try {
      const refFile = await readJson<{
        references: Array<{
          popularPhrase: string
          relationType: string
          targetStreetName?: string
          landmarkName?: string
          description?: string
          confirmationsCount: number
          confidenceScore: number
          verified: boolean
        }>
      }>('local-references.seed.json')

      for (const ref of refFile.references) {
        let targetStreetId: string | null = null
        if (ref.targetStreetName) {
          const streetRes = await client.query<{ id: string }>(
            `SELECT id FROM streets WHERE city_id = $1 AND normalized_name = $2 LIMIT 1`,
            [cityId, normalizeAddress(ref.targetStreetName)],
          )
          targetStreetId = streetRes.rows[0]?.id ?? null
        }

        let landmarkId: string | null = null
        if (ref.landmarkName) {
          const lmRes = await client.query<{ id: string }>(
            `SELECT id FROM landmarks WHERE city_id = $1 AND normalized_name = $2 LIMIT 1`,
            [cityId, normalizeAddress(ref.landmarkName)],
          )
          landmarkId = lmRes.rows[0]?.id ?? null
        }

        const existingRef = await client.query<{ id: string }>(
          `SELECT id FROM local_references WHERE city_id = $1 AND normalized_phrase = $2 LIMIT 1`,
          [cityId, normalizeAddress(ref.popularPhrase)],
        )

        if (existingRef.rows[0]) {
          await client.query(
            `UPDATE local_references SET
               relation_type = $1,
               target_street_id = $2,
               landmark_id = $3,
               description = $4,
               confirmations_count = $5,
               confidence_score = $6,
               verified = $7,
               updated_at = now()
             WHERE id = $8`,
            [
              ref.relationType,
              targetStreetId,
              landmarkId,
              ref.description ?? null,
              ref.confirmationsCount ?? 1,
              ref.confidenceScore ?? 70,
              ref.verified ?? false,
              existingRef.rows[0].id,
            ],
          )
        } else {
          await client.query(
            `INSERT INTO local_references (
               city_id, popular_phrase, normalized_phrase, relation_type,
               target_street_id, landmark_id, description, confirmations_count, confidence_score, verified
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              cityId,
              ref.popularPhrase,
              normalizeAddress(ref.popularPhrase),
              ref.relationType,
              targetStreetId,
              landmarkId,
              ref.description ?? null,
              ref.confirmationsCount ?? 1,
              ref.confidenceScore ?? 70,
              ref.verified ?? false,
            ],
          )
        }
      }
    } catch (e) {
      console.warn('Aviso: local-references.seed.json não encontrado ou erro:', e)
    }


    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD
    if (adminEmail && adminPassword) {
      const passwordHash = await hash(adminPassword)
      await client.query(
        `INSERT INTO users (name, email, password_hash, role, active)
         VALUES ($1, $2, $3, 'ADMIN', true)
         ON CONFLICT (email) DO NOTHING`,
        [process.env.ADMIN_NAME ?? 'Administrador', adminEmail.toLowerCase(), passwordHash],
      )
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

const ranDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  && fileURLToPath(import.meta.url).endsWith('seed.ts')

function loadEnv(): void {
  if (process.env.DATABASE_URL) return
  const candidates = [resolve(process.cwd(), '.env'), resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env')]
  for (const file of candidates) {
    try {
      const content = readFileSync(file, 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq === -1) continue
        const key = trimmed.slice(0, eq).trim()
        const value = trimmed.slice(eq + 1).trim()
        if (process.env[key] === undefined) process.env[key] = value
      }
      return
    } catch {
      // ignore
    }
  }
}

if (ranDirectly) {
  loadEnv()
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL ausente. Copie .env.example para .env.')
    process.exit(1)
  }
  await seed(connectionString)
  console.log('Seed de Santa Juliana aplicado.')
}
