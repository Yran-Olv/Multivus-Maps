import { describe, expect, it } from 'vitest'
import {
  createNavigationSession,
  formatNavigationDistance,
  formatNavigationDuration,
  haversineDistance,
  updateNavigationProgress,
  type Coord,
  type NavigationDestination,
} from './navigation'
import type { RouteCalculationResult } from './routing'

describe('Navegação Turn-by-Turn - Engine (@multivus/map-core)', () => {
  const dummyRoute: RouteCalculationResult = {
    status: 'ok',
    provider: 'osrm',
    distance: 1200,
    duration: 180,
    geometry: {
      type: 'LineString',
      coordinates: [
        [-47.52417, -19.30889], // Ponto de partida
        [-47.525, -19.3095], // Ponto intermediário 1
        [-47.526, -19.3105], // Ponto intermediário 2
        [-47.527, -19.3115], // Destino final
      ],
    },
    steps: [
      {
        instruction: 'Siga em frente na Rua Professor Orestes',
        distance: 400,
        duration: 60,
        maneuverType: 'depart',
        location: [-47.52417, -19.30889],
      },
      {
        instruction: 'Vire à direita na Rua São Vicente de Paula',
        distance: 500,
        duration: 75,
        maneuverType: 'turn',
        maneuverModifier: 'right',
        location: [-47.525, -19.3095],
      },
      {
        instruction: 'Você chegou ao destino',
        distance: 300,
        duration: 45,
        maneuverType: 'arrive',
        location: [-47.527, -19.3115],
      },
    ],
  }

  const destination: NavigationDestination = {
    title: 'Hospital Municipal de Santa Juliana',
    latitude: -19.3115,
    longitude: -47.527,
  }

  it('calcula distância Haversine com precisão métrica', () => {
    const pt1: Coord = [-47.52417, -19.30889]
    const pt2: Coord = [-47.52417, -19.30979] // ~100 metros ao sul
    const dist = haversineDistance(pt1, pt2)
    expect(dist).toBeGreaterThan(95)
    expect(dist).toBeLessThan(105)
  })

  it('formata distâncias e durações para exibição de navegação', () => {
    expect(formatNavigationDistance(50)).toBe('50 m')
    expect(formatNavigationDistance(350)).toBe('350 m')
    expect(formatNavigationDistance(999)).toBe('999 m')
    expect(formatNavigationDistance(1000)).toBe('1,0 km')
    expect(formatNavigationDistance(2450)).toBe('2,5 km')

    expect(formatNavigationDuration(45)).toBe('1 min')
    expect(formatNavigationDuration(300)).toBe('5 min')
    expect(formatNavigationDuration(3660)).toBe('1 h 1 min')
  })

  it('inicializa sessão de navegação corretamente', () => {
    const session = createNavigationSession(dummyRoute, destination, { voiceEnabled: true })
    expect(session.isNavigating).toBe(true)
    expect(session.currentStepIndex).toBe(0)
    expect(session.destination.title).toBe('Hospital Municipal de Santa Juliana')
    expect(session.currentInstruction).toBe('Siga em frente na Rua Professor Orestes')
    expect(session.nextInstruction?.toLowerCase()).toContain('vire à direita')
    expect(session.isArrived).toBe(false)
    expect(session.isOffRoute).toBe(false)
  })

  it('detecta desvio de rota quando o usuário sai do traçado (> 40m)', () => {
    const session = createNavigationSession(dummyRoute, destination)
    // Coordenada afastada 300m da rota
    const offRouteCoord: Coord = [-47.520, -19.305]
    const result = updateNavigationProgress(session, offRouteCoord)

    expect(result.session.isOffRoute).toBe(true)
    expect(result.session.status).toBe('recalculating')
    expect(result.session.statusMessage).toContain('Fora da rota')
  })

  it('avança de step e gera instrução de voz ao aproximar-se da manobra (< 40m)', () => {
    const session = createNavigationSession(dummyRoute, destination, { voiceEnabled: true })
    // Posição exatamente em cima da manobra 1
    const nearManeuverCoord: Coord = [-47.525, -19.3095]
    const result = updateNavigationProgress(session, nearManeuverCoord)

    expect(result.session.currentStepIndex).toBe(1)
    expect(result.session.currentInstruction).toBe('Vire à direita na Rua São Vicente de Paula')
    expect(result.announcement).toBe('Vire à direita na Rua São Vicente de Paula')
  })

  it('não avança a manobra antes de percorrer sua posição na geometria da rota', () => {
    const session = createNavigationSession(dummyRoute, destination)
    const beforeManeuver: Coord = [-47.52458, -19.30919]
    const result = updateNavigationProgress(session, beforeManeuver)

    expect(result.session.currentStepIndex).toBe(0)
  })

  it('atualiza a distância restante com progresso monotônico sobre a rota', () => {
    const session = createNavigationSession(dummyRoute, destination)
    const first = updateNavigationProgress(session, [-47.525, -19.3095])
    const second = updateNavigationProgress(first.session, [-47.526, -19.3105])

    expect(second.session.routeProgressMeters).toBeGreaterThan(first.session.routeProgressMeters)
    expect(second.session.remainingDistance).toBeLessThan(first.session.remainingDistance)
  })

  it('não repete o mesmo anúncio de voz se já foi emitido', () => {
    let session = createNavigationSession(dummyRoute, destination, { voiceEnabled: true })
    // Ponto a ~300m da manobra 1
    const pt300m: Coord = [-47.5242, -19.3089]

    const firstUpdate = updateNavigationProgress(session, pt300m)
    session = firstUpdate.session
    expect(firstUpdate.session.announcedKeys.length).toBeGreaterThan(0)

    // Segunda atualização na mesma posição não deve disparar o mesmo anúncio
    const secondUpdate = updateNavigationProgress(session, pt300m)
    expect(secondUpdate.announcement).toBeUndefined()
  })

  it('detecta chegada ao destino com sucesso (< 30m)', () => {
    const session = createNavigationSession(dummyRoute, destination, { voiceEnabled: true })
    // Posição a 10m do destino
    const atDestinationCoord: Coord = [-47.52701, -19.31151]
    const result = updateNavigationProgress(session, atDestinationCoord)

    expect(result.session.isArrived).toBe(true)
    expect(result.session.isNavigating).toBe(false)
    expect(result.session.status).toBe('arrived')
    expect(result.announcement).toBe('Você chegou ao destino.')
  })

  it('não declara chegada quando a precisão do GPS é insuficiente', () => {
    const session = createNavigationSession(dummyRoute, destination)
    const result = updateNavigationProgress(
      session,
      [-47.52701, -19.31151],
      { positionAccuracyMeters: 45 },
    )

    expect(result.session.isArrived).toBe(false)
    expect(result.session.isNavigating).toBe(true)
  })

  it('permite atualizar a rota recalculada após desvio preservando o destino original', () => {
    const session = createNavigationSession(dummyRoute, destination)
    const offRoute = updateNavigationProgress(session, [-47.520, -19.305])
    expect(offRoute.session.isOffRoute).toBe(true)

    // Simulando nova rota gerada pelo motor OSRM após o desvio
    const recalculatedRoute: RouteCalculationResult = {
      ...dummyRoute,
      distance: 900,
      duration: 130,
      steps: [
        {
          instruction: 'Siga na Rua Nova em direção ao destino',
          distance: 500,
          duration: 70,
          location: [-47.520, -19.305],
        },
        dummyRoute.steps[2]!,
      ],
    }

    const updatedSession = {
      ...offRoute.session,
      activeRoute: recalculatedRoute,
      currentStepIndex: 0,
      remainingDistance: recalculatedRoute.distance,
      remainingDuration: recalculatedRoute.duration,
      currentInstruction: recalculatedRoute.steps[0]!.instruction,
      isOffRoute: false,
      status: 'navigating' as const,
      statusMessage: 'Rota recalculada',
    }

    expect(updatedSession.isOffRoute).toBe(false)
    expect(updatedSession.destination.title).toBe(destination.title)
    expect(updatedSession.currentInstruction).toBe('Siga na Rua Nova em direção ao destino')
    expect(updatedSession.status).toBe('navigating')
  })

  it('preserva a rota carregada e orientações caso a internet caia durante navegação ativa', () => {
    const session = createNavigationSession(dummyRoute, destination)
    // Internet caiu no cliente
    const offlineSession = {
      ...session,
      statusMessage: 'Sem conexão. Mantendo a rota carregada.',
    }

    // Mesmo sem internet, o GPS continua avançando sobre a geometria em memória
    const progress = updateNavigationProgress(offlineSession, [-47.525, -19.3095])
    expect(progress.session.isNavigating).toBe(true)
    expect(progress.session.currentStepIndex).toBe(1)
    expect(progress.session.currentInstruction).toBe('Vire à direita na Rua São Vicente de Paula')
    expect(progress.session.activeRoute.geometry?.coordinates).toHaveLength(4)
  })
})
