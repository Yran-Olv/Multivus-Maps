import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { normalizeAddress } from './normalize'
import { searchRecords, type SearchableRecord } from './search'

type SeedFile = {
  streets: Array<{
    officialName: string
    streetType: string
    verified: boolean
    geometry: null
    source: string
    sourceDate: string
    aliases: Array<{ alias: string; aliasType: string }>
  }>
}

const seedPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../data/santa-juliana/streets.seed.json',
)
const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedFile

function records(): SearchableRecord[] {
  return seed.streets.map((street) => ({
    id: normalizeAddress(street.officialName),
    kind: 'street' as const,
    title: street.officialName,
    streetType: street.streetType,
    verified: street.verified,
    source: street.source,
    sourceDate: street.sourceDate,
    geometry: street.geometry,
    aliases: street.aliases,
  }))
}

describe('pesquisa com aliases do mapa oficial', () => {
  it('encontra a rua atual pelo nome antigo Lírios', () => {
    const [hit] = searchRecords(records(), 'Rua Lírios')
    expect(hit?.title).toBe('Rua Orivaldo José Pires')
    expect(hit?.matchedAlias).toBe('Rua Lírios')
    expect(hit?.matchedAliasType).toBe('OLD_NAME')
  })

  it('trata as variações de Avenida José Totofo como o mesmo nome', () => {
    const queries = ['r jose totofo', 'avenida jose totofo', 'Av José Totofo']
    for (const query of queries) {
      const [hit] = searchRecords(records(), query)
      expect(hit?.title, query).toBe('Avenida José Totofo')
    }
  })

  it('tolera um erro pequeno de digitação', () => {
    const [hit] = searchRecords(records(), 'girasois')
    expect(hit?.title).toBe('Rua Elmar Goulart de Andrade')
  })
})

describe('seed de Santa Juliana', () => {
  it('não inventa coordenada e deixa tudo pendente de verificação', () => {
    expect(seed.streets.length).toBeGreaterThan(100)
    for (const street of seed.streets) {
      expect(street.geometry).toBeNull()
      expect(street.verified).toBe(false)
      expect(street.source).toBe('Prefeitura Santa Juliana')
      expect(street.sourceDate).toBe('2021-07')
    }
  })

  it('não tem nomes oficiais que normalizam para o mesmo valor', () => {
    const seen = new Set<string>()
    for (const street of seed.streets) {
      const key = normalizeAddress(street.officialName)
      expect(seen.has(key), street.officialName).toBe(false)
      seen.add(key)
    }
  })
})
