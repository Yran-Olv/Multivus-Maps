import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { createDatabase, refreshTokens, users, type Database } from '@multivus/database'
import { can, roleSchema, type Action, type Role } from '@multivus/shared'
import {
  approveGeometrySchema,
  confirmEntitySchema,
  confirmNeighborhoodSchema,
  createAddressPointSchema,
  createAliasSchema,
  createCorrectionSchema,
  createDeliveryLocationSchema,
  createFavoriteSchema,
  createFromOsmSchema,
  createLandmarkSchema,
  createLocalReferenceSchema,
  createNeighborhoodSchema,
  createPlaceSchema,
  createSegmentSchema,
  createStreetSchema,
  createTurnRestrictionSchema,
  createUserSchema,
  loginSchema,
  markConflictSchema,
  mergeStreetSchema,
  rejectGeometrySchema,
  reviewCorrectionSchema,
  searchQuerySchema,
  syncBatchSchema,
  updateStreetSchema,
} from '@multivus/shared'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import Fastify from 'fastify'
import Redis from 'ioredis'
import { ZodError } from 'zod'
import type { AppConfig } from './config'
import {
  adminStats,
  approveOsmGeometry,
  confirmEntity,
  confirmStreetNeighborhood,
  createAddressPoint,
  createAlias,
  createCorrection,
  createDelivery,
  createFavorite,
  createLandmark,
  createLocalReference,
  createNeighborhood,
  createPlace,
  createRestriction,
  createSegment,
  createStreet,
  createStreetFromOsm,
  createUser,
  deactivateAlias,
  deactivateStreet,
  deleteFavorite,
  getStreet,
  listAddressPoints,
  listAudit,
  listCities,
  listCorrections,
  listDeliveries,
  listFavorites,
  listLandmarks,
  listLocalReferences,
  listNeighborhoods,
  listOsmImportRecords,
  listPlaces,
  listRecent,
  listStreets,
  markOsmConflict,
  mergeStreetWithOsm,
  rememberSearch,
  recordSync,
  rejectOsmGeometry,
  reviewCorrection,
  searchCatalog,
  storeRefresh,
  updateStreet,
} from './domain'

import { verifyPassword } from './lib/passwords'
import { hashToken, readAccessToken, readRefreshToken, signAccessToken, signRefreshToken } from './lib/tokens'

export type AuthUser = {
  id: string
  role: Role
  email: string
  name: string
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Database
    config: AppConfig
  }
  interface FastifyRequest {
    authUser: AuthUser | null
  }
}

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: true, trustProxy: true })
  const { db, pool } = createDatabase(config.databaseUrl)
  app.decorate('db', db)
  app.decorate('config', config)
  app.decorateRequest('authUser', null)
  app.addHook('onClose', async () => {
    await pool.end()
  })

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, { origin: config.corsOrigin })
  const redis = config.redisUrl ? new Redis(config.redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false }) : null
  if (redis) {
    redis.on('error', (error) => app.log.warn({ error }, 'Redis indisponível; limite fica em memória'))
  }
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    ...(redis ? { redis } : {}),
  })

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: { code: 'VALIDATION', message: 'Dados inválidos', details: error.flatten() },
      })
    }
    app.log.error(error)
    const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
    return reply.code(Number.isNaN(statusCode) ? 500 : statusCode).send({
      error: { code: 'INTERNAL', message: statusCode === 500 ? 'Erro interno' : 'Requisição rejeitada' },
    })
  })

  const requireAction = (action: Action) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await readUser(request, config.accessSecret)
      if (!user) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Entre para continuar' } })
      request.authUser = user
      if (!can(user.role, action)) {
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Sem permissão para esta ação' } })
      }
    }
  }

  app.get('/api/v1/health', async () => ({ status: 'ok' }))
  app.get('/api/v1/ready', async (_request, reply) => {
    try {
      await app.db.execute(sql`select 1`)
      return { status: 'ok' }
    } catch {
      return reply.code(503).send({ status: 'unavailable' })
    }
  })

  app.post('/api/v1/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const [user] = await app.db.select().from(users).where(eq(users.email, body.email.toLowerCase())).limit(1)
    if (!user || !user.active || !(await verifyPassword(user.passwordHash, body.password))) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'E-mail ou senha incorretos' } })
    }
    return issueSession(app, user)
  })

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const body = request.body as { refreshToken?: string }
    if (!body?.refreshToken) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Refresh ausente' } })
    try {
      const claims = await readRefreshToken(body.refreshToken, config.refreshSecret)
      const [stored] = await app.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hashToken(claims.jti))).limit(1)
      if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== claims.sub) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sessão expirada' } })
      }
      await app.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, stored.id))
      const [user] = await app.db.select().from(users).where(and(eq(users.id, stored.userId), eq(users.active, true))).limit(1)
      if (!user) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Usuário inativo' } })
      return issueSession(app, user)
    } catch {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sessão expirada' } })
    }
  })

  app.post('/api/v1/auth/logout', async (request) => {
    const body = request.body as { refreshToken?: string }
    if (!body?.refreshToken) return { ok: true }
    try {
      const claims = await readRefreshToken(body.refreshToken, config.refreshSecret)
      await app.db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.tokenHash, hashToken(claims.jti)), isNull(refreshTokens.revokedAt)))
    } catch {
      return { ok: true }
    }
    return { ok: true }
  })

  app.get('/api/v1/auth/me', { preHandler: requireAction('catalog:read') }, async (request) => ({
    user: request.authUser,
  }))

  app.get('/api/v1/cities', async () => ({ cities: await listCities(app.db) }))
  app.get('/api/v1/neighborhoods', async () => ({ neighborhoods: await listNeighborhoods(app.db) }))
  app.get('/api/v1/places', async () => ({ places: await listPlaces(app.db) }))

  app.get('/api/v1/landmarks', async (request) => {
    const query = request.query as { category?: string }
    return { landmarks: await listLandmarks(app.db, query.category) }
  })
  app.post('/api/v1/landmarks', async (request, reply) => {
    const body = createLandmarkSchema.parse(request.body)
    const user = await readUser(request, config.accessSecret)
    const landmark = await createLandmark(app.db, body, user?.id ?? null)
    return reply.code(201).send({ landmark })
  })

  app.get('/api/v1/local-references', async () => ({
    references: await listLocalReferences(app.db),
  }))
  app.post('/api/v1/local-references', async (request, reply) => {
    const body = createLocalReferenceSchema.parse(request.body)
    const user = await readUser(request, config.accessSecret)
    const reference = await createLocalReference(app.db, body, user?.id ?? null)
    return reply.code(201).send({ reference })
  })

  app.post('/api/v1/confirm', async (request, reply) => {
    const body = confirmEntitySchema.parse(request.body)
    const user = await readUser(request, config.accessSecret)
    const result = await confirmEntity(app.db, body, user?.id ?? null)
    return reply.code(200).send({ result })
  })

  app.get('/api/v1/streets', async (request) => {
    const query = request.query as { inactive?: string }
    const user = await readUser(request, config.accessSecret)
    const includeInactive = query.inactive === '1' && !!user && can(user.role, 'street:write')
    return { streets: await listStreets(app.db, includeInactive) }
  })
  app.get('/api/v1/streets/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const street = await getStreet(app.db, id)
    if (!street) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Rua não encontrada' } })
    return { street }
  })
  app.get('/api/v1/search', async (request) => {
    const query = searchQuerySchema.parse(request.query)
    return { query: query.q, results: await searchCatalog(app.db, query.q, query.limit ?? 20) }
  })

  app.post('/api/v1/map-corrections', { preHandler: requireAction('correction:create') }, async (request, reply) => {
    const body = createCorrectionSchema.parse(request.body)
    const correction = await createCorrection(app.db, body, request.authUser?.id ?? null)
    return reply.code(201).send({ correction })
  })

  app.post('/api/v1/sync', { preHandler: requireAction('correction:create') }, async (request) => {
    const body = syncBatchSchema.parse(request.body)
    const userId = request.authUser?.id
    if (!userId) return { results: [] }
    const results = []
    for (const operation of body.operations) {
      try {
        if (operation.operation === 'map-correction') {
          const payload = createCorrectionSchema.parse(operation.payload)
          await createCorrection(app.db, payload, userId)
        } else if (operation.operation === 'delivery-location') {
          if (!can(request.authUser?.role ?? 'USER', 'delivery:write')) throw new Error('Sem permissão')
          const payload = createDeliveryLocationSchema.parse(operation.payload)
          await createDelivery(app.db, payload, userId)
        } else {
          if (!can(request.authUser?.role ?? 'USER', 'favorite:write')) throw new Error('Sem permissão')
          const payload = createFavoriteSchema.parse(operation.payload)
          await createFavorite(app.db, payload, userId)
        }
        await recordSync(app.db, operation.clientId, operation.operation, operation.payload, userId)
        results.push({ clientId: operation.clientId, status: 'SYNCED' })
      } catch (error) {
        results.push({
          clientId: operation.clientId,
          status: 'FAILED',
          message: error instanceof Error ? error.message : 'Falha',
        })
      }
    }
    return { results }
  })

  app.get('/api/v1/favorites', { preHandler: requireAction('favorite:write') }, async (request) => ({
    favorites: await listFavorites(app.db, request.authUser!.id),
  }))
  app.post('/api/v1/favorites', { preHandler: requireAction('favorite:write') }, async (request, reply) => {
    const body = createFavoriteSchema.parse(request.body)
    const favorite = await createFavorite(app.db, body, request.authUser!.id)
    return reply.code(201).send({ favorite })
  })
  app.delete('/api/v1/favorites/:id', { preHandler: requireAction('favorite:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const removed = await deleteFavorite(app.db, id, request.authUser!.id)
    if (!removed) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Favorito não encontrado' } })
    return { ok: true }
  })

  app.get('/api/v1/recent-searches', { preHandler: requireAction('catalog:read') }, async (request) => ({
    recents: await listRecent(app.db, request.authUser!.id),
  }))
  app.post('/api/v1/recent-searches', { preHandler: requireAction('catalog:read') }, async (request, reply) => {
    const body = request.body as { query?: string; streetId?: string | null }
    if (!body.query) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Informe a busca' } })
    const recent = await rememberSearch(app.db, request.authUser!.id, body.query, body.streetId)
    return reply.code(201).send({ recent })
  })

  app.get('/api/v1/delivery-locations', { preHandler: requireAction('delivery:write') }, async (request) => ({
    deliveryLocations: await listDeliveries(app.db, request.authUser!.id, can(request.authUser!.role, 'street:write')),
  }))
  app.post('/api/v1/delivery-locations', { preHandler: requireAction('delivery:write') }, async (request, reply) => {
    const body = createDeliveryLocationSchema.parse(request.body)
    const deliveryLocation = await createDelivery(app.db, body, request.authUser!.id)
    return reply.code(201).send({ deliveryLocation })
  })

  app.post('/api/v1/streets', { preHandler: requireAction('street:write') }, async (request, reply) => {
    const body = createStreetSchema.parse(request.body)
    const street = await createStreet(app.db, body, request.authUser!.id)
    return reply.code(201).send({ street })
  })
  app.patch('/api/v1/streets/:id', { preHandler: requireAction('street:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateStreetSchema.parse(request.body)
    const street = await updateStreet(app.db, id, body, request.authUser!.id)
    if (!street) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Rua não encontrada' } })
    return { street }
  })
  app.delete('/api/v1/streets/:id', { preHandler: requireAction('street:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const street = await deactivateStreet(app.db, id, request.authUser!.id)
    if (!street) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Rua não encontrada' } })
    return { street }
  })
  app.post('/api/v1/street-aliases', { preHandler: requireAction('street:write') }, async (request, reply) => {
    const body = createAliasSchema.parse(request.body)
    const alias = await createAlias(app.db, body, request.authUser!.id)
    return reply.code(201).send({ alias })
  })
  app.delete('/api/v1/street-aliases/:id', { preHandler: requireAction('street:write') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const deactivated = await deactivateAlias(app.db, id, request.authUser!.id)
    if (!deactivated) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Alias não encontrado' } })
    return { ok: true, alias: deactivated }
  })
  app.get('/api/v1/streets/:id/address-points', async (request) => {
    const { id } = request.params as { id: string }
    return { addressPoints: await listAddressPoints(app.db, id) }
  })
  app.post('/api/v1/address-points', { preHandler: requireAction('street:write') }, async (request, reply) => {
    const body = createAddressPointSchema.parse(request.body)
    const point = await createAddressPoint(app.db, body, request.authUser!.id)
    return reply.code(201).send({ point })
  })
  app.post('/api/v1/street-segments', { preHandler: requireAction('street:write') }, async (request, reply) => {
    const body = createSegmentSchema.parse(request.body)
    const segment = await createSegment(app.db, body, request.authUser!.id)
    return reply.code(201).send({ segment })
  })
  app.post('/api/v1/turn-restrictions', { preHandler: requireAction('restriction:write') }, async (request, reply) => {
    const body = createTurnRestrictionSchema.parse(request.body)
    const restriction = await createRestriction(app.db, body, request.authUser!.id)
    return reply.code(201).send({ restriction })
  })
  app.post('/api/v1/neighborhoods', { preHandler: requireAction('neighborhood:write') }, async (request, reply) => {
    const body = createNeighborhoodSchema.parse(request.body)
    const neighborhood = await createNeighborhood(app.db, body, request.authUser!.id)
    return reply.code(201).send({ neighborhood })
  })
  app.post('/api/v1/places', { preHandler: requireAction('place:write') }, async (request, reply) => {
    const body = createPlaceSchema.parse(request.body)
    const place = await createPlace(app.db, body, request.authUser!.id)
    return reply.code(201).send({ place })
  })

  // Endpoints administrativos de conferência cartográfica
  app.get('/api/v1/admin/cartography/osm-preview', { preHandler: requireAction('street:write') }, async (request) => {
    const query = request.query as { batch?: string }
    return { records: await listOsmImportRecords(app.db, query.batch || 'santa-juliana') }
  })
  app.post('/api/v1/admin/cartography/approve-geometry', { preHandler: requireAction('street:write') }, async (request, reply) => {
    const body = approveGeometrySchema.parse(request.body)
    const street = await approveOsmGeometry(app.db, body, request.authUser!.id)
    return reply.code(200).send({ street })
  })
  app.post('/api/v1/admin/cartography/reject-geometry', { preHandler: requireAction('street:write') }, async (request, reply) => {
    const body = rejectGeometrySchema.parse(request.body)
    const record = await rejectOsmGeometry(app.db, body, request.authUser!.id)
    return reply.code(200).send({ record })
  })
  app.post('/api/v1/admin/cartography/merge-street', { preHandler: requireAction('street:write') }, async (request, reply) => {
    const body = mergeStreetSchema.parse(request.body)
    const street = await mergeStreetWithOsm(app.db, body, request.authUser!.id)
    return reply.code(200).send({ street })
  })
  app.post('/api/v1/admin/cartography/create-from-osm', { preHandler: requireAction('street:write') }, async (request, reply) => {
    const body = createFromOsmSchema.parse(request.body)
    const street = await createStreetFromOsm(app.db, body, request.authUser!.id)
    return reply.code(201).send({ street })
  })
  app.post('/api/v1/admin/cartography/mark-conflict', { preHandler: requireAction('street:write') }, async (request, reply) => {
    const body = markConflictSchema.parse(request.body)
    const record = await markOsmConflict(app.db, body, request.authUser!.id)
    return reply.code(200).send({ record })
  })
  app.post('/api/v1/admin/cartography/confirm-neighborhood', { preHandler: requireAction('street:write') }, async (request, reply) => {
    const body = confirmNeighborhoodSchema.parse(request.body)
    const street = await confirmStreetNeighborhood(app.db, body, request.authUser!.id)
    return reply.code(200).send({ street })
  })

  app.get('/api/v1/admin/stats', { preHandler: requireAction('audit:read') }, async () => ({
    stats: await adminStats(app.db),
  }))
  app.get('/api/v1/admin/map-corrections', { preHandler: requireAction('correction:review') }, async (request) => {
    const query = request.query as { status?: string }
    return { corrections: await listCorrections(app.db, query.status) }
  })
  app.post('/api/v1/admin/map-corrections/:id/approve', { preHandler: requireAction('correction:review') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = reviewCorrectionSchema.parse(request.body ?? {})
    const correction = await reviewCorrection(app.db, id, 'APPROVED', request.authUser!.id, body.reason)
    if (!correction) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Correção não encontrada' } })
    return { correction }
  })
  app.post('/api/v1/admin/map-corrections/:id/reject', { preHandler: requireAction('correction:review') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = reviewCorrectionSchema.parse(request.body ?? {})
    const correction = await reviewCorrection(app.db, id, 'REJECTED', request.authUser!.id, body.reason)
    if (!correction) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Correção não encontrada' } })
    return { correction }
  })
  app.get('/api/v1/admin/audit-logs', { preHandler: requireAction('audit:read') }, async () => ({
    auditLogs: await listAudit(app.db),
  }))
  app.post('/api/v1/admin/users', { preHandler: requireAction('user:manage') }, async (request, reply) => {
    const body = createUserSchema.parse(request.body)
    const user = await createUser(app.db, body, request.authUser!.id)
    return reply.code(201).send({ user })
  })

  return app
}

async function issueSession(
  app: FastifyInstance,
  user: { id: string; role: Role; email: string; name: string },
) {
  const accessToken = await signAccessToken(
    { sub: user.id, role: user.role, email: user.email, name: user.name },
    app.config.accessSecret,
  )
  const refresh = await signRefreshToken(user.id, app.config.refreshSecret)
  await storeRefresh(app.db, user.id, refresh.jti, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
  return {
    accessToken,
    refreshToken: refresh.token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  }
}

async function readUser(request: FastifyRequest, secret: string): Promise<AuthUser | null> {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  try {
    const claims = await readAccessToken(header.slice(7), secret)
    const role = roleSchema.parse(claims.role)
    return { id: claims.sub, role, email: claims.email, name: claims.name }
  } catch {
    return null
  }
}
