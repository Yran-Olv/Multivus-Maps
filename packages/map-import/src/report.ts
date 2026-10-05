import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import type { ImportReport, ImportReportItem, MatchResult } from './types'

/**
 * Cria relatório a partir dos resultados de matching e salva em data/import/reports/<batchName>.json
 */
export async function generateAndSaveReport(
  batchName: string,
  sourceFile: string,
  results: MatchResult[],
  reportsDir?: string,
): Promise<{ report: ImportReport; filePath: string }> {
  const targetDir = reportsDir || resolve(process.cwd(), 'data/import/reports')
  await mkdir(targetDir, { recursive: true })

  const items: ImportReportItem[] = results.map((r) => ({
    source_name: r.osmFeature.name,
    multivus_name: r.multivusOfficialName,
    match_type: r.matchType,
    score: r.score,
    action: r.action,
    conflicts: r.conflicts,
    osm_id: r.osmFeature.osmId,
    street_type: r.osmFeature.streetType,
    matched_alias: r.matchedAlias,
    multivus_street_id: r.multivusStreetId,
    geometry: r.osmFeature.geometry,
  }))

  const summary = {
    totalOsmFeatures: results.length,
    exact: results.filter((r) => r.matchType === 'MATCH_EXACT').length,
    alias: results.filter((r) => r.matchType === 'MATCH_ALIAS').length,
    fuzzy: results.filter((r) => r.matchType === 'MATCH_FUZZY').length,
    conflict: results.filter((r) => r.matchType === 'CONFLICT').length,
    newStreet: results.filter((r) => r.matchType === 'NEW_STREET').length,
    unresolved: results.filter((r) => r.matchType === 'UNRESOLVED').length,
  }

  const report: ImportReport = {
    batchName,
    city: 'Santa Juliana',
    sourceFile,
    generatedAt: new Date().toISOString(),
    summary,
    items,
  }

  const filePath = resolve(targetDir, `${batchName}.json`)
  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf8')

  return { report, filePath }
}

/**
 * Carrega relatório existente
 */
export async function loadReport(batchName: string, reportsDir?: string): Promise<ImportReport> {
  const targetDir = reportsDir || resolve(process.cwd(), 'data/import/reports')
  const filePath = resolve(targetDir, `${batchName}.json`)
  if (!existsSync(filePath)) {
    throw new Error(`Relatório não encontrado: ${filePath}`)
  }
  const content = await readFile(filePath, 'utf8')
  return JSON.parse(content) as ImportReport
}
