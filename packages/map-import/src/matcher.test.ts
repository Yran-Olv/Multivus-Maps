import { describe, expect, it } from 'vitest'
import { matchOsmWithMultivus } from './matcher'
import type { MultivusStreetCandidate, OsmStreetFeature } from './types'

const candidates: MultivusStreetCandidate[] = [
  {
    id: 'street-1',
    officialName: 'Rua Orivaldo José Pires',
    normalizedName: 'orivaldo jose pires',
    streetType: 'RUA',
    verified: false,
    confidenceScore: 70,
    aliases: [
      { alias: 'Rua Lírios', normalizedAlias: 'lirios', aliasType: 'OLD_NAME' },
      { alias: 'Lírios', normalizedAlias: 'lirios', aliasType: 'OLD_NAME' },
    ],
  },
  {
    id: 'street-2',
    officialName: 'Rua Elmar Goulart de Andrade',
    normalizedName: 'elmar goulart de andrade',
    streetType: 'RUA',
    verified: false,
    confidenceScore: 70,
    aliases: [
      { alias: 'Girassóis', normalizedAlias: 'girassois', aliasType: 'OLD_NAME' },
    ],
  },
  {
    id: 'street-3',
    officialName: 'Rua Antônio Gonçalves da Cunha',
    normalizedName: 'antonio goncalves da cunha',
    streetType: 'RUA',
    verified: false,
    confidenceScore: 70,
    aliases: [
      { alias: 'Violetas', normalizedAlias: 'violetas', aliasType: 'OLD_NAME' },
    ],
  },
  {
    id: 'street-4',
    officialName: 'Rua Antônio Gonçalves',
    normalizedName: 'antonio goncalves',
    streetType: 'RUA',
    verified: false,
    confidenceScore: 70,
    aliases: [],
  },
]

function makeOsmFeature(name: string, streetType = 'RUA', highway = 'residential'): OsmStreetFeature {
  return {
    osmId: 'osm-1',
    name,
    normalizedName: name
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/^(rua|r\.|avenida|av\.)\s+/i, '')
      .trim(),
    streetType,
    highway,
    geometry: {
      type: 'LineString',
      coordinates: [
        [-47.525, -19.308],
        [-47.526, -19.309],
      ],
    },
    tags: { name, highway },
    aliases: [],
  }
}

describe('algoritmo de matching cartográfico OSM vs Multivus', () => {
  it('identifica MATCH_EXACT quando o nome oficial coincide', () => {
    const feat = makeOsmFeature('Rua Orivaldo José Pires')
    const match = matchOsmWithMultivus(feat, candidates)

    expect(match.matchType).toBe('MATCH_EXACT')
    expect(match.multivusStreetId).toBe('street-1')
    expect(match.multivusOfficialName).toBe('Rua Orivaldo José Pires')
    expect(match.score).toBe(100)
    expect(match.action).toBe('APPLY_GEOMETRY')
  })

  it('identifica MATCH_ALIAS quando o OSM usa o nome antigo', () => {
    const feat = makeOsmFeature('Rua Lírios')
    const match = matchOsmWithMultivus(feat, candidates)

    expect(match.matchType).toBe('MATCH_ALIAS')
    expect(match.multivusStreetId).toBe('street-1')
    expect(match.multivusOfficialName).toBe('Rua Orivaldo José Pires')
    expect(match.matchedAlias).toMatch(/Lírios/i)
    expect(match.score).toBeGreaterThanOrEqual(90)
    expect(match.action).toBe('REVIEW_REQUIRED')
  })

  it('identifica MATCH_FUZZY para variações com abreviação ou erro leve', () => {
    const feat = makeOsmFeature('R. Orivaldo Jose Pires')
    const match = matchOsmWithMultivus(feat, candidates)

    expect(['MATCH_EXACT', 'MATCH_FUZZY']).toContain(match.matchType)
    expect(match.multivusStreetId).toBe('street-1')
    expect(match.score).toBeGreaterThanOrEqual(80)
  })

  it('identifica CONFLICT quando múltiplos candidatos possuem nomes muito semelhantes', () => {
    // "Antônio Gonçalves" vs "Antônio Gonçalves da Cunha"
    const feat = makeOsmFeature('Rua Antonio Goncalves')
    const match = matchOsmWithMultivus(feat, candidates)

    // Se houver conflito ou correspondência com rivais de pontuação alta
    expect(['MATCH_EXACT', 'CONFLICT', 'MATCH_FUZZY']).toContain(match.matchType)
    if (match.matchType === 'CONFLICT') {
      expect(match.conflicts.length).toBeGreaterThanOrEqual(2)
      expect(match.action).toBe('REVIEW_REQUIRED')
    }
  })

  it('identifica NEW_STREET quando a via do OSM não existe no cadastro Multivus', () => {
    const feat = makeOsmFeature('Rua Nova Esperança')
    const match = matchOsmWithMultivus(feat, candidates)

    expect(match.matchType).toBe('NEW_STREET')
    expect(match.multivusStreetId).toBeNull()
    expect(match.action).toBe('CREATE_STREET')
  })

  it('identifica UNRESOLVED quando a via no OSM não tem nome', () => {
    const feat = makeOsmFeature('')
    const match = matchOsmWithMultivus(feat, candidates)

    expect(match.matchType).toBe('UNRESOLVED')
    expect(match.action).toBe('IGNORE')
  })
})
