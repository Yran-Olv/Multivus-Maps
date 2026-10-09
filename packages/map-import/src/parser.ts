import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import { normalizeAddress } from '@multivus/map-core'
import type { OsmGeometry, OsmStreetFeature } from './types'

const EXCLUDED_HIGHWAYS = new Set(['proposed', 'construction', 'platform', 'steps', 'footway', 'path', 'cycleway', 'abandoned'])

function isValidCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === 'number'
    && typeof value[1] === 'number'
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90
}

function validateLineCoordinates(geometry: OsmGeometry, osmId: string): void {
  const lines = geometry.type === 'LineString'
    ? [geometry.coordinates as [number, number][]]
    : geometry.coordinates as [number, number][][]
  if (lines.some((line) => line.length < 2 || line.some((point) => !isValidCoordinate(point)))) {
    throw new Error(`Geometria inválida ou fora do intervalo WGS84 na feição ${osmId}.`)
  }
}

/**
 * Detecta o tipo do logradouro a partir do nome
 */
function extractStreetType(name: string): string {
  const trimmed = name.trim().toLowerCase()
  if (/^av\b|^avenida\b/.test(trimmed)) return 'AVENIDA'
  if (/^al\b|^alameda\b/.test(trimmed)) return 'ALAMEDA'
  if (/^beco\b/.test(trimmed)) return 'BECO'
  if (/^travessa\b|^tv\b/.test(trimmed)) return 'TRAVESSA'
  if (/^rodovia\b|^rod\b/.test(trimmed)) return 'RODOVIA'
  if (/^praca\b|^praça\b|^pca\b/.test(trimmed)) return 'PRAÇA'
  return 'RUA'
}

/**
 * Lê e analisa arquivo local (.osm, .geojson ou .json)
 */
export async function parseLocalMapFile(filePath: string): Promise<OsmStreetFeature[]> {
  if (!existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`)
  }

  const ext = extname(filePath).toLowerCase()

  if (ext === '.osm' || filePath.endsWith('.osm.xml')) {
    const xmlContent = await readFile(filePath, 'utf8')
    return parseOsmXml(xmlContent)
  }

  if (ext === '.geojson' || ext === '.json') {
    const jsonContent = await readFile(filePath, 'utf8')
    return parseGeoJson(jsonContent)
  }

  if (filePath.endsWith('.osm.pbf')) {
    // Se o usuário passou .osm.pbf, verifica se existe versão .osm ou .geojson correspondente no mesmo diretório
    const altOsm = filePath.replace(/\.osm\.pbf$/i, '.osm')
    const altGeoJson = filePath.replace(/\.osm\.pbf$/i, '.geojson')
    if (existsSync(altOsm)) {
      const content = await readFile(altOsm, 'utf8')
      return parseOsmXml(content)
    }
    if (existsSync(altGeoJson)) {
      const content = await readFile(altGeoJson, 'utf8')
      return parseGeoJson(content)
    }
    // Tenta decodificar o arquivo PBF
    return parseOsmPbfBuffer(await readFile(filePath))
  }

  if (ext === '.gpkg') {
    // GeoPackage fallback
    const altGeoJson = filePath.replace(/\.gpkg$/i, '.geojson')
    if (existsSync(altGeoJson)) {
      const content = await readFile(altGeoJson, 'utf8')
      return parseGeoJson(content)
    }
    throw new Error(`Para arquivos .gpkg, forneça o GeoJSON exportado ou converta para .osm/.geojson.`)
  }

  // Tenta parse como GeoJSON primeiro, depois OSM XML
  const content = await readFile(filePath, 'utf8')
  if (content.trim().startsWith('{')) {
    return parseGeoJson(content)
  }
  return parseOsmXml(content)
}

/**
 * Parser de OSM XML nativo (.osm)
 */
export function parseOsmXml(xml: string): OsmStreetFeature[] {
  const nodes = new Map<string, [number, number]>()
  const features: OsmStreetFeature[] = []

  // Extrai nós: <node id="123" ... lat="-19.30" lon="-47.52" ...>
  // Suporta tanto formato com tags filhas quanto auto-fechamento
  const nodeRegex = /<node\s+[^>]*?id="(\d+)"[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"/g
  let nodeMatch: RegExpExecArray | null
  while ((nodeMatch = nodeRegex.exec(xml)) !== null) {
    const id = nodeMatch[1]!
    const lat = Number(nodeMatch[2])
    const lon = Number(nodeMatch[3])
    const coordinate: unknown = [lon, lat]
    if (!isValidCoordinate(coordinate)) {
      throw new Error(`Coordenada inválida no nó OSM ${id}.`)
    }
    nodes.set(id, [lon, lat])
  }

  // Se a regex acima não pegou com ordem inversa lon/lat:
  if (nodes.size === 0) {
    const altNodeRegex = /<node\s+[^>]*?id="(\d+)"[^>]*?lon="([-\d.]+)"[^>]*?lat="([-\d.]+)"/g
    while ((nodeMatch = altNodeRegex.exec(xml)) !== null) {
      const id = nodeMatch[1]!
      const lon = Number(nodeMatch[2])
      const lat = Number(nodeMatch[3])
      const coordinate: unknown = [lon, lat]
      if (!isValidCoordinate(coordinate)) {
        throw new Error(`Coordenada inválida no nó OSM ${id}.`)
      }
      nodes.set(id, [lon, lat])
    }
  }

  // Extrai ways: <way id="123" ...> ... </way>
  const wayBlockRegex = /<way\s+[^>]*?id="(\d+)"[^>]*?>([\s\S]*?)<\/way>/g
  let wayMatch: RegExpExecArray | null

  while ((wayMatch = wayBlockRegex.exec(xml)) !== null) {
    const wayId = wayMatch[1]!
    const body = wayMatch[2]!

    // Extrai tags
    const tags: Record<string, string> = {}
    const tagRegex = /<tag\s+[^>]*?k="([^"]+)"\s+v="([^"]*)"/g
    let tagMatch: RegExpExecArray | null
    while ((tagMatch = tagRegex.exec(body)) !== null) {
      tags[tagMatch[1]!] = tagMatch[2]!
    }

    const highway = tags['highway']
    if (!highway || EXCLUDED_HIGHWAYS.has(highway.toLowerCase())) {
      continue
    }

    // Extrai referências de nós: <nd ref="123"/>
    const ndRegex = /<nd\s+[^>]*?ref="(\d+)"/g
    const coordinates: [number, number][] = []
    let ndMatch: RegExpExecArray | null
    while ((ndMatch = ndRegex.exec(body)) !== null) {
      const pt = nodes.get(ndMatch[1]!)
      if (pt) {
        coordinates.push(pt)
      }
    }

    if (coordinates.length < 2) {
      continue
    }

    const rawName = tags['name']?.trim() || tags['ref']?.trim() || ''
    const aliases: string[] = []
    if (tags['alt_name']) aliases.push(tags['alt_name'])
    if (tags['old_name']) aliases.push(tags['old_name'])
    if (tags['loc_name']) aliases.push(tags['loc_name'])

    const streetType = rawName ? extractStreetType(rawName) : undefined

    features.push({
      osmId: wayId,
      name: rawName,
      normalizedName: rawName ? normalizeAddress(rawName) : '',
      streetType,
      highway,
      geometry: {
        type: 'LineString',
        coordinates,
      },
      tags,
      aliases,
      oneway: tags['oneway'] === 'yes' ? true : tags['oneway'] === 'no' ? false : null,
      maxspeed: tags['maxspeed'] || null,
      surface: tags['surface'] || null,
    })
  }

  return mergeConnectedWays(features)
}

/**
 * Parser de GeoJSON FeatureCollection
 */
export function parseGeoJson(jsonText: string): OsmStreetFeature[] {
  const data = JSON.parse(jsonText) as {
    type?: string
    features?: Array<{
      id?: string | number
      properties?: Record<string, unknown>
      geometry?: {
        type: string
        coordinates: unknown
      }
    }>
  }

  if (!data.features || !Array.isArray(data.features)) {
    throw new Error('Arquivo GeoJSON inválido: FeatureCollection ausente.')
  }

  const features: OsmStreetFeature[] = []

  for (const item of data.features) {
    const props = item.properties ?? {}
    const geom = item.geometry
    if (!geom) continue

    const highway = String(props['highway'] || props['HIGHWAY'] || '')
    if (highway && EXCLUDED_HIGHWAYS.has(highway.toLowerCase())) {
      continue
    }

    let geometry: OsmGeometry | null = null
    if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
      geometry = {
        type: 'LineString',
        coordinates: geom.coordinates as [number, number][],
      }
    } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
      geometry = {
        type: 'MultiLineString',
        coordinates: geom.coordinates as [number, number][][],
      }
    }

    if (!geometry) continue
    validateLineCoordinates(geometry, String(item.id || props['osm_id'] || props['id'] || 'GeoJSON'))

    const name = String(props['name'] || props['official_name'] || props['NOME'] || props['ref'] || '').trim()
    const osmId = String(item.id || props['osm_id'] || props['id'] || crypto.randomUUID())

    const aliases: string[] = []
    if (props['alt_name']) aliases.push(String(props['alt_name']))
    if (props['old_name']) aliases.push(String(props['old_name']))
    if (props['loc_name']) aliases.push(String(props['loc_name']))

    const tags: Record<string, string> = {}
    for (const [k, v] of Object.entries(props)) {
      if (typeof v === 'string' || typeof v === 'number') {
        tags[k] = String(v)
      }
    }

    features.push({
      osmId,
      name,
      normalizedName: name ? normalizeAddress(name) : '',
      streetType: name ? extractStreetType(name) : undefined,
      highway: highway || 'residential',
      geometry,
      tags,
      aliases,
      oneway: props['oneway'] === 'yes' ? true : props['oneway'] === 'no' ? false : null,
      maxspeed: props['maxspeed'] ? String(props['maxspeed']) : null,
      surface: props['surface'] ? String(props['surface']) : null,
    })
  }

  return mergeConnectedWays(features)
}

/**
 * Parser de contingência para PBF básico
 */
function parseOsmPbfBuffer(buffer: Buffer): OsmStreetFeature[] {
  // PBF é formato binário baseado em protobuf.
  // Se for lido sem biblioteca C++, podemos verificar os blocos de string table
  // ou orientar o usuário para o formato .osm / .geojson
  const text = buffer.toString('latin1')
  if (text.includes('OSMHeader') || text.includes('OSMData')) {
    // Arquivo PBF válido detectado
    throw new Error(
      'Arquivo .osm.pbf binário recebido. Converta para .osm (XML) ou .geojson via osmium/osmconvert, ou utilize o arquivo local santa-juliana.osm gerado pelo Multivus.',
    )
  }
  throw new Error('Formato binário PBF não reconhecido.')
}

/**
 * Agrupa apenas ways com o mesmo nome que compartilham ao menos um endpoint.
 */
function mergeConnectedWays(features: OsmStreetFeature[]): OsmStreetFeature[] {
  const byName = new Map<string, OsmStreetFeature[]>()

  for (const feat of features) {
    if (!feat.normalizedName) {
      // Vias sem nome mantêm-se individuais
      continue
    }
    const nonNameTags = Object.entries(feat.tags)
      .filter(([key]) => !['name', 'official_name', 'alt_name', 'old_name', 'loc_name', 'id', 'osm_id'].includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
    const key = JSON.stringify([feat.normalizedName, feat.streetType || '', nonNameTags])
    const list = byName.get(key) ?? []
    list.push(feat)
    byName.set(key, list)
  }

  const result: OsmStreetFeature[] = []

  // Vias sem nome
  for (const feat of features) {
    if (!feat.normalizedName) {
      result.push(feat)
    }
  }

  // Vias nomeadas: se houver apenas uma linha, mantém; se houver múltiplas, une em MultiLineString ou LineString contínuo
  for (const list of byName.values()) {
    const parents = list.map((_, index) => index)
    const find = (index: number): number => {
      let root = index
      while (parents[root] !== root) root = parents[root]!
      while (parents[index] !== index) {
        const next = parents[index]!
        parents[index] = root
        index = next
      }
      return root
    }
    const union = (left: number, right: number) => {
      const leftRoot = find(left)
      const rightRoot = find(right)
      if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
    }
    const endpointOwners = new Map<string, number>()

    list.forEach((item, index) => {
      const lines = item.geometry.type === 'LineString'
        ? [item.geometry.coordinates as [number, number][]]
        : item.geometry.coordinates as [number, number][][]
      for (const line of lines) {
        const endpoints = [line[0], line[line.length - 1]].filter(
          (point): point is [number, number] => point !== undefined,
        )
        for (const point of endpoints) {
          const key = `${point[0]},${point[1]}`
          const owner = endpointOwners.get(key)
          if (owner === undefined) endpointOwners.set(key, index)
          else union(index, owner)
        }
      }
    })

    const components = new Map<number, OsmStreetFeature[]>()
    list.forEach((item, index) => {
      const root = find(index)
      const component = components.get(root) ?? []
      component.push(item)
      components.set(root, component)
    })

    for (const component of components.values()) {
      if (component.length === 1) {
        result.push(component[0]!)
        continue
      }

      const first = component[0]!
      const allLines: [number, number][][] = []
      const aliases = new Set<string>()
      for (const item of component) {
        for (const alias of item.aliases) aliases.add(alias)
        if (item.geometry.type === 'LineString') {
          allLines.push(item.geometry.coordinates as [number, number][])
        } else {
          allLines.push(...item.geometry.coordinates as [number, number][][])
        }
      }

      result.push({
        osmId: component.map((item) => item.osmId).join(','),
        name: first.name,
        normalizedName: first.normalizedName,
        streetType: first.streetType,
        highway: first.highway,
        geometry: allLines.length === 1
          ? { type: 'LineString', coordinates: allLines[0]! }
          : { type: 'MultiLineString', coordinates: allLines },
        tags: { ...first.tags },
        aliases: Array.from(aliases),
        oneway: first.oneway,
        maxspeed: first.maxspeed,
        surface: first.surface,
      })
    }
  }

  return result
}
