import { readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations')

export async function migrate(connectionString: string): Promise<string[]> {
  const pool = new pg.Pool({ connectionString })
  const applied: string[] = []
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()
    for (const file of files) {
      const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file])
      if (existing.rowCount) continue
      const sql = await readFile(resolve(migrationsDir, file), 'utf8')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file])
        await client.query('COMMIT')
        applied.push(file)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }
  } finally {
    await pool.end()
  }
  return applied
}

const ranDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  && fileURLToPath(import.meta.url).endsWith('migrate.ts')

function loadEnv(): void {
  if (process.env.DATABASE_URL) return
  const candidates = [resolve(process.cwd(), '.env'), resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env')]
  for (const file of candidates) {
    try {
      const content = readFileSync(file, 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq === -1) continue
        const key = trimmed.slice(0, eq).trim()
        const value = trimmed.slice(eq + 1).trim()
        if (process.env[key] === undefined) process.env[key] = value
      }
      return
    } catch {
      // ignore
    }
  }
}

if (ranDirectly) {
  loadEnv()
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL ausente. Copie .env.example para .env.')
    process.exit(1)
  }
  const applied = await migrate(connectionString)
  console.log(applied.length ? `Migrations aplicadas: ${applied.join(', ')}` : 'Nenhuma migration pendente.')
}
