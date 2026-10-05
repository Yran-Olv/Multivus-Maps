import type { MultivusDB } from '@multivus/offline'
import type { StorageService } from '@multivus/services'

export function createWebStorage(db: MultivusDB): StorageService {
  return {
    async get<T>(key: string): Promise<T | null> {
      const row = await db.kv.get(key)
      return (row?.value as T | undefined) ?? null
    },
    async set<T>(key: string, value: T): Promise<void> {
      await db.kv.put({ key, value })
    },
    async remove(key: string): Promise<void> {
      await db.kv.delete(key)
    },
  }
}
