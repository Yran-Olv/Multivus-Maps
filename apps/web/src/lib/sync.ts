import { flushSyncQueue } from '@multivus/offline'
import { api } from './api'
import { db } from './db'

export async function flushPending(): Promise<void> {
  await flushSyncQueue(db, async (item) => {
    const result = await api<{ results: Array<{ status: string; message?: string }> }>('/api/v1/sync', {
      method: 'POST',
      body: JSON.stringify({
        operations: [
          {
            clientId: item.clientId,
            operation: item.operation,
            payload: item.payload,
            createdAt: item.createdAt,
          },
        ],
      }),
    })
    const row = result.results[0]
    if (!row || row.status === 'FAILED') throw new Error(row?.message ?? 'Falha ao sincronizar')
  })
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
