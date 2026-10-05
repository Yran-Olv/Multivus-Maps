export type LngLat = {
  longitude: number
  latitude: number
}

export type RouteStep = {
  instruction: string
  distance: number
  duration: number
  name?: string
  maneuverType?: string
}

export type RouteCalculationResult = {
  status: 'ok' | 'not_implemented' | 'error'
  provider: string
  distance: number
  duration: number
  geometry: {
    type: 'LineString'
    coordinates: [number, number][]
  } | null
  steps: RouteStep[]
  message?: string
}

export interface RoutingProvider {
  readonly name: string
  calculateRoute(origin: LngLat, destination: LngLat): Promise<RouteCalculationResult>
  calculateMultiStopRoute(origin: LngLat, destinations: LngLat[]): Promise<RouteCalculationResult>
}

/**
 * Provedor OSRM (Open Source Routing Machine)
 * Utiliza o endpoint /route/v1/driving/{coords}?overview=full&geometries=geojson&steps=true
 */
export class OSRMProvider implements RoutingProvider {
  readonly name = 'osrm'
  readonly baseUrl: string
  readonly profile: string

  constructor(options?: { baseUrl?: string; profile?: string }) {
    this.baseUrl = (options?.baseUrl || 'https://router.project-osrm.org').replace(/\/+$/, '')
    this.profile = options?.profile || 'driving'
  }

  async calculateRoute(origin: LngLat, destination: LngLat): Promise<RouteCalculationResult> {
    const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`
    const url = `${this.baseUrl}/route/v1/${this.profile}/${coords}?overview=full&geometries=geojson&steps=true`

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) {
        return {
          status: 'error',
          provider: this.name,
          distance: 0,
          duration: 0,
          geometry: null,
          steps: [],
          message: `OSRM retornou HTTP ${response.status}`,
        }
      }
      const data = (await response.json()) as {
        code: string
        routes?: Array<{
          distance: number
          duration: number
          geometry: { type: 'LineString'; coordinates: [number, number][] }
          legs?: Array<{
            steps?: Array<{
              distance: number
              duration: number
              name: string
              maneuver?: { type: string; modifier?: string }
            }>
          }>
        }>
        message?: string
      }

      if (data.code !== 'Ok' || !data.routes?.[0]) {
        return {
          status: 'error',
          provider: this.name,
          distance: 0,
          duration: 0,
          geometry: null,
          steps: [],
          message: data.message || 'Nenhuma rota encontrada pelo OSRM.',
        }
      }

      const route = data.routes[0]
      const rawSteps = route.legs?.flatMap((leg) => leg.steps ?? []) ?? []
      const steps: RouteStep[] = rawSteps.map((step) => ({
        instruction: translateManeuver(step.maneuver?.type, step.maneuver?.modifier, step.name),
        distance: Math.round(step.distance),
        duration: Math.round(step.duration),
        name: step.name || undefined,
        maneuverType: step.maneuver?.type,
      }))

      return {
        status: 'ok',
        provider: this.name,
        distance: Math.round(route.distance),
        duration: Math.round(route.duration),
        geometry: route.geometry,
        steps,
      }
    } catch (error) {
      return {
        status: 'error',
        provider: this.name,
        distance: 0,
        duration: 0,
        geometry: null,
        steps: [],
        message: error instanceof Error ? error.message : 'Falha na conexão com motor OSRM',
      }
    }
  }

  async calculateMultiStopRoute(origin: LngLat, destinations: LngLat[]): Promise<RouteCalculationResult> {
    if (destinations.length === 0) {
      return {
        status: 'error',
        provider: this.name,
        distance: 0,
        duration: 0,
        geometry: null,
        steps: [],
        message: 'Nenhum destino fornecido.',
      }
    }
    const all = [origin, ...destinations]
    const coords = all.map((pt) => `${pt.longitude},${pt.latitude}`).join(';')
    const url = `${this.baseUrl}/route/v1/${this.profile}/${coords}?overview=full&geometries=geojson&steps=true`

    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!response.ok) {
        return {
          status: 'error',
          provider: this.name,
          distance: 0,
          duration: 0,
          geometry: null,
          steps: [],
          message: `OSRM retornou HTTP ${response.status}`,
        }
      }
      const data = (await response.json()) as {
        code: string
        routes?: Array<{
          distance: number
          duration: number
          geometry: { type: 'LineString'; coordinates: [number, number][] }
        }>
      }
      if (data.code !== 'Ok' || !data.routes?.[0]) {
        return {
          status: 'error',
          provider: this.name,
          distance: 0,
          duration: 0,
          geometry: null,
          steps: [],
          message: 'Não foi possível calcular a rota multi-paradas.',
        }
      }
      const route = data.routes[0]
      return {
        status: 'ok',
        provider: this.name,
        distance: Math.round(route.distance),
        duration: Math.round(route.duration),
        geometry: route.geometry,
        steps: [],
      }
    } catch (error) {
      return {
        status: 'error',
        provider: this.name,
        distance: 0,
        duration: 0,
        geometry: null,
        steps: [],
        message: error instanceof Error ? error.message : 'Falha na conexão com OSRM',
      }
    }
  }
}

/**
 * Adapter para Valhalla
 */
export class ValhallaProvider implements RoutingProvider {
  readonly name = 'valhalla'
  readonly baseUrl: string
  readonly costing: string

  constructor(options?: { baseUrl?: string; costing?: string }) {
    this.baseUrl = (options?.baseUrl || 'http://localhost:8002').replace(/\/+$/, '')
    this.costing = options?.costing || 'auto'
  }

  async calculateRoute(origin: LngLat, destination: LngLat): Promise<RouteCalculationResult> {
    const payload = {
      locations: [
        { lat: origin.latitude, lon: origin.longitude },
        { lat: destination.latitude, lon: destination.longitude },
      ],
      costing: this.costing,
      directions_options: { language: 'pt-BR' },
    }
    try {
      const response = await fetch(`${this.baseUrl}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        return {
          status: 'error',
          provider: this.name,
          distance: 0,
          duration: 0,
          geometry: null,
          steps: [],
          message: `Valhalla HTTP ${response.status}`,
        }
      }
      const data = (await response.json()) as {
        trip?: {
          summary?: { length: number; time: number }
          legs?: Array<{
            maneuvers?: Array<{ instruction: string; length: number; time: number }>
          }>
        }
      }
      const summary = data.trip?.summary
      return {
        status: 'ok',
        provider: this.name,
        distance: Math.round((summary?.length ?? 0) * 1000),
        duration: Math.round(summary?.time ?? 0),
        geometry: null,
        steps: (data.trip?.legs?.[0]?.maneuvers ?? []).map((m) => ({
          instruction: m.instruction,
          distance: Math.round(m.length * 1000),
          duration: Math.round(m.time),
        })),
      }
    } catch (error) {
      return {
        status: 'error',
        provider: this.name,
        distance: 0,
        duration: 0,
        geometry: null,
        steps: [],
        message: error instanceof Error ? error.message : 'Falha na conexão com Valhalla',
      }
    }
  }

  async calculateMultiStopRoute(origin: LngLat, destinations: LngLat[]): Promise<RouteCalculationResult> {
    return this.calculateRoute(origin, destinations[destinations.length - 1]!)
  }
}

/**
 * Adapter para GraphHopper
 */
export class GraphHopperProvider implements RoutingProvider {
  readonly name = 'graphhopper'
  readonly baseUrl: string
  readonly apiKey?: string

  constructor(options?: { baseUrl?: string; apiKey?: string }) {
    this.baseUrl = (options?.baseUrl || 'https://graphhopper.com/api/1').replace(/\/+$/, '')
    this.apiKey = options?.apiKey
  }

  async calculateRoute(origin: LngLat, destination: LngLat): Promise<RouteCalculationResult> {
    const keyParam = this.apiKey ? `&key=${encodeURIComponent(this.apiKey)}` : ''
    const url = `${this.baseUrl}/route?point=${origin.latitude},${origin.longitude}&point=${destination.latitude},${destination.longitude}&vehicle=car&points_encoded=false${keyParam}`
    try {
      const response = await fetch(url)
      if (!response.ok) {
        return {
          status: 'error',
          provider: this.name,
          distance: 0,
          duration: 0,
          geometry: null,
          steps: [],
          message: `GraphHopper HTTP ${response.status}`,
        }
      }
      const data = (await response.json()) as {
        paths?: Array<{
          distance: number
          time: number
          points?: { coordinates: [number, number][] }
          instructions?: Array<{ text: string; distance: number; time: number }>
        }>
      }
      const path = data.paths?.[0]
      if (!path) {
        return {
          status: 'error',
          provider: this.name,
          distance: 0,
          duration: 0,
          geometry: null,
          steps: [],
          message: 'Nenhum caminho retornado pelo GraphHopper',
        }
      }
      return {
        status: 'ok',
        provider: this.name,
        distance: Math.round(path.distance),
        duration: Math.round(path.time / 1000),
        geometry: path.points ? { type: 'LineString', coordinates: path.points.coordinates } : null,
        steps: (path.instructions ?? []).map((ins) => ({
          instruction: ins.text,
          distance: Math.round(ins.distance),
          duration: Math.round(ins.time / 1000),
        })),
      }
    } catch (error) {
      return {
        status: 'error',
        provider: this.name,
        distance: 0,
        duration: 0,
        geometry: null,
        steps: [],
        message: error instanceof Error ? error.message : 'Falha na conexão com GraphHopper',
      }
    }
  }

  async calculateMultiStopRoute(origin: LngLat, destinations: LngLat[]): Promise<RouteCalculationResult> {
    return this.calculateRoute(origin, destinations[destinations.length - 1]!)
  }
}

/**
 * Provedor padrão não configurado (fallback seguro)
 */
export class UnconfiguredRoutingProvider implements RoutingProvider {
  readonly name = 'unconfigured'

  async calculateRoute(_origin: LngLat, _destination: LngLat): Promise<RouteCalculationResult> {
    return {
      status: 'not_implemented',
      provider: this.name,
      distance: 0,
      duration: 0,
      geometry: null,
      steps: [],
      message: 'Motor de rotas ainda não configurado.',
    }
  }

  async calculateMultiStopRoute(_origin: LngLat, _destinations: LngLat[]): Promise<RouteCalculationResult> {
    return {
      status: 'not_implemented',
      provider: this.name,
      distance: 0,
      duration: 0,
      geometry: null,
      steps: [],
      message: 'Motor de rotas ainda não configurado.',
    }
  }
}

/**
 * Traduz as manobras do OSRM para instruções em português simples para entregadores
 */
function translateManeuver(type?: string, modifier?: string, streetName?: string): string {
  const target = streetName && streetName !== '' ? ` em ${streetName}` : ''
  switch (type) {
    case 'depart':
      return `Siga em frente${target}`
    case 'arrive':
      return 'Você chegou ao destino'
    case 'turn': {
      if (modifier === 'right') return `Vire à direita${target}`
      if (modifier === 'left') return `Vire à esquerda${target}`
      if (modifier === 'slight right') return `Mantenha-se à direita${target}`
      if (modifier === 'slight left') return `Mantenha-se à esquerda${target}`
      if (modifier === 'sharp right') return `Curva fechada à direita${target}`
      if (modifier === 'sharp left') return `Curva fechada à esquerda${target}`
      if (modifier === 'uturn') return `Faça o retorno${target}`
      return `Vire${target}`
    }
    case 'new name':
    case 'continue':
      return `Continue${target}`
    case 'roundabout':
      return `Entre na rotatória e pegue a saída indicada${target}`
    default:
      return streetName ? `Siga por ${streetName}` : 'Siga em frente'
  }
}

/**
 * Factory para criar o provedor de rotas de acordo com a configuração de ambiente
 */
export function createRoutingProvider(config?: {
  provider?: string
  osrmBaseUrl?: string
  valhallaBaseUrl?: string
  graphHopperBaseUrl?: string
  graphHopperApiKey?: string
}): RoutingProvider {
  const providerType = config?.provider?.toLowerCase() || 'osrm'
  if (providerType === 'osrm') {
    return new OSRMProvider({
      baseUrl: config?.osrmBaseUrl,
    })
  }
  if (providerType === 'valhalla') {
    return new ValhallaProvider({
      baseUrl: config?.valhallaBaseUrl,
    })
  }
  if (providerType === 'graphhopper') {
    return new GraphHopperProvider({
      baseUrl: config?.graphHopperBaseUrl,
      apiKey: config?.graphHopperApiKey,
    })
  }
  if (providerType === 'unconfigured') {
    return new UnconfiguredRoutingProvider()
  }
  return new OSRMProvider({
    baseUrl: config?.osrmBaseUrl,
  })
}
