import { useSession } from './session'

const base = import.meta.env.VITE_API_URL ?? ''

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const token = useSession.getState().accessToken
  if (token) headers.set('authorization', `Bearer ${token}`)
  const response = await fetch(`${base}${path}`, { ...init, headers })
  if (response.status === 401 && retry && (await refreshSession())) {
    return api<T>(path, init, false)
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? 'Não foi possível falar com o servidor')
  }
  return (await response.json()) as T
}

async function refreshSession(): Promise<boolean> {
  const refreshToken = useSession.getState().refreshToken
  if (!refreshToken) return false
  const response = await fetch(`${base}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
  if (!response.ok) {
    useSession.getState().clear()
    return false
  }
  const data = (await response.json()) as {
    accessToken: string
    refreshToken: string
    user: { id: string; name: string; email: string; role: SessionUserRole }
  }
  useSession.getState().setSession(data)
  return true
}

type SessionUserRole = 'ADMIN' | 'EDITOR' | 'DELIVERY_DRIVER' | 'USER'
