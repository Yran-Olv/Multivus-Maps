export function streetPrefix(streetType?: string | null): string {
  if (streetType === 'AVENIDA') return 'Avenida'
  if (streetType === 'ALAMEDA') return 'Alameda'
  if (streetType === 'BECO') return 'Beco'
  if (streetType === 'TRAVESSA') return 'Travessa'
  return 'Rua'
}

export function presentStreetName(name: string, streetType?: string | null): string {
  const trimmed = name.trim()
  if (/^(rua|r\.|avenida|av\.|alameda|beco|travessa)\b/i.test(trimmed)) return trimmed
  return `${streetPrefix(streetType)} ${trimmed}`
}

export function confidenceOf(input: {
  verified: boolean
  confidence?: number | null
  source?: string | null
}): number {
  if (typeof input.confidence === 'number') return input.confidence
  if (input.verified) return 100
  if (input.source) return 70
  return 0
}
