import { enqueueOperation } from '@multivus/offline'
import { can } from '@multivus/shared'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { usePlatform } from '../platform/context'
import { api } from '../lib/api'
import { db } from '../lib/db'
import { useSession } from '../lib/session'
import { flushPending } from '../lib/sync'
import { APP_VERSION, APP_BUILD_DATE, clearAppCacheAndReload } from '../lib/pwa-update'
import { useUi } from '../stores/ui'

export function FavoritesPage() {
  const [items, setItems] = useState<Array<{ id: string; label: string; customerInput?: string | null; matchedAlias?: string | null }>>([])
  useEffect(() => {
    void db.favorites.orderBy('createdAt').reverse().toArray().then(setItems)
  }, [])
  return (
    <Screen title="Favoritos">
      {items.length === 0 ? <p className="text-slate-400">Nenhum endereço salvo ainda.</p> : null}
      <ul className="grid gap-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-2xl bg-[#1c242c] px-4 py-4">
            <p className="text-lg">{item.label}</p>
            {item.customerInput && item.matchedAlias ? (
              <p className="mt-1 text-sm text-amber-200">Cliente falou: {item.customerInput}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </Screen>
  )
}

export function DeliveriesPage() {
  const platform = usePlatform()
  const [params] = useSearchParams()
  const online = useUi((state) => state.online)
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [reference, setReference] = useState(params.get('referencia') ?? '')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(null)
  const [items, setItems] = useState<Array<{ id: string; label: string }>>([])

  async function mark() {
    try {
      const position = await platform.location.getCurrentPosition()
      setPoint(position)
    } catch (error) {
      useUi.getState().setNotice(error instanceof Error ? error.message : 'Localização indisponível')
    }
  }

  async function save() {
    if (!point) {
      useUi.getState().setNotice('Marque a posição exata antes de salvar o ponto.')
      return
    }
    const clientRequestId = crypto.randomUUID()
    const payload = {
      customerName: customerName || null,
      phone: phone || null,
      reference: reference || null,
      notes: notes || null,
      latitude: point.latitude,
      longitude: point.longitude,
      facadePhoto: photo,
      clientRequestId,
    }
    await db.kv.put({ key: `delivery:${clientRequestId}`, value: payload })
    if (useSession.getState().accessToken) {
      await enqueueOperation(db, 'delivery-location', payload, clientRequestId)
      if (online) await flushPending().catch(() => undefined)
    }
    setItems((current) => [{ id: clientRequestId, label: customerName || reference || 'Ponto de entrega' }, ...current])
    useUi.getState().setPending(await db.syncQueue.count())
    useUi.getState().setNotice('Ponto de entrega guardado. Ele segue pendente até a conferência.')
    setCustomerName('')
    setPhone('')
    setNotes('')
    setPhoto(null)
  }

  return (
    <Screen title="Entregas">
      <p className="mb-4 text-sm text-slate-400">
        Um ponto confirmado serve para a próxima entrega no mesmo local. A posição vem do marcador, não do desenho do mapa oficial.
      </p>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <Field label="Cliente" value={customerName} onChange={setCustomerName} />
        <Field label="Telefone" value={phone} onChange={setPhone} />
        <Field label="Referência" value={reference} onChange={setReference} />
        <label className="grid gap-1 text-sm text-slate-300">
          Observação
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-24 rounded-xl bg-[#1c242c] p-3 text-base" />
        </label>
        <label className="grid gap-1 text-sm text-slate-300">
          Foto da fachada
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              if (file.size > 1_200_000) {
                useUi.getState().setNotice('Use uma foto de até 1,2 MB.')
                return
              }
              const reader = new FileReader()
              reader.onload = () => setPhoto(typeof reader.result === 'string' ? reader.result : null)
              reader.readAsDataURL(file)
            }}
          />
        </label>
        <button type="button" onClick={() => void mark()} className="h-12 rounded-xl bg-white/10">
          {point ? `Posição marcada (${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)})` : 'Marcar minha posição'}
        </button>
        <button type="submit" className="h-14 rounded-2xl bg-[#f0b429] font-semibold text-slate-900">
          Salvar ponto
        </button>
      </form>
      <ul className="mt-6 grid gap-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-2xl bg-[#1c242c] px-4 py-3">{item.label}</li>
        ))}
      </ul>
    </Screen>
  )
}

export function MorePage() {
  const user = useSession((state) => state.user)
  return (
    <Screen title="Mais">
      <div className="mb-4 rounded-2xl border border-white/10 bg-[#161f28] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-white">Multivus Maps Santa Juliana</p>
            <p className="text-xs text-amber-300">Versão {APP_VERSION} • {APP_BUILD_DATE}</p>
          </div>
          <button
            type="button"
            onClick={() => void clearAppCacheAndReload()}
            className="flex items-center gap-1.5 rounded-xl bg-[#f0b429] px-3.5 py-2.5 text-xs font-bold text-slate-900 shadow hover:bg-amber-400 active:scale-95 transition"
          >
            🔄 Atualizar App
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Toque em Atualizar para limpar o cache do celular e carregar novidades instantaneamente.
        </p>
      </div>

      <div className="grid gap-2">
        <MenuLink to="/entender" label="Entender endereço" />
        <MenuLink to="/perfil" label="Perfil" />
        <MenuLink to="/configuracoes" label="Configurações" />
        <MenuLink to="/correcao" label="Informar problema no mapa" />
        {user && can(user.role, 'audit:read') ? <MenuLink to="/admin" label="Painel" /> : null}
        <MenuLink to="/entrar" label={user ? 'Trocar de conta' : 'Entrar'} />
      </div>
    </Screen>
  )
}

export function ProfilePage() {
  const user = useSession((state) => state.user)
  const navigate = useNavigate()
  if (!user) {
    return (
      <Screen title="Perfil">
        <p className="mb-4 text-slate-300">Entre para sincronizar correções e pontos de entrega.</p>
        <Link to="/entrar" className="inline-flex h-12 items-center rounded-xl bg-[#f0b429] px-4 font-semibold text-slate-900">
          Entrar
        </Link>
      </Screen>
    )
  }
  return (
    <Screen title="Perfil">
      <p className="text-2xl font-semibold">{user.name}</p>
      <p className="text-slate-400">{user.email}</p>
      <p className="mt-2 text-sm text-amber-200">{user.role}</p>
      <button
        type="button"
        className="mt-6 h-12 rounded-xl bg-white/10 px-4"
        onClick={() => {
          const refreshToken = useSession.getState().refreshToken
          void api('/api/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => undefined)
          useSession.getState().clear()
          navigate('/')
        }}
      >
        Sair
      </button>
    </Screen>
  )
}

export function SettingsPage() {
  return (
    <Screen title="Configurações">
      <p className="text-slate-300">
        A base inicial veio do mapa da Prefeitura de Santa Juliana, atualizado em 07/2021. Ruas sem geometria continuam
        não verificadas até alguém conferir no editor.
      </p>

      <div className="mt-6 rounded-2xl border border-white/10 bg-[#1c242c] p-4">
        <p className="text-sm font-semibold text-white">Versão do Sistema</p>
        <p className="mt-0.5 text-xs text-slate-400">
          Versão {APP_VERSION} (Build {APP_BUILD_DATE})
        </p>
        <button
          type="button"
          className="mt-3 inline-flex h-12 items-center justify-center rounded-xl bg-[#f0b429] px-4 font-semibold text-slate-900 shadow active:scale-95 transition"
          onClick={() => void clearAppCacheAndReload()}
        >
          🔄 Limpar Cache e Forçar Atualização
        </button>
      </div>

      <button
        type="button"
        className="mt-4 h-12 w-full rounded-xl bg-white/10 px-4 text-sm text-slate-300 hover:bg-white/15"
        onClick={() => {
          void db.delete().then(() => {
            void clearAppCacheAndReload()
          })
        }}
      >
        Apagar dados locais deste aparelho
      </button>
    </Screen>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const online = useUi((state) => state.online)

  async function submit() {
    setError(null)
    try {
      const data = await api<{
        accessToken: string
        refreshToken: string
        user: { id: string; name: string; email: string; role: 'ADMIN' | 'EDITOR' | 'DELIVERY_DRIVER' | 'USER' }
      }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      useSession.getState().setSession(data)
      if (online) await flushPending().catch(() => undefined)
      useUi.getState().setPending(await db.syncQueue.count())
      navigate('/')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar')
    }
  }

  return (
    <Screen title="Entrar">
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <Field label="E-mail" value={email} onChange={setEmail} />
        <label className="grid gap-1 text-sm text-slate-300">
          Senha
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 rounded-xl bg-[#1c242c] px-3 text-base" />
        </label>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button type="submit" className="h-14 rounded-2xl bg-[#f0b429] font-semibold text-slate-900">
          Entrar
        </button>
      </form>
    </Screen>
  )
}

export function CorrectionPage() {
  const navigate = useNavigate()
  return (
    <Screen title="Correção">
      <p className="mb-4 text-slate-300">Marque o problema em cima do mapa, no ponto onde o entregador está.</p>
      <button
        type="button"
        className="h-14 rounded-2xl bg-[#f0b429] px-4 font-semibold text-slate-900"
        onClick={() => {
          useUi.getState().setCorrectionOpen(true)
          navigate('/')
        }}
      >
        Abrir no mapa
      </button>
    </Screen>
  )
}

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto px-4 py-5">
      <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm text-slate-300">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-12 rounded-xl bg-[#1c242c] px-3 text-base" />
    </label>
  )
}

function MenuLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="flex h-14 items-center rounded-2xl bg-[#1c242c] px-4 text-lg">
      {label}
    </Link>
  )
}
