import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { normalizeAddress } from '@multivus/map-core'
import { parseLocalMapFile } from './parser'
import { matchOsmWithMultivus } from './matcher'
import { generateAndSaveReport, loadReport } from './report'
import type { ImportReport, MatchResult, MultivusStreetCandidate, OsmGeometry } from './types'

function loadEnv(): void {
  if (process.env.DATABASE_URL) return
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'),
  ]
  for (const file of candidates) {
    if (!existsSync(file)) continue
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
  }
}

/**
 * Uses the seed only for an intentional offline preview without DATABASE_URL.
 */
async function loadCandidates(connectionString?: string): Promise<{ candidates: MultivusStreetCandidate[]; pool?: pg.Pool }> {
  const url = connectionString || process.env.DATABASE_URL
  if (url) {
    const pool = new pg.Pool({ connectionString: url })
    try {
      const res = await pool.query<{
        id: string
        official_name: string
        normalized_name: string
        street_type: string
        neighborhood_id: string | null
        neighborhood_name: string | null
        verified: boolean
        confidence_score: number
        geometry: unknown
        aliases: Array<{ alias: string; normalized_alias: string; alias_type: string }>
      }>(`
        SELECT
          s.id,
          s.official_name,
          s.normalized_name,
          s.street_type,
          s.neighborhood_id,
          n.name AS neighborhood_name,
          s.verified,
          s.confidence_score,
          ST_AsGeoJSON(s.geometry)::json AS geometry,
          COALESCE((
            SELECT json_agg(json_build_object(
              'alias', a.alias,
              'normalized_alias', a.normalized_alias,
              'alias_type', a.alias_type
            ))
            FROM street_aliases a
            WHERE a.street_id = s.id AND a.active = true
          ), '[]'::json) AS aliases
        FROM streets s
        LEFT JOIN neighborhoods n ON n.id = s.neighborhood_id
        WHERE s.active = true
        ORDER BY s.official_name
      `)

      const candidates: MultivusStreetCandidate[] = res.rows.map((r) => ({
        id: r.id,
        officialName: r.official_name,
        normalizedName: r.normalized_name,
        streetType: r.street_type,
        neighborhoodId: r.neighborhood_id,
        neighborhoodName: r.neighborhood_name,
        verified: r.verified,
        confidenceScore: r.confidence_score,
        geometry: r.geometry,
        aliases: (r.aliases ?? []).map((a) => ({
          alias: a.alias,
          normalizedAlias: a.normalized_alias,
          aliasType: a.alias_type,
        })),
      }))

      return { candidates, pool }
    } catch (error) {
      await pool.end()
      throw new Error('Não foi possível carregar o cadastro cartográfico do banco configurado.', { cause: error })
    }
  }

  // Fallback: seed local
  const seedPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../data/santa-juliana/streets.seed.json')
  const content = JSON.parse(readFileSync(seedPath, 'utf8')) as {
    streets: Array<{
      officialName: string
      streetType: string
      aliases: Array<{ alias: string; aliasType: string }>
    }>
  }

  const candidates: MultivusStreetCandidate[] = content.streets.map((s, idx) => ({
    id: `seed-${idx}`,
    officialName: s.officialName,
    normalizedName: normalizeAddress(s.officialName),
    streetType: s.streetType,
    verified: false,
    confidenceScore: 70,
    geometry: null,
    aliases: (s.aliases ?? []).map((a) => ({
      alias: a.alias,
      normalizedAlias: normalizeAddress(a.alias),
      aliasType: a.aliasType,
    })),
  }))

  return { candidates }
}

/**
 * 1. IMPORTAÇÃO
 * Executa o importador OSM sem alterar automaticamente as ruas oficiais.
 * Salva um relatório e só persiste no staging quando solicitado explicitamente.
 */
export async function importOsm(options: {
  filePath: string
  batchName?: string
  connectionString?: string
  boundaryFilePath?: string
  persistStaging?: boolean
  reportsDir?: string
}): Promise<{ report: ImportReport; reportPath: string }> {
  loadEnv()
  if (options.persistStaging && !options.boundaryFilePath) {
    throw new Error('A persistência do staging exige o limite municipal em --boundary.')
  }
  const batchName = options.batchName || 'santa-juliana'
  const resolvedPath = resolve(process.cwd(), options.filePath)

  console.log(`[map:import] Lendo arquivo cartográfico: ${resolvedPath}`)
  const inputFeatures = await parseLocalMapFile(resolvedPath)
  console.log(`[map:import] ${inputFeatures.length} vias extraídas do OpenStreetMap.`)

  console.log(`[map:import] Carregando cadastro oficial do Multivus Maps...`)
  const { candidates, pool } = await loadCandidates(options.connectionString)
  console.log(`[map:import] ${candidates.length} vias candidatas no Multivus Maps.`)

  try {
    let osmFeatures = inputFeatures
    let outsideBoundary = 0
    let clippedAtBoundary = 0
    if (options.boundaryFilePath) {
      if (!pool) {
        throw new Error('O recorte por limite municipal requer DATABASE_URL com PostGIS disponível.')
      }
      const clipped = await clipFeaturesToBoundary(inputFeatures, resolve(process.cwd(), options.boundaryFilePath), pool)
      osmFeatures = clipped.features
      outsideBoundary = clipped.outsideBoundary
      clippedAtBoundary = clipped.clippedAtBoundary
    }

    console.log(`[map:import] ${osmFeatures.length} vias após validação/recorte territorial.`)
    console.log(`[map:import] Executando algoritmo de matching em 6 etapas...`)
    const results: MatchResult[] = osmFeatures.map((feature) => matchOsmWithMultivus(feature, candidates))

    const { report, filePath } = await generateAndSaveReport(
      batchName,
      resolvedPath,
      results,
      options.reportsDir,
      options.boundaryFilePath
        ? { inputFeatures: inputFeatures.length, outsideBoundary, clippedAtBoundary }
        : undefined,
    )
    console.log(`[map:import] Relatório gerado em: ${filePath}`)

    if (options.persistStaging) {
      if (!pool) {
        throw new Error('DATABASE_URL é obrigatório para persistir os registros de revisão.')
      }
      await persistStaging(pool, batchName, results)
      console.log(`[map:import] ${results.length} registros atualizados no staging; decisões de revisão existentes foram preservadas.`)
    } else {
      console.log('[map:import] Simulação concluída; nenhum registro foi gravado no banco.')
    }

    return { report, reportPath: filePath }
  } finally {
    await pool?.end()
  }
}

async function clipFeaturesToBoundary(
  features: Awaited<ReturnType<typeof parseLocalMapFile>>,
  boundaryFilePath: string,
  pool: pg.Pool,
): Promise<{ features: typeof features; outsideBoundary: number; clippedAtBoundary: number }> {
  const boundaryDocument = JSON.parse(readFileSync(boundaryFilePath, 'utf8')) as {
    type?: string
    features?: Array<{ geometry?: { type?: string } }>
    geometry?: { type?: string }
  }
  if (boundaryDocument.type === 'FeatureCollection' && boundaryDocument.features?.length !== 1) {
    throw new Error('O GeoJSON de limite deve conter exatamente uma feição municipal.')
  }
  const boundary = boundaryDocument.type === 'FeatureCollection'
    ? boundaryDocument.features?.[0]?.geometry
    : boundaryDocument.type === 'Feature'
      ? (boundaryDocument as { geometry?: { type?: string } }).geometry
      : boundaryDocument
  if (!boundary || !['Polygon', 'MultiPolygon'].includes(boundary.type ?? '')) {
    throw new Error('O arquivo de limite deve conter uma geometria Polygon ou MultiPolygon em GeoJSON.')
  }

  const boundaryCheck = await pool.query<{ valid: boolean }>(
    `SELECT ST_IsValid(geom)
       AND GeometryType(geom) IN ('POLYGON', 'MULTIPOLYGON')
       AND ST_XMin(Box3D(geom)) >= -180
       AND ST_XMax(Box3D(geom)) <= 180
       AND ST_YMin(Box3D(geom)) >= -90
       AND ST_YMax(Box3D(geom)) <= 90 AS valid
     FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom) AS boundary`,
    [JSON.stringify(boundary)],
  )
  if (boundaryCheck.rows[0]?.valid !== true) {
    throw new Error('O limite municipal GeoJSON é inválido segundo o PostGIS.')
  }

  const rows = await pool.query<{ osm_id: string; geometry: OsmGeometry | null; fully_inside: boolean }>(
    `WITH boundary AS (
       SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
     ), validation AS (
       SELECT geom
       FROM boundary
       WHERE ST_IsValid(geom)
         AND GeometryType(geom) IN ('POLYGON', 'MULTIPOLYGON')
     ), source AS (
       SELECT osm_id, ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326) AS geom
       FROM jsonb_to_recordset($2::jsonb) AS item(osm_id text, geometry jsonb)
     ), clipped AS (
       SELECT source.osm_id,
         ST_CoveredBy(source.geom, validation.geom) AS fully_inside,
         ST_Multi(ST_CollectionExtract(ST_Intersection(source.geom, validation.geom), 2)) AS geom
       FROM source
       CROSS JOIN validation
       WHERE ST_IsValid(source.geom)
         AND GeometryType(source.geom) IN ('LINESTRING', 'MULTILINESTRING')
         AND ST_Intersects(source.geom, validation.geom)
     )
     SELECT osm_id, fully_inside, ST_AsGeoJSON(geom)::json AS geometry
     FROM clipped
     WHERE NOT ST_IsEmpty(geom) AND ST_IsValid(geom)`,
    [
      JSON.stringify(boundary),
      JSON.stringify(features.map((feature) => ({ osm_id: feature.osmId, geometry: feature.geometry }))),
    ],
  )
  if (rows.rowCount === null) {
    throw new Error('O PostGIS não retornou a contagem de vias recortadas.')
  }
  const clipped = new Map(rows.rows.map((row) => [row.osm_id, row.geometry]))
  const result = features.flatMap((feature) => {
    const geometry = clipped.get(feature.osmId)
    return geometry ? [{ ...feature, geometry }] : []
  })
  return {
    features: result,
    outsideBoundary: features.length - rows.rows.length,
    clippedAtBoundary: rows.rows.filter((row) => !row.fully_inside).length,
  }
}

async function persistStaging(pool: pg.Pool, batchName: string, results: MatchResult[]): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const result of results) {
      await client.query(
        `INSERT INTO osm_import_records (
           batch_name, osm_id, source_name, normalized_source_name, street_type,
           geometry, multivus_street_id, match_type, score, status, conflicts, tags
         ) VALUES (
           $1, $2, $3, $4, $5,
           ST_SetSRID(ST_GeomFromGeoJSON($6), 4326),
           $7, $8, $9, 'PENDING', $10, $11
         )
         ON CONFLICT (batch_name, osm_id) WHERE osm_id IS NOT NULL
         DO UPDATE SET
           source_name = EXCLUDED.source_name,
           normalized_source_name = EXCLUDED.normalized_source_name,
           street_type = EXCLUDED.street_type,
           geometry = EXCLUDED.geometry,
           multivus_street_id = EXCLUDED.multivus_street_id,
           match_type = EXCLUDED.match_type,
           score = EXCLUDED.score,
           conflicts = EXCLUDED.conflicts,
           tags = EXCLUDED.tags,
           status = CASE
             WHEN osm_import_records.status IN ('APPROVED', 'REJECTED', 'MERGED', 'CONFLICT')
               AND ST_Equals(osm_import_records.geometry, EXCLUDED.geometry)
               AND osm_import_records.tags = EXCLUDED.tags
               AND osm_import_records.source_name = EXCLUDED.source_name
               AND osm_import_records.multivus_street_id IS NOT DISTINCT FROM EXCLUDED.multivus_street_id
             THEN osm_import_records.status
             ELSE 'PENDING'
           END,
           reviewed_by = CASE
             WHEN ST_Equals(osm_import_records.geometry, EXCLUDED.geometry)
               AND osm_import_records.tags = EXCLUDED.tags
               AND osm_import_records.source_name = EXCLUDED.source_name
               AND osm_import_records.multivus_street_id IS NOT DISTINCT FROM EXCLUDED.multivus_street_id
             THEN osm_import_records.reviewed_by
             ELSE NULL
           END,
           reviewed_at = CASE
             WHEN ST_Equals(osm_import_records.geometry, EXCLUDED.geometry)
               AND osm_import_records.tags = EXCLUDED.tags
               AND osm_import_records.source_name = EXCLUDED.source_name
               AND osm_import_records.multivus_street_id IS NOT DISTINCT FROM EXCLUDED.multivus_street_id
             THEN osm_import_records.reviewed_at
             ELSE NULL
           END`,
        [
          batchName,
          result.osmFeature.osmId,
          result.osmFeature.name,
          result.osmFeature.normalizedName,
          result.osmFeature.streetType ?? null,
          JSON.stringify(result.osmFeature.geometry),
          result.multivusStreetId && !result.multivusStreetId.startsWith('seed-') ? result.multivusStreetId : null,
          result.matchType,
          result.score,
          result.conflicts.length > 0 ? JSON.stringify(result.conflicts) : null,
          JSON.stringify(result.osmFeature.tags),
        ],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * 2. PRÉ-VISUALIZAÇÃO
 * Exibe o relatório de importação formatado no terminal
 */
export async function previewReport(batchName: string, reportsDir?: string): Promise<ImportReport> {
  const report = await loadReport(batchName, reportsDir)

  console.log(`\n==================================================`)
  console.log(`RELATÓRIO DE CONFERÊNCIA CARTOGRÁFICA: ${report.batchName.toUpperCase()}`)
  console.log(`Cidade: ${report.city} | Gerado em: ${new Date(report.generatedAt).toLocaleString('pt-BR')}`)
  console.log(`Arquivo fonte: ${report.sourceFile}`)
  console.log(`==================================================\n`)

  console.log(`RESUMO:`)
  console.log(`- Total de vias OSM processadas: ${report.summary.totalOsmFeatures}`)
  if (report.processing) {
    console.log(`- Feições lidas: ${report.processing.inputFeatures}`)
    console.log(`- Fora do limite municipal: ${report.processing.outsideBoundary}`)
    console.log(`- Recortadas no limite municipal: ${report.processing.clippedAtBoundary}`)
  }
  console.log(`  ✓ MATCH_EXACT  (Correspondência oficial exata): ${report.summary.exact}`)
  console.log(`  ✓ MATCH_ALIAS  (Correspondência via nome antigo/popular): ${report.summary.alias}`)
  console.log(`  ~ MATCH_FUZZY  (Correspondência aproximada / digitação): ${report.summary.fuzzy}`)
  console.log(`  ⚠ CONFLICT     (Conflito / múltiplas opções): ${report.summary.conflict}`)
  console.log(`  + NEW_STREET   (Nova via detectada no OSM): ${report.summary.newStreet}`)
  console.log(`  ? UNRESOLVED   (Sem nome / indeterminado): ${report.summary.unresolved}\n`)

  console.log(`AMOSTRA DE CORRESPONDÊNCIAS EXATAS (MATCH_EXACT):`)
  const exactSample = report.items.filter((i) => i.match_type === 'MATCH_EXACT').slice(0, 8)
  for (const item of exactSample) {
    console.log(`  ✓ [OSM] "${item.source_name}" -> [Multivus] "${item.multivus_name}" (score: ${item.score}%)`)
  }

  console.log(`\nAMOSTRA DE CORRESPONDÊNCIAS POR ALIAS / NOME ANTIGO (MATCH_ALIAS):`)
  const aliasSample = report.items.filter((i) => i.match_type === 'MATCH_ALIAS').slice(0, 8)
  for (const item of aliasSample) {
    console.log(`  🔄 [OSM] "${item.source_name}" -> [Multivus] "${item.multivus_name}" via alias "${item.matched_alias}" (score: ${item.score}%)`)
  }

  if (report.summary.conflict > 0) {
    console.log(`\nCONFLITOS RELEVANTES PARA REVISÃO NO PAINEL (/admin/mapa):`)
    const conflictSample = report.items.filter((i) => i.match_type === 'CONFLICT').slice(0, 5)
    for (const item of conflictSample) {
      console.log(`  ⚠ [OSM] "${item.source_name}" tem múltiplos candidatos:`)
      for (const conf of item.conflicts) {
        console.log(`     - "${conf.candidateName}" (${conf.reason})`)
      }
    }
  }

  console.log(`\nPróximo passo:`)
  console.log(`- Revise cada geometria e aprove os candidatos no painel /admin/mapa antes de aplicar.`)
  console.log(`- Depois da revisão, opcionalmente sincronize os itens aprovados: pnpm map:apply ${batchName}`)
  console.log(`==================================================\n`)

  return report
}

/**
 * 3. APLICAÇÃO DE GEOMETRIAS
 * Aplica as geometrias verificadas às ruas no banco oficial e gera auditoria
 */
export async function applyReport(
  batchName: string,
  options?: {
    exactOnly?: boolean
    connectionString?: string
    userId?: string
  },
): Promise<{ appliedCount: number }> {
  loadEnv()
  const report = await loadReport(batchName)
  const connectionString = options?.connectionString || process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL ausente para aplicar geometrias no banco.')
  }

  const pool = new pg.Pool({ connectionString })
  const client = await pool.connect()
  let appliedCount = 0

  try {
    await client.query('BEGIN')

    // Usuário administrador para auditoria
    let userId = options?.userId
    if (!userId) {
      const adminRes = await client.query<{ id: string }>('SELECT id FROM users WHERE role = $1 ORDER BY created_at LIMIT 1', ['ADMIN'])
      userId = adminRes.rows[0]?.id
    }

    const eligible = report.items.filter((item) => {
      if (!item.multivus_street_id || item.multivus_street_id.startsWith('seed-')) return false
      return !options?.exactOnly || item.match_type === 'MATCH_EXACT'
    })

    console.log(`[map:apply] Conferindo ${eligible.length} candidato(s) para sincronizar; somente itens já aprovados serão aplicados...`)

    for (const item of eligible) {
      const geomJson = JSON.stringify(item.geometry)
      const streetId = item.multivus_street_id!
      const review = await client.query<{ status: string; multivus_street_id: string | null }>(
        `SELECT status, multivus_street_id
         FROM osm_import_records
         WHERE batch_name = $1 AND osm_id = $2`,
        [batchName, item.osm_id],
      )
      if (review.rows[0]?.status !== 'APPROVED' || review.rows[0].multivus_street_id !== streetId) {
        continue
      }

      const updateRes = await client.query<{ id: string; official_name: string }>(
        `UPDATE streets
         SET geometry = ST_Multi(ST_CollectionExtract(
               CASE
                 WHEN streets.geometry IS NULL THEN imported.geometry
                 ELSE ST_UnaryUnion(ST_Collect(streets.geometry, imported.geometry))
               END,
               2
             )),
             geometry_source = CASE
               WHEN streets.geometry IS NULL OR streets.geometry_source = 'OpenStreetMap'
                 THEN 'OpenStreetMap'
               ELSE 'Múltiplas fontes'
             END,
             geometry_source_date = to_char(now(), 'YYYY-MM-DD'),
             geometry_verified = true
         FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geometry) imported
         WHERE id = $2
         RETURNING id, official_name`,
        [geomJson, streetId],
      )

      if (updateRes.rowCount && updateRes.rowCount > 0) {
        appliedCount += 1

        // Cria segmento de rua caso ainda não exista
        await client.query(
          `INSERT INTO street_segments (street_id, geometry, direction, verified, source)
           SELECT $1, imported.geometry, 'BOTH', false, 'OpenStreetMap'
           FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($2), 4326) AS geometry) imported
           WHERE NOT EXISTS (
             SELECT 1
             FROM street_segments existing
             WHERE existing.street_id = $1
               AND ST_Equals(existing.geometry, imported.geometry)
           )`,
          [streetId, geomJson],
        )

        // Registra histórico na tabela audit_logs
        await client.query(
          `INSERT INTO audit_logs (entity_type, entity_id, action, new_data, user_id)
           VALUES ($1, $2, 'STREET_GEOMETRY_APPROVED', $3, $4)`,
          [
            'street',
            streetId,
            JSON.stringify({
              action: 'STREET_GEOMETRY_APPROVED',
              source: 'OpenStreetMap',
              osm_id: item.osm_id,
              source_name: item.source_name,
              official_name: updateRes.rows[0]?.official_name,
              match_type: item.match_type,
              score: item.score,
            }),
            userId ?? null,
          ],
        )

        // Atualiza status do registro de importação
        await client.query(
          `UPDATE osm_import_records
           SET status = 'APPROVED', reviewed_by = $1, reviewed_at = now()
           WHERE batch_name = $2 AND osm_id = $3 AND status = 'APPROVED'`,
          [userId ?? null, batchName, item.osm_id],
        )
      }
    }

    await client.query('COMMIT')
    console.log(`[map:apply] Concluído. ${appliedCount} geometria(s) sincronizada(s) após aprovação humana.`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }

  return { appliedCount }
}
