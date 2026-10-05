import { z } from 'zod'
import {
  ALIAS_TYPES,
  CORRECTION_TYPES,
  DIRECTIONS,
  RESTRICTION_TYPES,
  ROLES,
  STREET_TYPES,
} from './constants'

export const roleSchema = z.enum(ROLES)
export const aliasTypeSchema = z.enum(ALIAS_TYPES)
export const directionSchema = z.enum(DIRECTIONS)
export const restrictionTypeSchema = z.enum(RESTRICTION_TYPES)
export const correctionTypeSchema = z.enum(CORRECTION_TYPES)
export const streetTypeSchema = z.enum(STREET_TYPES)

const geoJsonSchema = z.record(z.unknown()).nullable()

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const createUserSchema = z.object({
  name: z.string().min(2).max(160),
  email: z.string().email(),
  phone: z.string().min(8).max(20).nullable().optional(),
  password: z.string().min(8).max(128),
  role: roleSchema,
})

export const streetAliasInputSchema = z.object({
  alias: z.string().min(1).max(200),
  aliasType: aliasTypeSchema,
})

export const createStreetSchema = z.object({
  officialName: z.string().min(1).max(200),
  streetType: streetTypeSchema,
  neighborhoodId: z.string().uuid().nullable().optional(),
  source: z.string().min(1).max(200),
  sourceDate: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable().optional(),
  geometry: geoJsonSchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
  aliases: z.array(streetAliasInputSchema).optional(),
})

export const updateStreetSchema = createStreetSchema.partial().extend({
  verified: z.boolean().optional(),
  active: z.boolean().optional(),
})

export const createNeighborhoodSchema = z.object({
  name: z.string().min(1).max(160),
  source: z.string().min(1).max(200).optional(),
  sourceDate: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable().optional(),
})

export const createPlaceSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(80),
  latitude: z.number().gte(-90).lte(90).nullable().optional(),
  longitude: z.number().gte(-180).lte(180).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  neighborhoodId: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  source: z.string().min(1).max(200).optional(),
  sourceDate: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable().optional(),
})

export const createAliasSchema = streetAliasInputSchema.extend({
  streetId: z.string().uuid(),
})

export const createTurnRestrictionSchema = z.object({
  fromSegmentId: z.string().uuid(),
  toSegmentId: z.string().uuid(),
  restrictionType: restrictionTypeSchema,
  description: z.string().max(500).nullable().optional(),
  latitude: z.number().gte(-90).lte(90).nullable().optional(),
  longitude: z.number().gte(-180).lte(180).nullable().optional(),
})

export const createSegmentSchema = z.object({
  streetId: z.string().uuid(),
  direction: directionSchema,
  geometry: geoJsonSchema.optional(),
})

export const createCorrectionSchema = z.object({
  correctionType: correctionTypeSchema,
  description: z.string().min(3).max(2000),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  entityType: z.string().max(80).nullable().optional(),
  entityId: z.string().uuid().nullable().optional(),
  oldValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  clientRequestId: z.string().uuid(),
})

export const reviewCorrectionSchema = z.object({
  reason: z.string().max(1000).optional(),
})

export const createDeliveryLocationSchema = z.object({
  customerName: z.string().max(160).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  streetId: z.string().uuid().nullable().optional(),
  streetNumber: z.string().max(20).nullable().optional(),
  complement: z.string().max(160).nullable().optional(),
  reference: z.string().max(500).nullable().optional(),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  facadePhoto: z.string().max(1_500_000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  customerInput: z.string().max(2000).nullable().optional(),
  matchedAlias: z.string().max(200).nullable().optional(),
  clientRequestId: z.string().uuid(),
})

export const createFavoriteSchema = z.object({
  streetId: z.string().uuid().nullable().optional(),
  placeId: z.string().uuid().nullable().optional(),
  deliveryLocationId: z.string().uuid().nullable().optional(),
  label: z.string().min(1).max(200),
  customerInput: z.string().max(2000).nullable().optional(),
  matchedAlias: z.string().max(200).nullable().optional(),
  clientRequestId: z.string().uuid(),
})

export const syncOperationSchema = z.object({
  clientId: z.string().uuid(),
  operation: z.enum(['map-correction', 'delivery-location', 'favorite']),
  payload: z.record(z.unknown()),
  createdAt: z.string(),
})

export const syncBatchSchema = z.object({
  operations: z.array(syncOperationSchema).min(1).max(100),
})

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(2000),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type CreateStreetInput = z.infer<typeof createStreetSchema>
export type UpdateStreetInput = z.infer<typeof updateStreetSchema>
export type CreateCorrectionInput = z.infer<typeof createCorrectionSchema>
export type CreateDeliveryLocationInput = z.infer<typeof createDeliveryLocationSchema>
export type SearchResult = {
  kind: 'street' | 'place' | 'neighborhood'
  id: string
  title: string
  subtitle: string | null
  streetType: string | null
  neighborhoodName: string | null
  matchedAlias: string | null
  matchedAliasType: string | null
  verified: boolean
  source: string | null
  sourceDate: string | null
  latitude: number | null
  longitude: number | null
  geometry: unknown | null
  warning: string | null
  usedOldName: boolean
  oldNames: string[]
  confidence: number
}
