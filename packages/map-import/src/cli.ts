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
    // Exemplo: pnpm map:import osm ./data/import/osm/santa-juliana.osm
    let filePath = ''
    if (args[1] === 'osm' || args[1] === 'geojson' || args[1] === 'pbf') {
      filePath = args[2] || ''
    } else {
      filePath = args[1] || ''
    }

    if (!filePath) {
      filePath = './data/import/osm/santa-juliana.osm'
    }

    const batchName = filePath
      .split('/')
      .pop()
      ?.replace(/\.(osm|geojson|json|pbf|osm\.pbf|gpkg)$/i, '') || 'santa-juliana'

    await importOsm({
      filePath,
      batchName,
    })
    return
  }

  if (command === 'preview') {
    // Exemplo: pnpm map:preview santa-juliana
    const batchName = args[1] || 'santa-juliana'
    await previewReport(batchName)
    return
  }

  if (command === 'apply') {
    // Exemplo: pnpm map:apply santa-juliana [--exact-only]
    const batchName = args[1] && !args[1].startsWith('--') ? args[1] : 'santa-juliana'
    const exactOnly = args.includes('--exact-only') || true // por padrão preserva segurança e aplica exatas
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
  pnpm map:import [osm|geojson] <arquivo>   Importa e gera relatório de matching
  pnpm map:preview <lote>                   Visualiza relatório e estatísticas do lote
  pnpm map:apply <lote> [--exact-only]      Aplica geometrias verificadas ao banco oficial

Exemplos:
  pnpm map:import osm ./data/import/osm/santa-juliana.osm
  pnpm map:preview santa-juliana
  pnpm map:apply santa-juliana
`)
}

main().catch((error) => {
  console.error('Erro na execução do comando:', error)
  process.exit(1)
})
