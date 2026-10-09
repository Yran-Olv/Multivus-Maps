import { describe, expect, it } from 'vitest'
import { createNeighborhoodSchema, updateNeighborhoodSchema } from './schemas'

describe('neighborhood geometry validation', () => {
  it('accepts a manually drawn polygon with a closed ring', () => {
    expect(createNeighborhoodSchema.safeParse({
      name: 'Centro',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-47.53, -19.31],
          [-47.52, -19.31],
          [-47.52, -19.30],
          [-47.53, -19.31],
        ]],
      },
    }).success).toBe(true)
  })

  it('rejects an open ring and coordinates outside WGS84 bounds', () => {
    const openRing = createNeighborhoodSchema.safeParse({
      name: 'Centro',
      geometry: {
        type: 'Polygon',
        coordinates: [[[-47.53, -19.31], [-47.52, -19.31], [-47.52, -19.30], [-47.53, -19.32]]],
      },
    })
    const outsideBounds = createNeighborhoodSchema.safeParse({
      name: 'Centro',
      geometry: {
        type: 'Polygon',
        coordinates: [[[200, -19.31], [200, -19.30], [199, -19.30], [200, -19.31]]],
      },
    })

    expect(openRing.success).toBe(false)
    expect(outsideBounds.success).toBe(false)
  })

  it('allows metadata-only updates without replacing the existing boundary', () => {
    expect(updateNeighborhoodSchema.safeParse({ name: 'Centro Histórico' }).success).toBe(true)
  })
})
