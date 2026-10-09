import { describe, expect, it } from 'vitest'
import type { SelectedPlace } from '../stores/ui'
import { getDestinationPrecision, hasValidDestinationCoordinates, isNavigableDestination } from './destination'

function destination(overrides: Partial<SelectedPlace> = {}): SelectedPlace {
  return {
    id: 'destination-1',
    kind: 'street',
    title: 'Rua Lírios',
    neighborhoodName: null,
    oldNames: [],
    usedOldName: false,
    warning: null,
    confidence: 80,
    customerInput: 'Rua Lírios, 120',
    matchedAlias: null,
    reference: null,
    source: 'survey',
    sourceDate: null,
    verified: true,
    latitude: -19.31,
    longitude: -46.61,
    resolvedNumber: '120',
    coordinatesVerified: true,
    coordinateType: 'address-point',
    coordinateSource: 'survey',
    coordinateSourceDate: null,
    numberVerified: true,
    targetStreetName: null,
    landmarkName: null,
    ...overrides,
  }
}

describe('destination navigation eligibility and precision resolution', () => {
  it('allows a verified address point with verified house number', () => {
    const dest = destination()
    expect(isNavigableDestination(dest, '120')).toBe(true)
    const prec = getDestinationPrecision(dest, '120')
    expect(prec.isNavigable).toBe(true)
    expect(prec.isAccessOnly).toBe(false)
    expect(prec.label).toContain('Ponto predial verificado')
  })

  it('allows street access navigation when street geometry exists but number is unverified', () => {
    const streetDest = destination({ coordinateType: 'street-access', numberVerified: false })
    expect(isNavigableDestination(streetDest, '120')).toBe(true)
    const prec = getDestinationPrecision(streetDest, '120')
    expect(prec.isNavigable).toBe(true)
    expect(prec.isAccessOnly).toBe(true)
    expect(prec.detail).toContain('Número 120 não localizado')
  })

  it('handles number mismatch by falling back to street access notice', () => {
    const mismatchDest = destination({ resolvedNumber: '50' })
    expect(isNavigableDestination(mismatchDest, '120')).toBe(true)
    const prec = getDestinationPrecision(mismatchDest, '120')
    expect(prec.isNavigable).toBe(true)
    expect(prec.isAccessOnly).toBe(true)
    expect(prec.detail).toContain('Ponto mapeado é do nº 50')
  })

  it('allows landmarks and places with verified coordinates', () => {
    const lm = destination({
      kind: 'landmark',
      coordinateType: 'landmark',
      numberVerified: false,
    })
    expect(isNavigableDestination(lm)).toBe(true)
    const prec = getDestinationPrecision(lm)
    expect(prec.isNavigable).toBe(true)
    expect(prec.label).toBe('Ponto comercial verificado')
  })

  it('rejects navigation for destinations without coordinates (unlocated)', () => {
    const unlocated = destination({ latitude: null, longitude: null })
    expect(isNavigableDestination(unlocated)).toBe(false)
    const prec = getDestinationPrecision(unlocated)
    expect(prec.isNavigable).toBe(false)
    expect(prec.label).toBe('Sem coordenadas cadastradas')
  })

  it('validates coordinate boundaries and finite checks', () => {
    expect(hasValidDestinationCoordinates(destination({ latitude: null }))).toBe(false)
    expect(hasValidDestinationCoordinates(destination({ longitude: Number.NaN }))).toBe(false)
    expect(hasValidDestinationCoordinates(destination({ longitude: 181 }))).toBe(false)
    expect(hasValidDestinationCoordinates(destination({ latitude: -91 }))).toBe(false)
    expect(hasValidDestinationCoordinates(null)).toBe(false)
  })
})

