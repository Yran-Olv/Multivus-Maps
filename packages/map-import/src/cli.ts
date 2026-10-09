#!/usr/bin/env node
import { applyReport, importOsm, previewReport } from './importer'

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]?.toLowerCase()

  if (!command || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  if (command === 'import') {
    const inputIndex = ['osm', 'geojson', 'pbf'].includes(args[1] ?? '') ? 2 : 1
    const filePath = args[inputIndex] || './data/import/osm/santa-juliana.osm'

    const optionValue = (name: string) => {
      const index = args.indexOf(name)
      return index >= 0 ? args[index + 1] : undefined
    }

    const batchName = filePath
      .split('/')
      .pop()
      ?.replace(/\.(osm|geojson|json|pbf|osm\.pbf|gpkg)$/i, '') || 'santa-juliana'

    await importOsm({
      filePath,
      batchName,
      boundaryFilePath: optionValue('--boundary'),
      reportsDir: optionValue('--report-dir'),
      persistStaging: args.includes('--persist-staging'),
    })
    return
  }

  if (command === 'preview') {
    const batchName = args[1] && !args[1].startsWith('--') ? args[1] : 'santa-juliana'
    const reportDirIndex = args.indexOf('--report-dir')
    await previewReport(batchName, reportDirIndex >= 0 ? args[reportDirIndex + 1] : undefined)
    return
  }

  if (command === 'apply') {
    // Exemplo: pnpm map:apply santa-juliana [--exact-only]
    const batchName = args[1] && !args[1].startsWith('--') ? args[1] : 'santa-juliana'
    const exactOnly = args.includes('--exact-only')
    await applyReport(batchName, { exactOnly })
    return
  }

  console.error(`Comando desconhecido: ${command}`)
  printHelp()
  process.exit(1)
}

function printHelp() {
  console.log(`
Multivus Maps - Importador Cartográfico OpenStreetMap

Uso:
  pnpm map:import [osm|geojson] <arquivo> [opções]   Simula importação (sem gravar no banco)
  pnpm map:preview <lote> [--report-dir <dir>] Visualiza relatório e estatísticas do lote
  pnpm map:apply <lote> [--exact-only]      Sincroniza somente itens já aprovados no painel

Exemplos:
  pnpm map:import osm ./data/import/osm/santa-juliana.osm
  pnpm map:import osm ./data/import/osm/santa-juliana.osm --boundary ./data/import/boundaries/santa-juliana.geojson --report-dir /tmp/map-import
  pnpm map:import osm ./data/import/osm/santa-juliana.osm --boundary ./data/import/boundaries/santa-juliana.geojson --persist-staging
  pnpm map:preview santa-juliana
  pnpm map:apply santa-juliana

  --boundary <arquivo>      Recorta as vias por Polygon/MultiPolygon usando PostGIS
  --report-dir <diretório>  Salva o relatório fora do diretório padrão
  --persist-staging         Grava/atualiza itens de revisão; preserva decisões revisadas
`)
}

main().catch((error) => {
  console.error('Erro na execução do comando:', error)
  process.exit(1)
})
