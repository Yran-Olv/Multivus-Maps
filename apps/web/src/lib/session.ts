import type { Role } from '@multivus/shared'
import type { StorageService } from '@multivus/services'
import { create } from 'zustand'

export type SessionUser = {
  id: string
  name: string
  email: string
  role: Role
}

type SessionData = {
  accessToken: string
  refreshToken: string
  user: SessionUser
}

type SessionState = {
  accessToken: string | null
  refreshToken: string | null
  user: SessionUser | null
  ready: boolean
  setSession: (value: SessionData) => void
  clear: () => void
  markReady: () => void
}

let storage: StorageService | null = null

export const useSession = create<SessionState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  ready: false,
  setSession: (value) => {
    set({ ...value, ready: true })
    void storage?.set('session', value)
  },
  clear: () => {
    set({ accessToken: null, refreshToken: null, user: null, ready: true })
    void storage?.remove('session')
  },
  markReady: () => set({ ready: true }),
}))

export async function restoreSession(nextStorage: StorageService): Promise<void> {
  storage = nextStorage
  const saved = await nextStorage.get<SessionData>('session')
  if (saved?.accessToken && saved.user) useSession.getState().setSession(saved)
  else useSession.getState().markReady()
}
