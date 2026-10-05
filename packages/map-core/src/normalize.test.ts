import { describe, expect, it } from 'vitest'
import { normalizeAddress } from './normalize'

describe('normalização de endereços', () => {
  it('remove tipo de logradouro, acento e pontuação', () => {
    expect(normalizeAddress('Rua Lírios')).toBe('lirios')
    expect(normalizeAddress('R. Lírios')).toBe('lirios')
    expect(normalizeAddress('r. jose totofo')).toBe('jose totofo')
    expect(normalizeAddress('avenida jose totofo')).toBe('jose totofo')
    expect(normalizeAddress('Av. José Totofo')).toBe('jose totofo')
    expect(normalizeAddress('Av José Totofo')).toBe('jose totofo')
  })

  it('preserva partículas do nome', () => {
    expect(normalizeAddress('Rua da Paz')).toBe('da paz')
    expect(normalizeAddress('Avenida José Totofo')).toBe('jose totofo')
  })
})
