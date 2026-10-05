import type { MultivusDB, SyncQueueItem } from './db'

export async function enqueueOperation(
  db: MultivusDB,
  operation: SyncQueueItem['operation'],
  payload: Record<string, unknown>,
  clientId: string = crypto.randomUUID(),
): Promise<string> {
  await db.syncQueue.add({
    clientId,
    operation,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  })
  return clientId
}

export async function flushSyncQueue(
  db: MultivusDB,
  send: (item: SyncQueueItem) => Promise<void>,
): Promise<{ synced: number; failed: number }> {
  const pending = await db.syncQueue.orderBy('id').toArray()
  let synced = 0
  let failed = 0
  for (const item of pending) {
    try {
      await send(item)
      if (item.id !== undefined) await db.syncQueue.delete(item.id)
      synced += 1
    } catch (error) {
      failed += 1
      if (item.id !== undefined) {
        await db.syncQueue.update(item.id, {
          attempts: item.attempts + 1,
          lastError: error instanceof Error ? error.message : 'Falha ao sincronizar',
        })
      }
    }
  }
  return { synced, failed }
}
