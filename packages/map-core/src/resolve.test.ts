import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { normalizeAddress } from './normalize'
import { parseAddressText } from './parse'
import { resolveAddress } from './resolve'
import { searchRecords, type SearchableRecord } from './search'

type SeedFile = {
  streets: Array<{
    officialName: string
    streetType: string
    verified: boolean
    source: string
    aliases: Array<{ alias: string; aliasType: string }>
  }>
}

const seedPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../data/santa-juliana/streets.seed.json')
const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedFile

function records(): SearchableRecord[] {
  return seed.streets.map((street) => ({
    id: normalizeAddress(street.officialName),
    kind: 'street' as const,
    title: street.officialName,
    streetType: street.streetType,
    verified: street.verified,
    source: street.source,
    aliases: street.aliases,
  }))
}

describe('entender endereço', () => {
  it('separa número e referência de uma mensagem colada', () => {
    const parsed = parseAddressText('Entrega na Rua Lírios 120, casa azul perto da igreja')
    expect(parsed.streetQuery).toBe('Rua Lírios')
    expect(parsed.number).toBe('120')
    expect(parsed.reference).toBe('casa azul perto da igreja')
  })

  it('não extrai número de nomes comerciais como Posto 2000', () => {
    const parsed = parseAddressText('Casa azul atrás do Posto 2000')
    expect(parsed.streetQuery).toBe('Posto 2000')
    expect(parsed.number).toBeNull()
    expect(parsed.reference).toBe('Casa azul, atrás do Posto 2000')
  })

  it('trata o nome antigo e o nome atual como a mesma rua', () => {
    const queries = ['Lírios', 'Rua Lírios', 'R. Lírios', 'rua lirios', 'antiga Lírios', 'Rua Lírios, 120']
    for (const query of queries) {
      const resolved = resolveAddress(records(), query)
      expect(resolved.officialName, query).toBe('Rua Orivaldo José Pires')
      expect(resolved.usedOldName, query).toBe(true)
      expect(resolved.warning).toMatch(/nome antigo/i)
      expect(resolved.confidence).toBe(70)
    }
    expect(resolveAddress(records(), 'Rua Lírios, 120').number).toBe('120')
  })

  it('mostra o nome antigo quando a busca usa o nome atual', () => {
    const resolved = resolveAddress(records(), 'Orivaldo José Pires')
    expect(resolved.officialName).toBe('Rua Orivaldo José Pires')
    expect(resolved.usedOldName).toBe(false)
    expect(resolved.oldNames).toContain('Rua Lírios')
    expect(resolved.hit?.subtitle).toMatch(/Também conhecida como Rua Lírios/)
    expect(resolved.warning).toBeNull()
  })

  it('encontra Girassóis e tolera digitação incompleta', () => {
    expect(resolveAddress(records(), 'Rua Girassóis').officialName).toBe('Rua Elmar Goulart de Andrade')
    expect(searchRecords(records(), 'Liros')[0]?.title).toBe('Rua Orivaldo José Pires')
    expect(searchRecords(records(), 'Jose Pires')[0]?.title).toBe('Rua Orivaldo José Pires')
    expect(searchRecords(records(), 'Orivaldo J. Pires')[0]?.title).toBe('Rua Orivaldo José Pires')
  })

  it('compartilha o nome atual e preserva o antigo', () => {
    const resolved = resolveAddress(records(), 'Rua Lírios 120')
    expect(resolved.shareText).toBe(
      ['📍 Rua Orivaldo José Pires, 120', 'Antiga Rua Lírios', 'Santa Juliana - MG'].join('\n'),
    )
  })

  it('não cria outra rua para o nome antigo', () => {
    const titles = new Set(seed.streets.map((street) => street.officialName))
    expect(titles.has('Rua Lírios')).toBe(false)
    expect(titles.has('Rua Orivaldo José Pires')).toBe(true)
  })

  it('atende ao requisito 25: variações de Lírios e Orivaldo resolvem para Rua Orivaldo José Pires', () => {
    const variations = [
      'Rua Lírios',
      'Lírios',
      'Rua Lirios',
      'Liros',
      'Orivaldo Jose',
      'Rua Orivaldo José Pires',
    ]
    for (const query of variations) {
      const resolved = resolveAddress(records(), query)
      expect(resolved.officialName, `Falha na query: ${query}`).toBe('Rua Orivaldo José Pires')
    }
  })

  it('atende ao requisito 25: "Rua Lírios 120, casa azul" retorna dados completos', () => {
    const resolved = resolveAddress(records(), 'Rua Lírios 120, casa azul')
    expect(resolved.officialName).toBe('Rua Orivaldo José Pires')
    expect(resolved.number).toBe('120')
    expect(resolved.matchedAlias).toBe('Rua Lírios')
    expect(resolved.usedOldName).toBe(true)
    expect(resolved.reference).toContain('casa azul')
  })

  it('resolve referências populares como "rua do hospital" ou "atrás da rodoviária"', () => {
    const customRecords: SearchableRecord[] = [
      ...records(),
      {
        id: 'ref-hospital',
        kind: 'reference',
        title: 'Rua do Hospital',
        verified: true,
        targetStreetId: normalizeAddress('Rua São Vicente de Paula'),
        targetStreetName: 'Rua São Vicente de Paula',
      },
      {
        id: 'ref-bioklin',
        kind: 'reference',
        title: 'Rua da Bioklin',
        verified: true,
        targetStreetId: normalizeAddress('Rua São Vicente de Paula'),
        targetStreetName: 'Rua São Vicente de Paula',
      },
      {
        id: 'landmark-igreja',
        kind: 'landmark',
        title: 'Igreja Matriz',
        category: 'igreja',
        verified: true,
        aliases: [{ alias: 'igreja', aliasType: 'POPULAR_NAME' }],
      },
    ]

    const resolvedHospital = resolveAddress(customRecords, 'Rua do Hospital')
    expect(resolvedHospital.officialName).toBe('Rua São Vicente de Paula')
    expect(resolvedHospital.matchedReference).toBe('Rua do Hospital')

    const resolvedBioklin = resolveAddress(customRecords, 'Entrega na rua da bioklin 55')
    expect(resolvedBioklin.officialName).toBe('Rua São Vicente de Paula')
    expect(resolvedBioklin.number).toBe('55')

    const resolvedWithLandmark = resolveAddress(customRecords, 'Rua Lírios 120, perto da igreja')
    expect(resolvedWithLandmark.officialName).toBe('Rua Orivaldo José Pires')
    expect(resolvedWithLandmark.number).toBe('120')
    expect(resolvedWithLandmark.matchedLandmark).toBe('Igreja Matriz')
  })

  it('entende mensagens de entregadores com referências comerciais e calcula raio provável', () => {
    const intelligenceRecords: SearchableRecord[] = [
      ...records(),
      {
        id: 'lm-barbosao',
        kind: 'landmark',
        title: 'Barbosão Supermercado - Santa Juliana MG',
        category: 'supermercado',
        importanceScore: 95,
        verified: true,
        latitude: -19.315,
        longitude: -47.5285,
        aliases: [{ alias: 'Barbosão', aliasType: 'POPULAR_NAME' }, { alias: 'Barbosao', aliasType: 'POPULAR_NAME' }],
        targetStreetId: normalizeAddress('Avenida Antônio Fortunato da Silva'),
        targetStreetName: 'Avenida Antônio Fortunato da Silva',
      },
      {
        id: 'lm-posto2000',
        kind: 'landmark',
        title: 'POSTO 2000 STA JULIANA MG',
        category: 'posto',
        importanceScore: 95,
        verified: true,
        latitude: -19.3134,
        longitude: -47.5301,
        aliases: [{ alias: 'Posto 2000', aliasType: 'POPULAR_NAME' }],
        targetStreetId: normalizeAddress('Rua José Pedro Borges'),
        targetStreetName: 'Rua José Pedro Borges',
      },
      {
        id: 'lm-farmacunha',
        kind: 'landmark',
        title: 'Farma Cunha',
        category: 'farmacia',
        importanceScore: 90,
        verified: true,
        latitude: -19.3096,
        longitude: -47.5235,
        aliases: [{ alias: 'Farmácia Cunha', aliasType: 'POPULAR_NAME' }],
        targetStreetId: normalizeAddress('Rua Professor Orestes'),
        targetStreetName: 'Rua Professor Orestes',
      },
      {
        id: 'lm-rodrigues',
        kind: 'landmark',
        title: 'SR - Supermercado Rodrigues',
        category: 'supermercado',
        importanceScore: 95,
        verified: true,
        aliases: [{ alias: 'Supermercado Rodrigues', aliasType: 'POPULAR_NAME' }],
        targetStreetId: normalizeAddress('Avenida Antônio Fortunato da Silva'),
        targetStreetName: 'Avenida Antônio Fortunato da Silva',
      },
      {
        id: 'lm-rodoviaria',
        kind: 'landmark',
        title: 'Terminal Rodoviário de Santa Juliana',
        category: 'rodoviaria',
        importanceScore: 100,
        verified: true,
        aliases: [{ alias: 'rodoviária', aliasType: 'POPULAR_NAME' }, { alias: 'rodoviaria', aliasType: 'POPULAR_NAME' }],
        targetStreetId: normalizeAddress('Rua Professor Orestes'),
        targetStreetName: 'Rua Professor Orestes',
      },
    ]

    // Caso 1: "perto do Barbosão" -> Raio provável de 200m
    const resBarbosao = resolveAddress(intelligenceRecords, 'perto do Barbosão')
    expect(resBarbosao.matchedLandmark).toBe('Barbosão Supermercado - Santa Juliana MG')
    expect(resBarbosao.probableRadiusMeters).toBe(200)
    expect(resBarbosao.spatialRelation).toBe('NEAR')

    const directCommerce = resolveAddress(intelligenceRecords, 'Barbosão')
    expect(directCommerce.hit?.kind).toBe('landmark')
    expect(directCommerce.officialName).toBe('Barbosão Supermercado - Santa Juliana MG')

    // Caso 2: "atrás da Farma Cunha" -> Localiza a farmácia primeiro, raio provável de 100m
    const resCunha = resolveAddress(intelligenceRecords, 'atrás da Farma Cunha')
    expect(resCunha.matchedLandmark).toBe('Farma Cunha')
    expect(resCunha.probableRadiusMeters).toBe(100)
    expect(resCunha.spatialRelation).toBe('BEHIND')

    // Caso 3: "Casa azul atrás do Posto 2000" -> Posto 2000, 100m, referência preservada
    const resPosto = resolveAddress(intelligenceRecords, 'Casa azul atrás do Posto 2000')
    expect(resPosto.matchedLandmark).toBe('POSTO 2000 STA JULIANA MG')
    expect(resPosto.probableRadiusMeters).toBe(100)
    expect(resPosto.spatialRelation).toBe('BEHIND')
    expect(resPosto.reference).toMatch(/casa azul/i)

    // Caso 4: Mensagem complexa com múltiplos comércios e nome antigo
    const complexMsg =
      'Rua Lírios 120 perto do Barbosão atrás da rodoviária ao lado da Farma Cunha em frente ao Posto 2000 depois do Supermercado Rodrigues'
    const resComplex = resolveAddress(intelligenceRecords, complexMsg)
    expect(resComplex.officialName).toBe('Rua Orivaldo José Pires')
    expect(resComplex.number).toBe('120')
    expect(resComplex.usedOldName).toBe(true)
    expect(resComplex.matchedLandmark).toBeDefined()
    expect(resComplex.additionalLandmarks.length).toBeGreaterThanOrEqual(2)
  })
})
