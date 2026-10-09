import { describe, expect, it } from 'vitest'
import { parseOsmXml } from './parser'

describe('parser OSM', () => {
  it('agrupa apenas trechos de mesmo nome que compartilham endpoints', () => {
    const xml = `
      <osm>
        <node id="1" lat="-19.3" lon="-47.5"/>
        <node id="2" lat="-19.31" lon="-47.51"/>
        <node id="3" lat="-19.32" lon="-47.52"/>
        <node id="4" lat="-19.4" lon="-47.6"/>
        <node id="5" lat="-19.41" lon="-47.61"/>
        <way id="10">
          <nd ref="1"/><nd ref="2"/>
          <tag k="highway" v="residential"/><tag k="name" v="Rua Central"/>
        </way>
        <way id="11">
          <nd ref="2"/><nd ref="3"/>
          <tag k="highway" v="residential"/><tag k="name" v="Rua Central"/>
        </way>
        <way id="12">
          <nd ref="4"/><nd ref="5"/>
          <tag k="highway" v="residential"/><tag k="name" v="Rua Central"/>
        </way>
      </osm>
    `

    const result = parseOsmXml(xml)

    expect(result).toHaveLength(2)
    expect(result.map((feature) => feature.osmId)).toEqual(['10,11', '12'])
    expect(result[0]?.geometry.type).toBe('MultiLineString')
  })

  it('rejeita coordenadas fora dos limites WGS84', () => {
    expect(() => parseOsmXml(`
      <osm>
        <node id="1" lat="91" lon="-47.5"/>
        <node id="2" lat="-19.31" lon="-47.51"/>
        <way id="10">
          <nd ref="1"/><nd ref="2"/>
          <tag k="highway" v="residential"/><tag k="name" v="Rua Central"/>
        </way>
      </osm>
    `)).toThrow('Coordenada inválida no nó OSM 1.')
  })

  it('mantém separados trechos conectados com tags de circulação diferentes', () => {
    const xml = `
      <osm>
        <node id="1" lat="-19.3" lon="-47.5"/>
        <node id="2" lat="-19.31" lon="-47.51"/>
        <node id="3" lat="-19.32" lon="-47.52"/>
        <way id="10">
          <nd ref="1"/><nd ref="2"/>
          <tag k="highway" v="residential"/><tag k="name" v="Rua Central"/><tag k="oneway" v="yes"/>
        </way>
        <way id="11">
          <nd ref="2"/><nd ref="3"/>
          <tag k="highway" v="residential"/><tag k="name" v="Rua Central"/><tag k="oneway" v="no"/>
        </way>
      </osm>
    `

    const result = parseOsmXml(xml)

    expect(result).toHaveLength(2)
    expect(result.map((feature) => feature.oneway)).toEqual([true, false])
  })
})
