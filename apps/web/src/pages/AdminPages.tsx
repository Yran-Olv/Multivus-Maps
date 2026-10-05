import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { can, CORRECTION_TYPE_LABELS, STREET_TYPES, type CorrectionType, type StreetType } from '@multivus/shared'
import { Map, type MapHandle } from '@multivus/ui'
import { useRef, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { api } from '../lib/api'
import { useSession } from '../lib/session'

export function AdminPage() {
  const user = useSession((state) => state.user)
  const stats = useQuery({
    queryKey: ['admin-stats'],
    enabled: !!user && can(user.role, 'audit:read'),
    queryFn: () => api<{ stats: Stats }>('/api/v1/admin/stats'),
  })
  if (!user) return <Navigate to="/entrar" replace />
  if (!can(user.role, 'audit:read')) return <p className="p-4">Sem permissão para o painel.</p>
  const data = stats.data?.stats
  return (
    <div className="h-full overflow-y-auto px-4 py-5">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Painel</h1>
        <Link to="/" className="text-sm text-amber-200">Mapa</Link>
      </div>
      <div className="grid gap-2">
        <Stat label="Correções pendentes" value={data?.pendingCorrections} />
        <Stat label="Ruas cadastradas" value={data?.streets} />
        <Stat label="Ruas verificadas" value={data?.verifiedStreets} />
        <Stat label="Ruas sem geometria" value={data?.streetsWithoutGeometry} />
        <Stat label="Bairros" value={data?.neighborhoods} />
        <Stat label="Pontos de referência" value={data?.places} />
        <Stat label="Aliases" value={data?.aliases} />
        <Stat label="Usuários" value={data?.users} />
      </div>
      <div className="mt-6 grid gap-2">
        <Link to="/admin/mapa" className="flex h-14 items-center rounded-2xl bg-[#1c242c] px-4">Editor do mapa</Link>
        <Link to="/admin/correcoes" className="flex h-14 items-center rounded-2xl bg-[#1c242c] px-4">Correções</Link>
      </div>
      {stats.isError ? <p className="mt-4 text-sm text-red-300">Não foi possível carregar o painel. Confira a API e o banco.</p> : null}
    </div>
  )
}

export function AdminCorrectionsPage() {
  const user = useSession((state) => state.user)
  const client = useQueryClient()
  const corrections = useQuery({
    queryKey: ['admin-corrections'],
    enabled: !!user && can(user.role, 'correction:review'),
    queryFn: () => api<{ corrections: Correction[] }>('/api/v1/admin/map-corrections?status=PENDING'),
  })
  const review = useMutation({
    mutationFn: (input: { id: string; decision: 'approve' | 'reject' }) =>
      api(`/api/v1/admin/map-corrections/${input.id}/${input.decision}`, { method: 'POST', body: '{}' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-corrections'] }),
  })
  if (!user) return <Navigate to="/entrar" replace />
  if (!can(user.role, 'correction:review')) return <p className="p-4">Sem permissão.</p>
  return (
    <div className="h-full overflow-y-auto px-4 py-5">
      <Link to="/admin" className="text-sm text-amber-200">Voltar</Link>
      <h1 className="my-3 text-2xl font-semibold">Correções pendentes</h1>
      <div className="grid gap-3">
        {(corrections.data?.corrections ?? []).map((correction) => (
          <article key={correction.id} className="rounded-2xl bg-[#1c242c] p-4">
            <p className="font-medium">{CORRECTION_TYPE_LABELS[correction.correctionType as CorrectionType] ?? correction.correctionType}</p>
            <p className="mt-1 text-sm text-slate-300">{correction.description}</p>
            <p className="mt-1 text-xs text-slate-500">{correction.latitude.toFixed(5)}, {correction.longitude.toFixed(5)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="h-11 rounded-xl bg-[#f0b429] font-semibold text-slate-900" onClick={() => review.mutate({ id: correction.id, decision: 'approve' })}>
                Aprovar
              </button>
              <button type="button" className="h-11 rounded-xl bg-white/10" onClick={() => review.mutate({ id: correction.id, decision: 'reject' })}>
                Rejeitar
              </button>
            </div>
          </article>
        ))}
        {corrections.data?.corrections.length === 0 ? <p className="text-slate-400">Nenhuma correção pendente.</p> : null}
      </div>
    </div>
  )
}

export function AdminMapPage() {
  const user = useSession((state) => state.user)
  const mapRef = useRef<MapHandle>(null)
  const streets = useQuery({
    queryKey: ['admin-streets'],
    enabled: !!user && can(user.role, 'street:write'),
    queryFn: () => api<{ streets: EditableStreet[] }>('/api/v1/streets?inactive=1'),
  })
  const neighborhoods = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () => api<{ neighborhoods: Array<{ id: string; name: string }> }>('/api/v1/neighborhoods'),
  })
  const [streetId, setStreetId] = useState<string>('')
  const [officialName, setOfficialName] = useState('')
  const [streetType, setStreetType] = useState<StreetType>('RUA')
  const [neighborhoodId, setNeighborhoodId] = useState('')
  const [alias, setAlias] = useState('')
  const [verified, setVerified] = useState(false)
  const [points, setPoints] = useState<Array<{ longitude: number; latitude: number }>>([])
  const [message, setMessage] = useState<string | null>(null)
  const client = useQueryClient()

  if (!user) return <Navigate to="/entrar" replace />
  if (!can(user.role, 'street:write')) return <p className="p-4">Sem permissão para editar o mapa.</p>

  const selected = streets.data?.streets.find((street) => street.id === streetId)

  function choose(id: string) {
    const street = streets.data?.streets.find((item) => item.id === id)
    setStreetId(id)
    setOfficialName(street?.officialName ?? '')
    setStreetType((street?.streetType as StreetType) ?? 'RUA')
    setNeighborhoodId(street?.neighborhoodId ?? '')
    setVerified(street?.verified ?? false)
    setPoints([])
    setAlias('')
  }

  async function save() {
    setMessage(null)
    const geometry = points.length >= 2
      ? { type: 'LineString', coordinates: points.map((point) => [point.longitude, point.latitude]) }
      : undefined
    if (streetId) {
      await api(`/api/v1/streets/${streetId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          officialName,
          streetType,
          neighborhoodId: neighborhoodId || null,
          verified,
          ...(geometry ? { geometry } : {}),
        }),
      })
      if (alias.trim()) {
        await api('/api/v1/street-aliases', {
          method: 'POST',
          body: JSON.stringify({ streetId, alias: alias.trim(), aliasType: 'OLD_NAME' }),
        })
      }
      setMessage('Rua atualizada. A alteração ficou no histórico.')
    } else {
      await api('/api/v1/streets', {
        method: 'POST',
        body: JSON.stringify({
          officialName,
          streetType,
          neighborhoodId: neighborhoodId || null,
          source: 'Conferência local',
          sourceDate: new Date().toISOString().slice(0, 10),
          geometry: geometry ?? null,
          aliases: alias.trim() ? [{ alias: alias.trim(), aliasType: 'OLD_NAME' }] : [],
        }),
      })
      setMessage('Rua criada como não verificada, até você marcar a conferência.')
    }
    setPoints([])
    await client.invalidateQueries({ queryKey: ['admin-streets'] })
  }

  async function deactivate() {
    if (!streetId) return
    await api(`/api/v1/streets/${streetId}`, { method: 'DELETE' })
    setMessage('Rua desativada.')
    setStreetId('')
    await client.invalidateQueries({ queryKey: ['admin-streets'] })
  }

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_minmax(0,1.1fr)]">
      <header className="flex items-center justify-between px-4 py-3">
        <Link to="/admin" className="text-sm text-amber-200">Painel</Link>
        <h1 className="font-semibold">Editor</h1>
      </header>
      <Map
        handle={mapRef}
        className="h-full w-full"
        points={points.map((point, index) => ({ id: String(index), ...point, color: '#f0b429' }))}
        onClick={(point) => setPoints((current) => [...current, point])}
      />
      <div className="overflow-y-auto bg-[#12181f] px-4 py-3">
        <label className="mb-2 block text-sm text-slate-300">
          Rua
          <select value={streetId} onChange={(event) => choose(event.target.value)} className="mt-1 h-12 w-full rounded-xl bg-[#1c242c] px-3">
            <option value="">Nova rua</option>
            {(streets.data?.streets ?? []).map((street) => (
              <option key={street.id} value={street.id}>
                {street.officialName}{street.geometry ? '' : ' · sem geometria'}
              </option>
            ))}
          </select>
        </label>
        <input value={officialName} onChange={(event) => setOfficialName(event.target.value)} placeholder="Nome oficial" className="mb-2 h-12 w-full rounded-xl bg-[#1c242c] px-3" />
        <div className="mb-2 grid grid-cols-2 gap-2">
          <select value={streetType} onChange={(event) => setStreetType(event.target.value as StreetType)} className="h-12 rounded-xl bg-[#1c242c] px-3">
            {STREET_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
          <select value={neighborhoodId} onChange={(event) => setNeighborhoodId(event.target.value)} className="h-12 rounded-xl bg-[#1c242c] px-3">
            <option value="">Bairro</option>
            {(neighborhoods.data?.neighborhoods ?? []).map((neighborhood) => (
              <option key={neighborhood.id} value={neighborhood.id}>{neighborhood.name}</option>
            ))}
          </select>
        </div>
        <input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="Nome antigo" className="mb-2 h-12 w-full rounded-xl bg-[#1c242c] px-3" />
        <label className="mb-2 flex h-12 items-center gap-2 text-sm">
          <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
          Verificada por mim
        </label>
        <p className="mb-2 text-xs text-slate-400">
          {points.length === 0
            ? 'Toque no mapa para desenhar a geometria. São necessários dois pontos.'
            : `${points.length} ponto(s). ${selected?.officialName ?? 'Nova rua'}`}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className="h-12 rounded-xl bg-white/10" onClick={() => setPoints([])}>Limpar</button>
          <button type="button" className="h-12 rounded-xl bg-[#f0b429] font-semibold text-slate-900" onClick={() => void save().catch((error: Error) => setMessage(error.message))}>Salvar</button>
          <button type="button" className="h-12 rounded-xl bg-white/10" onClick={() => void deactivate().catch((error: Error) => setMessage(error.message))}>Desativar</button>
        </div>
        {message ? <p className="mt-2 text-sm text-amber-200">{message}</p> : null}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-[#1c242c] px-4 py-3">
      <span>{label}</span>
      <span className="text-xl font-semibold">{value ?? '—'}</span>
    </div>
  )
}

type Stats = {
  pendingCorrections: number
  streets: number
  verifiedStreets: number
  streetsWithoutGeometry: number
  neighborhoods: number
  places: number
  aliases: number
  users: number
}

type Correction = {
  id: string
  correctionType: string
  description: string
  latitude: number
  longitude: number
}

type EditableStreet = {
  id: string
  officialName: string
  streetType: string
  neighborhoodId: string | null
  verified: boolean
  geometry: unknown
}
