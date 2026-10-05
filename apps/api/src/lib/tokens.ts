import { createHash, randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { Role } from '@multivus/shared'

export type AccessClaims = {
  sub: string
  role: Role
  email: string
  name: string
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export async function signAccessToken(user: AccessClaims, secret: string): Promise<string> {
  return new SignJWT({ role: user.role, email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key(secret))
}

export async function signRefreshToken(userId: string, secret: string): Promise<{ token: string; jti: string }> {
  const jti = randomUUID()
  const token = await new SignJWT({ typ: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key(secret))
  return { token, jti }
}

export async function readAccessToken(token: string, secret: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, key(secret))
  if (!payload.sub || typeof payload.role !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Token inválido')
  }
  return {
    sub: payload.sub,
    role: payload.role as Role,
    email: payload.email,
    name: typeof payload.name === 'string' ? payload.name : '',
  }
}

export async function readRefreshToken(token: string, secret: string): Promise<{ sub: string; jti: string }> {
  const { payload } = await jwtVerify(token, key(secret))
  if (!payload.sub || !payload.jti || payload.typ !== 'refresh') throw new Error('Refresh inválido')
  return { sub: payload.sub, jti: payload.jti }
}
