/** ==== MapLibre e navegação ==== */

import {
  CAMERA_FOLLOW_EASING,
  CAMERA_GPS_TOLERANCE_MEDIUM,
  CAMERA_MAX_ZOOM,
  CAMERA_MIN_ZOOM,
  SANTA_JULIANA_CENTER,
} from './constants'

type MapLibreMap = {
  jumpTo(options: { center: [number, number]; zoom: number; essential: boolean }): void
  easeTo(options: { center: [number, number]; zoom: number; duration: number; essential: boolean }): void
  getZoom(): number
  getCenter(): { lng: number; lat: number }
}

export type CameraController = {
  startTracking(
    map: MapLibreMap,
    initialCenter: { longitude: number; latitude: number },
    followZoom: number,
  ): () => void
  stopTracking(map: MapLibreMap): void
  setUserLocation(
    map: MapLibreMap,
    longitude: number,
    latitude: number,
    autoZoom: boolean,
  ): void
}

const userTrackingRef = {
  map: null as MapLibreMap | null,
  currentCenter: { longitude: SANTA_JULIANA_CENTER.longitude, latitude: SANTA_JULIANA_CENTER.latitude } as { longitude: number; latitude: number },
  targetZoom: 15,
  animationId: 0,
  lastSafeCenter: { longitude: SANTA_JULIANA_CENTER.longitude, latitude: SANTA_JULIANA_CENTER.latitude } as { longitude: number; latitude: number },
}

export const cameraController: CameraController = {
  startTracking(map, initialCenter, followZoom) {
    userTrackingRef.map = map
    userTrackingRef.currentCenter = initialCenter
    userTrackingRef.targetZoom = Math.min(CAMERA_MAX_ZOOM, Math.max(CAMERA_MIN_ZOOM, followZoom))
    userTrackingRef.lastSafeCenter = initialCenter
    userTrackingRef.animationId = 0

    const tick = () => {
      if (!userTrackingRef.map) return
      const map = userTrackingRef.map
      const center = userTrackingRef.currentCenter
      const targetZoom = userTrackingRef.targetZoom
      const safeCenter = userTrackingRef.lastSafeCenter

      map.jumpTo({
        center: [safeCenter.longitude, safeCenter.latitude],
        zoom: safeCenter.longitude === center.longitude && safeCenter.latitude === center.latitude ? targetZoom : targetZoom,
        essential: true,
      })

      userTrackingRef.animationId = window.requestAnimationFrame(tick)
    }

    userTrackingRef.animationId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(userTrackingRef.animationId)
      userTrackingRef.map = null
    }
  },

  stopTracking(map) {
    if (userTrackingRef.map === map) {
      userTrackingRef.map = null
    }
  },

  setUserLocation(map, longitude, latitude, autoZoom) {
    if (!userTrackingRef.map || userTrackingRef.map !== map) return

    const center = userTrackingRef.currentCenter

    if (autoZoom) {
      const dx = longitude - center.longitude
      const dy = latitude - center.latitude

      const distance = Math.sqrt(dx * dx + dy * dy)
      const minZoom = CAMERA_MIN_ZOOM
      const maxZoom = CAMERA_MAX_ZOOM
      const currentZoom = map.getZoom()
      const nextZoom = currentZoom + distance * 0.35

      userTrackingRef.targetZoom = Math.min(
        maxZoom,
        Math.max(minZoom, Math.round(nextZoom * 100)) / 100,
      )

      map.easeTo({
        center: [longitude, latitude],
        zoom: userTrackingRef.targetZoom,
        duration: 320,
        essential: true,
      })

      userTrackingRef.lastSafeCenter = { longitude, latitude }
      userTrackingRef.currentCenter = { longitude, latitude }
    } else {
      userTrackingRef.targetZoom = map.getZoom()

      const dx = longitude - center.longitude
      const dy = latitude - center.latitude
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance > CAMERA_GPS_TOLERANCE_MEDIUM) {
        const source = map.getCenter()
        const lon = source.lng + dx * CAMERA_FOLLOW_EASING
        const lat = source.lat + dy * CAMERA_FOLLOW_EASING

        map.easeTo({
          center: [lon, lat],
          zoom: userTrackingRef.targetZoom,
          duration: 220,
          essential: false,
        })

        userTrackingRef.currentCenter = { longitude, latitude }
        userTrackingRef.lastSafeCenter = { longitude, latitude }
      }
    }
  },
}
