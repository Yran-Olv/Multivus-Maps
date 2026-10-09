import type { SelectedPlace } from '../stores/ui'

export function hasValidDestinationCoordinates(
  destination: Pick<SelectedPlace, 'latitude' | 'longitude'> | null | undefined,
): destination is Pick<SelectedPlace, 'latitude' | 'longitude'> & { latitude: number; longitude: number } {
  if (!destination) return false
  const { latitude, longitude } = destination
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

export type DestinationPrecision = {
  isNavigable: boolean
  label: string
  detail: string
  badgeColor: 'emerald' | 'amber' | 'sky' | 'rose'
  isEstimated: boolean
  isAccessOnly: boolean
}

export function getDestinationPrecision(
  destination: SelectedPlace | null | undefined,
  requestedNumber = '',
): DestinationPrecision {
  if (!destination || !hasValidDestinationCoordinates(destination)) {
    return {
      isNavigable: false,
      label: 'Sem coordenadas cadastradas',
      detail: 'Este destino não possui traçado ou coordenadas no mapa. Não é possível iniciar navegação sem coordenadas.',
      badgeColor: 'amber',
      isEstimated: false,
      isAccessOnly: false,
    }
  }

  if (destination.kind === 'landmark' || destination.kind === 'place') {
    return {
      isNavigable: true,
      label: 'Ponto comercial verificado',
      detail: destination.reference ? `Referência: ${destination.reference}` : 'Local de referência comercial com coordenadas conferidas.',
      badgeColor: 'emerald',
      isEstimated: false,
      isAccessOnly: false,
    }
  }

  const num = requestedNumber.trim()
  if (destination.coordinateType === 'address-point' && destination.numberVerified) {
    if (num && destination.resolvedNumber && destination.resolvedNumber !== num) {
      return {
        isNavigable: true,
        label: 'Acesso da via (número não localizado)',
        detail: `Ponto mapeado é do nº ${destination.resolvedNumber}. O número ${num} não foi conferido individualmente.`,
        badgeColor: 'amber',
        isEstimated: true,
        isAccessOnly: true,
      }
    }
    return {
      isNavigable: true,
      label: `Ponto predial verificado${destination.resolvedNumber ? ` (Nº ${destination.resolvedNumber})` : ''}`,
      detail: 'Entrada predial com coordenadas geográficas conferidas no local.',
      badgeColor: 'emerald',
      isEstimated: false,
      isAccessOnly: false,
    }
  }

  if (destination.coordinateType === 'estimated') {
    return {
      isNavigable: true,
      label: 'Destino estimado',
      detail: 'Localização estimada com base no trecho correspondente da via.',
      badgeColor: 'sky',
      isEstimated: true,
      isAccessOnly: false,
    }
  }

  return {
    isNavigable: true,
    label: 'Acesso da via (geometria da rua)',
    detail: num
      ? `Número ${num} não localizado no mapa — navegando até o acesso da via.`
      : 'Navegando até o acesso da via (número predial não informado).',
    badgeColor: 'sky',
    isEstimated: false,
    isAccessOnly: true,
  }
}

export function isNavigableDestination(
  destination: SelectedPlace | null | undefined,
  _requestedNumber = '',
): destination is SelectedPlace & { latitude: number; longitude: number } {
  if (!destination || !hasValidDestinationCoordinates(destination)) return false
  if (destination.coordinatesVerified === false) return false

  if (destination.kind === 'landmark' || destination.kind === 'place' || destination.kind === 'reference') {
    return true
  }

  if (destination.kind === 'street') {
    // Endereço predial verificado
    if (destination.coordinateType === 'address-point') {
      return true
    }
    // Acesso da via ou estimativa sobre geometria existente
    if (
      destination.coordinateType === 'street-access' ||
      destination.coordinateType === 'street' ||
      destination.coordinateType === 'estimated'
    ) {
      return true
    }
    // Fallback: se possui coordenadas válidas e rua verificada/com fonte
    if (destination.verified || Boolean(destination.source)) {
      return true
    }
  }

  return false
}

