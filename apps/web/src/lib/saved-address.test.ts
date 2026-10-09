import { describe, expect, it } from 'vitest'
import { restoreSavedAddress } from './saved-address'
import type { SearchableRecord } from '@multivus/map-core'
import type { SavedDestination } from '@multivus/shared'

const destination: SavedDestination = {
  id: 'street-1',
  kind: 'street',
  title: 'Rua Orivaldo José Pires',
  neighborhoodName: 'Centro',
  oldNames: ['Rua Lírios'],
  usedOldName: true,
  warning: 'Nome antigo utilizado.',
  confidence: 70,
  customerInput: 'Rua Lírios, 120',
  matchedAlias: 'Rua Lírios',
  reference: null,
  source: 'Prefeitura Santa Juliana',
  sourceDate: '2021-07',
  verified: false,
  latitude: null,
  longitude: null,
}

describe('restauração de endereços salvos offline', () => {
  it('restaura o destino completo do histórico, incluindo identidade, número, alias e coordenadas', () => {
    const result = restoreSavedAddress({
      id: 'recent-row',
      entityId: 'street-1',
      entityKind: 'street',
      number: '120',
      query: 'Rua Lírios, 120',
      title: 'Rua Orivaldo José Pires',
      matchedAlias: 'Rua Lírios',
      destination: { ...destination, latitude: -19.31, longitude: -47.52 },
    }, [])

    expect(result).toEqual({
      number: '120',
      destination: { ...destination, latitude: -19.31, longitude: -47.52 },
    })
  })

  it('recupera o tipo comercial correto pelo identificador sem convertê-lo em rua', () => {
    const records: SearchableRecord[] = [{
      id: 'shop-1',
      kind: 'landmark',
      title: 'Barbosão Supermercado',
      verified: true,
      latitude: -19.315,
      longitude: -47.5285,
      category: 'supermercado',
      confidence: 95,
    }]

    const result = restoreSavedAddress({
      id: 'favorite-row',
      entityId: 'shop-1',
      entityKind: 'landmark',
      label: 'Barbosão Supermercado',
      destination: { ...destination, id: 'shop-1', kind: 'landmark', title: 'Barbosão Supermercado' },
    }, records)

    expect(result.destination.kind).toBe('landmark')
    expect(result.destination.id).toBe('shop-1')
    expect(result.destination.latitude).toBe(-19.315)
    expect(result.destination.longitude).toBe(-47.5285)
  })

  it('mantém endereços antigos offline sem coordenadas fabricadas', () => {
    const result = restoreSavedAddress({
      id: 'legacy-row',
      streetId: 'street-legacy',
      title: 'Rua sem geometria, 80',
      query: 'Rua sem geometria, 80',
    }, [])

    expect(result.destination.id).toBe('street-legacy')
    expect(result.destination.kind).toBe('street')
    expect(result.number).toBe('80')
    expect(result.destination.latitude).toBeNull()
    expect(result.destination.longitude).toBeNull()
  })

  it('preserva o ponto predial verificado do snapshot ao reabrir histórico com catálogo offline', () => {
    const verifiedDestination: SavedDestination = {
      ...destination,
      latitude: -19.31,
      longitude: -47.52,
      resolvedNumber: '120',
      coordinatesVerified: true,
      coordinateType: 'address-point',
      coordinateSource: 'Conferência local',
      numberVerified: true,
    }
    const records: SearchableRecord[] = [{
      id: 'street-1',
      kind: 'street',
      title: 'Rua Orivaldo José Pires',
      verified: false,
    }]

    const restored = restoreSavedAddress({
      id: 'recent-2',
      entityId: 'street-1',
      entityKind: 'street',
      number: '120',
      destination: verifiedDestination,
    }, records)

    expect(restored.destination.title).toBe('Rua Orivaldo José Pires')
    expect(restored.destination.latitude).toBe(-19.31)
    expect(restored.destination.coordinatesVerified).toBe(true)
    expect(restored.destination.resolvedNumber).toBe('120')
  })
})
