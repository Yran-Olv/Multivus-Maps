export const ROLES = ['ADMIN', 'EDITOR', 'DELIVERY_DRIVER', 'USER'] as const
export type Role = (typeof ROLES)[number]

export const ALIAS_TYPES = ['OLD_NAME', 'POPULAR_NAME', 'ABBREVIATION', 'OTHER'] as const
export type AliasType = (typeof ALIAS_TYPES)[number]

export const DIRECTIONS = ['BOTH', 'FORWARD', 'BACKWARD'] as const
export type Direction = (typeof DIRECTIONS)[number]

export const RESTRICTION_TYPES = [
  'NO_LEFT',
  'NO_RIGHT',
  'NO_U_TURN',
  'MANDATORY_LEFT',
  'MANDATORY_RIGHT',
  'CLOSED',
  'OTHER',
] as const
export type RestrictionType = (typeof RESTRICTION_TYPES)[number]

export const CORRECTION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number]

export const CORRECTION_TYPES = [
  'WRONG_STREET_NAME',
  'STREET_DOES_NOT_EXIST',
  'NEW_STREET',
  'WRONG_DIRECTION',
  'TURN_FORBIDDEN',
  'TURN_ALLOWED',
  'STREET_BLOCKED',
  'WRONG_LOCATION',
  'WRONG_NEIGHBORHOOD',
  'OTHER',
] as const
export type CorrectionType = (typeof CORRECTION_TYPES)[number]

export const CORRECTION_TYPE_LABELS: Record<CorrectionType, string> = {
  WRONG_STREET_NAME: 'Nome da rua incorreto',
  STREET_DOES_NOT_EXIST: 'Rua não existe',
  NEW_STREET: 'Rua nova',
  WRONG_DIRECTION: 'Sentido incorreto',
  TURN_FORBIDDEN: 'Conversão proibida',
  TURN_ALLOWED: 'Conversão permitida',
  STREET_BLOCKED: 'Rua bloqueada',
  WRONG_LOCATION: 'Localização incorreta',
  WRONG_NEIGHBORHOOD: 'Bairro incorreto',
  OTHER: 'Outro',
}

export const ALIAS_TYPE_LABELS: Record<AliasType, string> = {
  OLD_NAME: 'Nome antigo',
  POPULAR_NAME: 'Nome popular',
  ABBREVIATION: 'Abreviação',
  OTHER: 'Outro',
}

export const STREET_TYPES = [
  'RUA',
  'AVENIDA',
  'ALAMEDA',
  'TRAVESSA',
  'BECO',
  'PRACA',
  'RODOVIA',
  'OUTRO',
] as const
export type StreetType = (typeof STREET_TYPES)[number]

/**
 * Centro da sede municipal publicado pela Câmara de Santa Juliana:
 * 19°18'32"S, 47°31'27"W.
 * Não foi lido nem estimado a partir do PDF do perímetro urbano.
 */
export const SANTA_JULIANA_CENTER = {
  latitude: -19.308889,
  longitude: -47.524167,
  label: 'Santa Juliana, MG',
} as const

export const MAP_SOURCE = {
  name: 'Prefeitura Santa Juliana',
  date: '2021-07',
  document: 'MAPA SantaJuliana.pdf',
} as const

export const ACTIONS = [
  'catalog:read',
  'correction:create',
  'correction:review',
  'street:write',
  'restriction:write',
  'place:write',
  'neighborhood:write',
  'user:manage',
  'audit:read',
  'delivery:write',
  'favorite:write',
] as const
export type Action = (typeof ACTIONS)[number]
