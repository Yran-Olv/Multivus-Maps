import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { SANTA_JULIANA_CENTER } from '@multivus/shared'

export const BASE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

export type MapPoint = {
  id: string
  longitude: number
  latitude: number
  color?: string
}

export type MapLine = {
  id: string
  coordinates: [number, number][]
}

export type MapHandle = {
  flyTo: (longitude: number, latitude: number, zoom?: number) => void
  getCenter: () => { longitude: number; latitude: number }
  resize: () => void
}

type MapProps = {
  lines?: MapLine[]
  points?: MapPoint[]
  userLocation?: { longitude: number; latitude: number } | null
  onClick?: (point: { longitude: number; latitude: number }) => void
  onMove?: (center: { longitude: number; latitude: number }) => void
  className?: string
  handle?: Ref<MapHandle>
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export function Map({ lines = [], points = [], userLocation, onClick, onMove, className, handle }: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onClickRef = useRef(onClick)
  const onMoveRef = useRef(onMove)
  const [unavailable, setUnavailable] = useState(false)
  onClickRef.current = onClick
  onMoveRef.current = onMove

  useImperativeHandle(handle, () => ({
    flyTo(longitude, latitude, zoom = 16) {
      mapRef.current?.flyTo({ center: [longitude, latitude], zoom })
    },
    getCenter() {
      const center = mapRef.current?.getCenter()
      return {
        longitude: center?.lng ?? SANTA_JULIANA_CENTER.longitude,
        latitude: center?.lat ?? SANTA_JULIANA_CENTER.latitude,
      }
    },
    resize() {
      mapRef.current?.resize()
    },
  }))

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!webglAvailable()) {
      setUnavailable(true)
      return
    }
    let map: MapLibreMap
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: BASE_MAP_STYLE,
        center: [SANTA_JULIANA_CENTER.longitude, SANTA_JULIANA_CENTER.latitude],
        zoom: 15,
        attributionControl: { compact: true },
      })
    } catch {
      setUnavailable(true)
      return
    }
    map.on('error', (event) => {
      const message = event.error?.message ?? ''
      if (/webgl|context/i.test(message)) setUnavailable(true)
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('load', () => {
      map.addSource('multivus-local', {
        type: 'geojson',
        data: emptyCollection(),
      })
      map.addLayer({
        id: 'multivus-local-line',
        type: 'line',
        source: 'multivus-local',
        paint: {
          'line-color': '#f0b429',
          'line-width': 4,
        },
      })
      map.addSource('multivus-points', {
        type: 'geojson',
        data: emptyCollection(),
      })
      map.addLayer({
        id: 'multivus-points-circle',
        type: 'circle',
        source: 'multivus-points',
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
    })
    map.on('click', (event) => {
      onClickRef.current?.({ longitude: event.lngLat.lng, latitude: event.lngLat.lat })
    })
    map.on('moveend', () => {
      const center = map.getCenter()
      onMoveRef.current?.({ longitude: center.lng, latitude: center.lat })
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource('multivus-local') as GeoJSONSource | undefined
    source?.setData({
      type: 'FeatureCollection',
      features: lines
        .filter((line) => line.coordinates.length >= 2)
        .map((line) => ({
          type: 'Feature' as const,
          id: line.id,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: line.coordinates },
        })),
    })
  }, [lines])

  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource('multivus-points') as GeoJSONSource | undefined
    const features = points.map((point) => ({
      type: 'Feature' as const,
      id: point.id,
      properties: { color: point.color ?? '#1f8a70' },
      geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
    }))
    if (userLocation) {
      features.push({
        type: 'Feature',
        id: 'user',
        properties: { color: '#2f6fed' },
        geometry: { type: 'Point', coordinates: [userLocation.longitude, userLocation.latitude] },
      })
    }
    source?.setData({ type: 'FeatureCollection', features })
  }, [points, userLocation])

  if (unavailable) {
    return (
      <div className={`grid place-items-center bg-[#17202a] px-6 text-center text-slate-200 ${className ?? 'h-full w-full'}`}>
        <p>O mapa não abriu neste aparelho. A busca de ruas continua disponível, e o botão de ir abre o mapa do celular.</p>
      </div>
    )
  }

  return <div ref={containerRef} className={className ?? 'h-full w-full'} />
}

function emptyCollection() {
  return { type: 'FeatureCollection' as const, features: [] }
}
