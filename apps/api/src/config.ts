import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvFile(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]
  for (const file of candidates) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim()
      if (process.env[key] === undefined) process.env[key] = value
    }
    return
  }
}

export type AppConfig = {
  host: string
  port: number
  databaseUrl: string
  accessSecret: string
  refreshSecret: string
  corsOrigin: string
  redisUrl: string | null
}

export function readConfig(): AppConfig {
  loadEnvFile()
  const databaseUrl = required('DATABASE_URL')
  const accessSecret = required('JWT_ACCESS_SECRET')
  const refreshSecret = required('JWT_REFRESH_SECRET')
  if (accessSecret.length < 16 || refreshSecret.length < 16) {
    throw new Error('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET precisam ter pelo menos 16 caracteres.')
  }
  return {
    host: process.env.API_HOST ?? '0.0.0.0',
    port: Number(process.env.API_PORT ?? 3333),
    databaseUrl,
    accessSecret,
    refreshSecret,
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    redisUrl: process.env.REDIS_URL || null,
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} ausente. Copie .env.example para .env.`)
  return value
}
