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
})

