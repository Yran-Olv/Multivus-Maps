export const APP_VERSION = '1.3.0'
export const APP_BUILD_DATE = '2026-10-09'
export const APP_BUILD_ID = '20261009.1'

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
  'NEW_LANDMARK',
  'NEW_POPULAR_NAME',
  'POTHOLE',
  'ROADWORK',
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
  STREET_BLOCKED: 'Rua bloqueada / fechada',
  WRONG_LOCATION: 'Localização incorreta',
  WRONG_NEIGHBORHOOD: 'Bairro incorreto',
  NEW_LANDMARK: 'Novo ponto de referência',
  NEW_POPULAR_NAME: 'Novo nome popular / referência',
  POTHOLE: 'Buraco perigoso na via',
  ROADWORK: 'Obra na via',
  OTHER: 'Outro',
}

export const LANDMARK_CATEGORIES = [
  'hospital',
  'praca',
  'escola',
  'igreja',
  'posto',
  'comercio',
  'orgao_publico',
  'outro',
] as const
export type LandmarkCategory = (typeof LANDMARK_CATEGORIES)[number]

export const LANDMARK_CATEGORY_LABELS: Record<LandmarkCategory, string> = {
  hospital: 'Hospital / Saúde',
  praca: 'Praça',
  escola: 'Escola / Educação',
  igreja: 'Igreja / Templo',
  posto: 'Posto de Combustível',
  comercio: 'Comércio / Serviço',
  orgao_publico: 'Órgão Público',
  outro: 'Outro',
}

export const RELATION_TYPES = [
  'ON_STREET',
  'NEAR',
  'BEHIND',
  'IN_FRONT_OF',
  'NEXT_TO',
  'CORNER',
  'OTHER',
] as const
export type RelationType = (typeof RELATION_TYPES)[number]

export const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  ON_STREET: 'Na rua de',
  NEAR: 'Perto de',
  BEHIND: 'Atrás de',
  IN_FRONT_OF: 'Em frente a',
  NEXT_TO: 'Ao lado de',
  CORNER: 'Na esquina com',
  OTHER: 'Outra relação',
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

/** ==== Navegação e câmera ==== */

/** Zoom inicial ao iniciar a navegação, antes de acompanhar o GPS. */
export const STARTING_ZOOM = 15

/** Zoom comum na navegação (estável e confortável). */
export const NAVIGATION_ZOOM = 15

/** Zoom mínimo autorizado para o método de acompanhamento. */
export const CAMERA_MIN_ZOOM = 12

/** Zoom máximo autorizado para o método de acompanhamento. */
export const CAMERA_MAX_ZOOM = 19

/**
 * Fator de suavização para a câmera durante o acompanhamento GPS.
 * Menor valor = movimento mais suave e previsível.
 */
export const CAMERA_FOLLOW_EASING = 0.18

/**
 * Tolerância de entrada do GPS antes de reavaliar o movimento da câmera.
 * Serve para ignorar pequenas oscilações que não justificam animação.
 */
export const CAMERA_GPS_TOLERANCE_MEDIUM = 6

/**
 * Tolerância de entrada do GPS para despachar animação de grande deslocamento.
 */
export const CAMERA_GPS_TOLERANCE_LARGE = 55

/** Distância mínima em metros entre destino e rua receptor para tratar o destino como estimado. */
export const MAX_FINAL_POINT_DISTANCE_FROM_ROAD_M = 28
