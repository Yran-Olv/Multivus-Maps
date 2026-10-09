import type { RouteCalculationResult, RouteStep } from './routing'

export const ARRIVAL_THRESHOLD_METERS = 30
export const ROUTE_OFF_TRACK_THRESHOLD_METERS = 40
export const STEP_ADVANCE_THRESHOLD_METERS = 40

export type Coord = [number, number] // [longitude, latitude]

export type NavigationDestination = {
  title: string
  latitude: number
  longitude: number
}

export type NavigationSession = {
  isNavigating: boolean
  activeRoute: RouteCalculationResult
  currentStepIndex: number
  routeProgressMeters: number
  startedAt: string
  destination: NavigationDestination
  remainingDistance: number // em metros
  remainingDuration: number // em segundos
  currentInstruction: string
  nextInstruction?: string
  distanceToNextManeuver: number // em metros
  isOffRoute: boolean
  isArrived: boolean
  voiceEnabled: boolean
  status: 'navigating' | 'recalculating' | 'arrived' | 'idle'
  statusMessage?: string
  announcedKeys: string[]
}

/**
 * Distância Haversine entre duas coordenadas [lon, lat] em metros
 */
export function haversineDistance(c1: Coord, c2: Coord): number {
  const [lon1, lat1] = c1
  const [lon2, lat2] = c2
  const R = 6371000 // Raio da Terra em metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Distância de um ponto [lon, lat] a um segmento de reta [A, B] em metros
 */
export function distanceToSegment(point: Coord, a: Coord, b: Coord): number {
  const [px, py] = point
  const [ax, ay] = a
  const [bx, by] = b

  const midLat = ((ay + by) / 2) * (Math.PI / 180)
  const kx = Math.cos(midLat) * 111320
  const ky = 110540

  const dx = (bx - ax) * kx
  const dy = (by - ay) * ky
  const l2 = dx * dx + dy * dy

  if (l2 === 0) {
    return haversineDistance(point, a)
  }

  const ptx = (px - ax) * kx
  const pty = (py - ay) * ky
  const t = Math.max(0, Math.min(1, (ptx * dx + pty * dy) / l2))

  const projX = ax + (t * (bx - ax))
  const projY = ay + (t * (by - ay))

  return haversineDistance(point, [projX, projY])
}

/**
 * Distância mínima de um ponto [lon, lat] a uma linha poligonal (rota)
 */
export function distanceToRouteLine(point: Coord, polyline: Coord[]): number {
  if (!polyline || polyline.length === 0) return Infinity
  if (polyline.length === 1) return haversineDistance(point, polyline[0]!)

  let minDistance = Infinity
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distanceToSegment(point, polyline[i]!, polyline[i + 1]!)
    if (d < minDistance) {
      minDistance = d
    }
  }
  return minDistance
}

/**
 * Formata distância para exibição em navegação
 * Ex: < 1000m -> "350 m", >= 1000m -> "1,2 km"
 */
export function formatNavigationDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.max(1, Math.round(meters))} m`
  }
  const km = meters / 1000
  return `${km.toFixed(1).replace('.', ',')} km`
}

/**
 * Formata duração em segundos para exibição
 * Ex: < 60s -> "1 min", >= 60s -> "5 min", >= 3600s -> "1 h 12 min"
 */
export function formatNavigationDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60))
  if (mins < 60) {
    return `${mins} min`
  }
  const h = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return remainingMins > 0 ? `${h} h ${remainingMins} min` : `${h} h`
}

/**
 * Inicializa uma nova sessão de navegação a partir de uma rota calculada
 */
export function createNavigationSession(
  activeRoute: RouteCalculationResult,
  destination: NavigationDestination,
  options?: { voiceEnabled?: boolean },
): NavigationSession {
  const steps = activeRoute.steps ?? []
  const firstStep = steps[0]
  const secondStep = steps[1]

  const firstInstruction = firstStep?.instruction || 'Siga o trajeto indicado no mapa'
  const nextInstruction = secondStep ? formatNextStepInstruction(secondStep) : undefined

  return {
    isNavigating: true,
    activeRoute,
    currentStepIndex: 0,
    routeProgressMeters: 0,
    startedAt: new Date().toISOString(),
    destination,
    remainingDistance: activeRoute.distance,
    remainingDuration: activeRoute.duration,
    currentInstruction: firstInstruction,
    nextInstruction,
    distanceToNextManeuver: firstStep?.distance || activeRoute.distance,
    isOffRoute: false,
    isArrived: false,
    voiceEnabled: options?.voiceEnabled ?? true,
    status: 'navigating',
    statusMessage: 'Navegação iniciada',
    announcedKeys: [],
  }
}

function formatNextStepInstruction(step: RouteStep): string {
  const dist = formatNavigationDistance(step.distance)
  return `Depois, ${step.instruction.toLowerCase()} por ${dist}`
}

export type ProgressUpdateResult = {
  session: NavigationSession
  announcement?: string
}

/**
 * Atualiza o progresso da navegação a partir do ponto atual do GPS do usuário
 */
export function updateNavigationProgress(
  session: NavigationSession,
  userCoord: Coord,
  options?: {
    arrivalThreshold?: number
    offTrackThreshold?: number
    stepAdvanceThreshold?: number
    positionAccuracyMeters?: number | null
  },
): ProgressUpdateResult {
  if (!session.isNavigating || session.isArrived) {
    return { session }
  }

  const arrivalThreshold = options?.arrivalThreshold ?? ARRIVAL_THRESHOLD_METERS
  const offTrackThreshold = options?.offTrackThreshold ?? ROUTE_OFF_TRACK_THRESHOLD_METERS
  const stepAdvanceThreshold = options?.stepAdvanceThreshold ?? STEP_ADVANCE_THRESHOLD_METERS
  const positionAccuracy = options?.positionAccuracyMeters ?? null

  const destCoord: Coord = [session.destination.longitude, session.destination.latitude]
  const distToDest = haversineDistance(userCoord, destCoord)

  // 1. Chegada ao destino
  if (distToDest <= arrivalThreshold && (positionAccuracy === null || positionAccuracy <= 20)) {
    const arrivedAnnouncement = 'Você chegou ao destino.'
    return {
      session: {
        ...session,
        isNavigating: false,
        isArrived: true,
        remainingDistance: 0,
        remainingDuration: 0,
        distanceToNextManeuver: 0,
        status: 'arrived',
        statusMessage: arrivedAnnouncement,
        currentInstruction: arrivedAnnouncement,
        nextInstruction: undefined,
      },
      announcement: session.voiceEnabled && !session.announcedKeys.includes('arrived') ? arrivedAnnouncement : undefined,
    }
  }

  // 2. Detecção de desvio de rota (Off-track)
  const routeCoords = session.activeRoute.geometry?.coordinates ?? []
  const projection = projectOnRoute(
    userCoord,
    routeCoords,
    Math.max(-10, session.routeProgressMeters - 12),
  )
  const routeProgressMeters = Math.max(session.routeProgressMeters, projection.alongRoute)
  const effectiveOffTrackThreshold = Math.max(
    offTrackThreshold,
    Math.min(positionAccuracy ?? 0, 80),
  )
  const isOffRoute = projection.distance > effectiveOffTrackThreshold

  if (isOffRoute) {
    return {
      session: {
        ...session,
        isOffRoute: true,
        status: 'recalculating',
        statusMessage: 'Fora da rota. Recalculando...',
      },
    }
  }

  // 3. Progresso dos Steps
  const steps = session.activeRoute.steps ?? []
  let stepIndex = session.currentStepIndex
  let currentStep = steps[stepIndex]

  let advancedStep = false
  while (stepIndex < steps.length - 1) {
    const maneuver = steps[stepIndex + 1]
    const maneuverLocation = maneuver?.location
    if (!maneuverLocation) break
    const maneuverProgress = projectOnRoute(maneuverLocation, routeCoords).alongRoute
    const distanceToManeuver = haversineDistance(userCoord, maneuverLocation)
    const hasPassedManeuver = routeProgressMeters >= maneuverProgress
    if (!hasPassedManeuver && distanceToManeuver > stepAdvanceThreshold) break
    if (!hasPassedManeuver) break
    stepIndex++
    currentStep = steps[stepIndex]
    advancedStep = true
  }

  const nextManeuver = steps[stepIndex + 1]?.location ?? destCoord
  const distToManeuver = haversineDistance(userCoord, nextManeuver)

  // Atualiza instruções
  const currentInstruction = currentStep?.instruction || 'Siga em frente'
  const nextStep = steps[stepIndex + 1]
  const nextInstruction = nextStep ? formatNextStepInstruction(nextStep) : undefined

  // Recalcula distância e duração restante aproximadas
  const remainingDistance = Math.max(
    0,
    Math.round(session.activeRoute.distance - routeProgressMeters),
  )
  const remainingDuration = session.activeRoute.distance > 0
    ? Math.max(1, Math.round(session.activeRoute.duration * (remainingDistance / session.activeRoute.distance)))
    : 0

  // 4. Determina avisos de voz
  let announcement: string | undefined
  const announcedKeys = [...session.announcedKeys]

  if (session.voiceEnabled) {
    if (advancedStep) {
      const stepKey = `step-${stepIndex}-advanced`
      if (!announcedKeys.includes(stepKey)) {
        announcedKeys.push(stepKey)
        announcement = currentInstruction
      }
    } else if (distToManeuver <= 50) {
      const immKey = `step-${stepIndex}-50`
      if (!announcedKeys.includes(immKey)) {
        announcedKeys.push(immKey)
        announcement = currentInstruction
      }
    } else if (distToManeuver <= 160 && distToManeuver > 80) {
      const midKey = `step-${stepIndex}-150`
      if (!announcedKeys.includes(midKey)) {
        announcedKeys.push(midKey)
        announcement = `Em 150 metros, ${currentInstruction.toLowerCase()}`
      }
    } else if (distToManeuver <= 350 && distToManeuver > 250) {
      const farKey = `step-${stepIndex}-300`
      if (!announcedKeys.includes(farKey)) {
        announcedKeys.push(farKey)
        announcement = `Em 300 metros, ${currentInstruction.toLowerCase()}`
      }
    }
  }

  return {
    session: {
      ...session,
      currentStepIndex: stepIndex,
      routeProgressMeters,
      remainingDistance,
      remainingDuration,
      currentInstruction,
      nextInstruction,
      distanceToNextManeuver: Math.round(distToManeuver),
      isOffRoute: false,
      status: 'navigating',
      statusMessage: 'Navegação ativa',
      announcedKeys,
    },
    announcement,
  }
}

function projectOnRoute(
  point: Coord,
  route: Coord[],
  minimumProgress = Number.NEGATIVE_INFINITY,
): { distance: number; alongRoute: number } {
  if (route.length === 0) return { distance: Infinity, alongRoute: 0 }
  if (route.length === 1) {
    return { distance: haversineDistance(point, route[0]!), alongRoute: 0 }
  }

  let travelled = 0
  let best = { distance: Infinity, alongRoute: 0 }
  let fallback = best
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index]!
    const end = route[index + 1]!
    const segmentLength = haversineDistance(start, end)
    const meanLatitude = ((start[1] + end[1]) / 2) * (Math.PI / 180)
    const xScale = Math.cos(meanLatitude) * 111_320
    const yScale = 110_540
    const dx = (end[0] - start[0]) * xScale
    const dy = (end[1] - start[1]) * yScale
    const px = (point[0] - start[0]) * xScale
    const py = (point[1] - start[1]) * yScale
    const squaredLength = dx * dx + dy * dy
    const fraction = squaredLength === 0
      ? 0
      : Math.max(0, Math.min(1, (px * dx + py * dy) / squaredLength))
    const projected: Coord = [
      start[0] + fraction * (end[0] - start[0]),
      start[1] + fraction * (end[1] - start[1]),
    ]
    const candidate = {
      distance: haversineDistance(point, projected),
      alongRoute: travelled + fraction * segmentLength,
    }
    if (candidate.distance < fallback.distance) fallback = candidate
    if (candidate.alongRoute >= minimumProgress && candidate.distance < best.distance) best = candidate
    travelled += segmentLength
  }
  return Number.isFinite(best.distance) ? best : fallback
}
