import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { normalizeAddress } from '@multivus/map-core'
import { parseLocalMapFile } from './parser'
import { matchOsmWithMultivus } from './matcher'
import { generateAndSaveReport, loadReport } from './report'
import type { ImportReport, MatchResult, MultivusStreetCandidate } from './types'

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
 * Carrega ruas do banco ou, se indisponível, do seed local
 */
async function loadCandidates(connectionString?: string): Promise<{ candidates: MultivusStreetCandidate[]; pool?: pg.Pool }> {
  const url = connectionString || process.env.DATABASE_URL
  if (url) {
    try {
      const pool = new pg.Pool({ connectionString: url })
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
    } catch {
      // Falha de conexão: fallback para seed
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
 * Salva relatório em data/import/reports/<batchName>.json e na tabela osm_import_records.
 */
export async function importOsm(options: {
  filePath: string
  batchName?: string
  connectionString?: string
}): Promise<{ report: ImportReport; reportPath: string }> {
  loadEnv()
  const batchName = options.batchName || 'santa-juliana'
  const resolvedPath = resolve(process.cwd(), options.filePath)

  console.log(`[map:import] Lendo arquivo cartográfico: ${resolvedPath}`)
  const osmFeatures = await parseLocalMapFile(resolvedPath)
  console.log(`[map:import] ${osmFeatures.length} vias extraídas do OpenStreetMap.`)

  console.log(`[map:import] Carregando cadastro oficial do Multivus Maps...`)
  const { candidates, pool } = await loadCandidates(options.connectionString)
  console.log(`[map:import] ${candidates.length} vias candidatas no Multivus Maps.`)

  console.log(`[map:import] Executando algoritmo de matching em 6 etapas...`)
  const results: MatchResult[] = []

  for (const feat of osmFeatures) {
    const match = matchOsmWithMultivus(feat, candidates)
    results.push(match)
  }

  const { report, filePath } = await generateAndSaveReport(batchName, resolvedPath, results)
  console.log(`[map:import] Relatório gerado com sucesso em: ${filePath}`)

  // Grava staging na tabela osm_import_records se o banco estiver disponível
  if (pool) {
    try {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        // Limpa registros anteriores deste lote
        await client.query('DELETE FROM osm_import_records WHERE batch_name = $1', [batchName])

        for (const res of results) {
          const geomJson = JSON.stringify(res.osmFeature.geometry)
          await client.query(
            `INSERT INTO osm_import_records (
               batch_name, osm_id, source_name, normalized_source_name, street_type,
               geometry, multivus_street_id, match_type, score, status, conflicts, tags
             ) VALUES (
               $1, $2, $3, $4, $5,
               ST_SetSRID(ST_GeomFromGeoJSON($6), 4326),
               $7, $8, $9, 'PENDING', $10, $11
             )`,
            [
              batchName,
              res.osmFeature.osmId,
              res.osmFeature.name,
              res.osmFeature.normalizedName,
              res.osmFeature.streetType ?? null,
              geomJson,
              res.multivusStreetId && !res.multivusStreetId.startsWith('seed-') ? res.multivusStreetId : null,
              res.matchType,
              res.score,
              res.conflicts.length > 0 ? JSON.stringify(res.conflicts) : null,
              JSON.stringify(res.osmFeature.tags),
            ],
          )
        }
        await client.query('COMMIT')
        console.log(`[map:import] ${results.length} registros gravados em osm_import_records no banco de dados.`)
      } catch (err) {
        await client.query('ROLLBACK')
        console.warn(`[map:import] Aviso: falha ao persistir staging no banco:`, err)
      } finally {
        client.release()
      }
    } finally {
      await pool.end()
    }
  }

  return { report, reportPath: filePath }
}

/**
 * 2. PRÉ-VISUALIZAÇÃO
 * Exibe o relatório de importação formatado no terminal
 */
export async function previewReport(batchName: string): Promise<ImportReport> {
  const report = await loadReport(batchName)

  console.log(`\n==================================================`)
  console.log(`RELATÓRIO DE CONFERÊNCIA CARTOGRÁFICA: ${report.batchName.toUpperCase()}`)
  console.log(`Cidade: ${report.city} | Gerado em: ${new Date(report.generatedAt).toLocaleString('pt-BR')}`)
  console.log(`Arquivo fonte: ${report.sourceFile}`)
  console.log(`==================================================\n`)

  console.log(`RESUMO:`)
  console.log(`- Total de vias OSM processadas: ${report.summary.totalOsmFeatures}`)
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
  console.log(`- Para aprovar correspondências exatas com segurança: pnpm map:apply ${batchName} --exact-only`)
  console.log(`- Para revisar e aprovar visualmente no mapa: acesse /admin/mapa`)
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
    approvedIds?: string[]
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
      if (options?.approvedIds?.includes(item.multivus_street_id)) return true
      if (options?.exactOnly) {
        return item.match_type === 'MATCH_EXACT'
      }
      return item.match_type === 'MATCH_EXACT'
    })

    console.log(`[map:apply] Aplicando geometria para ${eligible.length} via(s) aprovada(s)...`)

    for (const item of eligible) {
      const geomJson = JSON.stringify(item.geometry)
      const streetId = item.multivus_street_id!

      // A aprovação desta importação valida a geometria, não o nome nem os números prediais.
      const updateRes = await client.query<{ id: string; official_name: string }>(
        `UPDATE streets
         SET geometry = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
             geometry_source = 'OpenStreetMap',
             geometry_source_date = to_char(now(), 'YYYY-MM-DD'),
             geometry_verified = true
         WHERE id = $2
         RETURNING id, official_name`,
        [geomJson, streetId],
      )

      if (updateRes.rowCount && updateRes.rowCount > 0) {
        appliedCount += 1

        // Cria segmento de rua caso ainda não exista
        await client.query(
          `INSERT INTO street_segments (street_id, geometry, direction, verified, source)
           VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), 'BOTH', false, 'OpenStreetMap')
           ON CONFLICT DO NOTHING`,
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
           WHERE batch_name = $2 AND multivus_street_id = $3`,
          [userId ?? null, batchName, streetId],
        )
      }
    }

    await client.query('COMMIT')
    console.log(`[map:apply] Concluído! ${appliedCount} rua(s) atualizada(s) com geometria OSM e verificadas com score 100.`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }

  return { appliedCount }
}
