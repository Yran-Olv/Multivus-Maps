export type LngLat = {
  longitude: number
  latitude: number
}

export type RouteResult = {
  status: 'not_implemented'
  provider: string
  message: string
}

export interface RoutingProvider {
  readonly name: string
  calculateRoute(origin: LngLat, destination: LngLat): Promise<RouteResult>
  calculateMultiStopRoute(origin: LngLat, destinations: LngLat[]): Promise<RouteResult>
}

/**
 * Ponto de encaixe para Valhalla, OSRM ou GraphHopper.
 * A primeira versão não calcula rota.
 */
export class UnconfiguredRoutingProvider implements RoutingProvider {
  readonly name = 'unconfigured'

  async calculateRoute(_origin: LngLat, _destination: LngLat): Promise<RouteResult> {
    return {
      status: 'not_implemented',
      provider: this.name,
      message: 'Motor de rotas ainda não configurado.',
    }
  }

  async calculateMultiStopRoute(_origin: LngLat, _destinations: LngLat[]): Promise<RouteResult> {
    return {
      status: 'not_implemented',
      provider: this.name,
      message: 'Motor de rotas ainda não configurado.',
    }
  }
}
