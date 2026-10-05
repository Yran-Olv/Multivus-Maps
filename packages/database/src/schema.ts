import { sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const geometry = customType<{ data: string | null }>({
  dataType() {
    return 'geometry(Geometry, 4326)'
  },
})

const point = customType<{ data: string | null }>({
  dataType() {
    return 'geometry(Point, 4326)'
  },
})

export const userRole = pgEnum('user_role', ['ADMIN', 'EDITOR', 'DELIVERY_DRIVER', 'USER'])
export const aliasType = pgEnum('alias_type', ['OLD_NAME', 'POPULAR_NAME', 'ABBREVIATION', 'OTHER'])
export const direction = pgEnum('segment_direction', ['BOTH', 'FORWARD', 'BACKWARD'])
export const restrictionType = pgEnum('restriction_type', [
  'NO_LEFT',
  'NO_RIGHT',
  'NO_U_TURN',
  'MANDATORY_LEFT',
  'MANDATORY_RIGHT',
  'CLOSED',
  'OTHER',
])
export const correctionStatus = pgEnum('correction_status', ['PENDING', 'APPROVED', 'REJECTED'])
export const syncStatus = pgEnum('sync_status', ['PENDING', 'SYNCED', 'FAILED'])

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const cities = pgTable('cities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  state: text('state').notNull(),
  country: text('country').notNull(),
  centerLat: doublePrecision('center_lat').notNull(),
  centerLng: doublePrecision('center_lng').notNull(),
  centerSource: text('center_source').notNull(),
  ...timestamps,
}, (table) => [uniqueIndex('cities_name_state_unique').on(table.name, table.state)])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('USER'),
  active: boolean('active').notNull().default(true),
  ...timestamps,
})

export const neighborhoods = pgTable('neighborhoods', {
  id: uuid('id').primaryKey().defaultRandom(),
  cityId: uuid('city_id').notNull().references(() => cities.id),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  geometry: geometry('geometry'),
  source: text('source').notNull(),
  sourceDate: text('source_date'),
  active: boolean('active').notNull().default(true),
  ...timestamps,
}, (table) => [uniqueIndex('neighborhoods_city_name_unique').on(table.cityId, table.normalizedName)])

export const streets = pgTable('streets', {
  id: uuid('id').primaryKey().defaultRandom(),
  cityId: uuid('city_id').notNull().references(() => cities.id),
  neighborhoodId: uuid('neighborhood_id').references(() => neighborhoods.id),
  officialName: text('official_name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  streetType: text('street_type').notNull(),
  geometry: geometry('geometry'),
  source: text('source').notNull(),
  sourceDate: text('source_date'),
  verified: boolean('verified').notNull().default(false),
  verifiedBy: uuid('verified_by').references(() => users.id),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  confidenceScore: integer('confidence_score').notNull().default(70),
  active: boolean('active').notNull().default(true),
  notes: text('notes'),
  ...timestamps,
}, (table) => [uniqueIndex('streets_city_normalized_unique').on(table.cityId, table.normalizedName)])

export const streetAliases = pgTable('street_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  streetId: uuid('street_id').notNull().references(() => streets.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
  normalizedAlias: text('normalized_alias').notNull(),
  aliasType: aliasType('alias_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('street_aliases_unique').on(table.streetId, table.normalizedAlias, table.aliasType),
])

export const streetNameHistory = pgTable('street_name_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  streetId: uuid('street_id').notNull().references(() => streets.id, { onDelete: 'cascade' }),
  oldName: text('old_name').notNull(),
  newName: text('new_name').notNull(),
  effectiveDate: date('effective_date'),
  source: text('source').notNull(),
  sourceDate: text('source_date'),
  verified: boolean('verified').notNull().default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedBy: uuid('verified_by').references(() => users.id),
  confidenceScore: integer('confidence_score').notNull().default(70),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const streetSegments = pgTable('street_segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  streetId: uuid('street_id').notNull().references(() => streets.id, { onDelete: 'cascade' }),
  geometry: geometry('geometry'),
  direction: direction('direction').notNull().default('BOTH'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const turnRestrictions = pgTable('turn_restrictions', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromSegmentId: uuid('from_segment_id').notNull().references(() => streetSegments.id, { onDelete: 'cascade' }),
  toSegmentId: uuid('to_segment_id').notNull().references(() => streetSegments.id, { onDelete: 'cascade' }),
  restrictionType: restrictionType('restriction_type').notNull(),
  description: text('description'),
  geometryPoint: point('geometry_point'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const places = pgTable('places', {
  id: uuid('id').primaryKey().defaultRandom(),
  cityId: uuid('city_id').notNull().references(() => cities.id),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  category: text('category').notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  address: text('address'),
  neighborhoodId: uuid('neighborhood_id').references(() => neighborhoods.id),
  description: text('description'),
  source: text('source').notNull(),
  sourceDate: text('source_date'),
  verified: boolean('verified').notNull().default(false),
  active: boolean('active').notNull().default(true),
  ...timestamps,
})

export const deliveryLocations = pgTable('delivery_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerName: text('customer_name'),
  phone: text('phone'),
  streetId: uuid('street_id').references(() => streets.id),
  streetNumber: text('street_number'),
  complement: text('complement'),
  reference: text('reference'),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  facadePhoto: text('facade_photo'),
  notes: text('notes'),
  customerInput: text('customer_input'),
  matchedAlias: text('matched_alias'),
  verified: boolean('verified').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id),
  clientRequestId: text('client_request_id').unique(),
  ...timestamps,
})

export const mapCorrections = pgTable('map_corrections', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  correctionType: text('correction_type').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  description: text('description').notNull(),
  status: correctionStatus('status').notNull().default('PENDING'),
  submittedBy: uuid('submitted_by').references(() => users.id),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  clientRequestId: text('client_request_id').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
})

export const favorites = pgTable('favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  streetId: uuid('street_id').references(() => streets.id),
  placeId: uuid('place_id').references(() => places.id),
  deliveryLocationId: uuid('delivery_location_id').references(() => deliveryLocations.id),
  label: text('label').notNull(),
  customerInput: text('customer_input'),
  matchedAlias: text('matched_alias'),
  clientRequestId: text('client_request_id').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const recentSearches = pgTable('recent_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  query: text('query').notNull(),
  streetId: uuid('street_id').references(() => streets.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  previousData: jsonb('previous_data'),
  newData: jsonb('new_data'),
  userId: uuid('user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const syncQueue = pgTable('sync_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  clientId: text('client_id').notNull().unique(),
  operation: text('operation').notNull(),
  payload: jsonb('payload').notNull(),
  status: syncStatus('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
})

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const schema = {
  cities,
  users,
  neighborhoods,
  streets,
  streetAliases,
  streetNameHistory,
  streetSegments,
  turnRestrictions,
  places,
  deliveryLocations,
  mapCorrections,
  favorites,
  recentSearches,
  auditLogs,
  syncQueue,
  refreshTokens,
}

export const geoJsonColumn = sql`ST_AsGeoJSON(geometry)::json`
