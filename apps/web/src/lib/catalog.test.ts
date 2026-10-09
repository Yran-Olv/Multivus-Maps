import { describe, expect, it } from 'vitest'
import { pointOf } from './coordinates'

describe('coordenadas de destino do catálogo', () => {
  it('extrai coordenadas de pontos geográficos (Point)', () => {
    expect(pointOf({
      type: 'Point',
      coordinates: [-47.52, -19.31],
    })).toEqual({ longitude: -47.52, latitude: -19.31, coordinateType: 'address-point' })
  })

  it('extrai ponto de acesso seguro da via para geometrias de rua (LineString e MultiLineString)', () => {
    const lineRes = pointOf({
      type: 'LineString',
      coordinates: [[-47.52, -19.31], [-47.53, -19.32]],
    })
    expect(lineRes).not.toBeNull()
    expect(lineRes?.coordinateType).toBe('street-access')
    expect(lineRes?.longitude).toBe(-47.53)
    expect(lineRes?.latitude).toBe(-19.32)

    const multiRes = pointOf({
      type: 'MultiLineString',
      coordinates: [[[-47.52, -19.31], [-47.53, -19.32], [-47.54, -19.33]]],
    })
    expect(multiRes).not.toBeNull()
    expect(multiRes?.coordinateType).toBe('street-access')
    expect(multiRes?.longitude).toBe(-47.53)
    expect(multiRes?.latitude).toBe(-19.32)
  })

  it('rejeita coordenadas fora dos limites geográficos ou inválidas', () => {
    expect(pointOf({ type: 'Point', coordinates: [300, -19] })).toBeNull()
    expect(pointOf({ type: 'Point', coordinates: [-47, Number.NaN] })).toBeNull()
    expect(pointOf(null)).toBeNull()
    expect(pointOf({ type: 'LineString', coordinates: [] })).toBeNull()
  })
})

