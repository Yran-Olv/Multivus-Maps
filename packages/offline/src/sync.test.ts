import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createDatabase } from './db'
import { enqueueOperation, flushSyncQueue } from './sync'

describe('fila de sincronização', () => {
  it('guarda a correção quando o envio falha e remove quando volta a funcionar', async () => {
    const db = createDatabase(`sync-${crypto.randomUUID()}`)
    const clientId = await enqueueOperation(db, 'map-correction', {
      description: 'Rua Lírios mudou de nome',
      correctionType: 'WRONG_STREET_NAME',
    })

    const first = await flushSyncQueue(db, async () => {
      throw new Error('offline')
    })
    expect(first).toEqual({ synced: 0, failed: 1 })
    const kept = await db.syncQueue.toArray()
    expect(kept).toHaveLength(1)
    expect(kept[0]?.clientId).toBe(clientId)
    expect(kept[0]?.attempts).toBe(1)

    const second = await flushSyncQueue(db, async () => undefined)
    expect(second).toEqual({ synced: 1, failed: 0 })
    expect(await db.syncQueue.count()).toBe(0)
    db.close()
  })
})
