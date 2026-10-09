import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { can, CORRECTION_TYPE_LABELS, STREET_TYPES, type CorrectionType, type StreetType } from '@multivus/shared'
import { Map, type MapHandle } from '@multivus/ui'
import { useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { api } from '../lib/api'
import { lineOf } from '../lib/catalog'
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
    <div className="h-full overflow-y-auto px-4 py-5 text-white">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Painel Multivus Maps</h1>
          <p className="text-xs text-slate-400">Inteligência Local e Cartografia de Santa Juliana</p>
        </div>
        <Link to="/" className="text-sm font-semibold text-[#f0b429] hover:underline">Voltar ao Mapa →</Link>
      </div>

      <h2 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Indicadores da Cidade</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Ruas cadastradas" value={data?.streets} />
        <Stat label="Nomes verificados" value={data?.verifiedStreets} />
        <Stat label="Ruas com geometria" value={data?.streetsWithGeometry} />
        <Stat label="Geometrias verificadas" value={data?.geometryVerifiedStreets} />
        <Stat label="Sem geometria" value={data?.streetsWithoutGeometry} alert={Number(data?.streetsWithoutGeometry) > 0} />
        <Stat label="Sem bairro confirmado" value={data?.streetsWithoutNeighborhood} />
        <Stat label="Bairros com limite" value={data?.neighborhoodsWithGeometry} />
        <Stat label="Bairros sem limite" value={data?.neighborhoodsWithoutGeometry} />
        <Stat label="Endereços numerados" value={data?.addressPoints} />
        <Stat label="Endereços com coordenada" value={data?.addressPointsWithGeometry} />
        <Stat label="Endereços sem coordenada" value={data?.addressPointsWithoutGeometry} />
        <Stat label="Endereços verificados" value={data?.addressPointsVerified} />
        <Stat label="Locais sem coordenadas" value={data?.placesWithoutCoordinates} />
        <Stat label="Referências sem coordenadas" value={data?.landmarksWithoutCoordinates} />
        <Stat label="Vias OSM pendentes" value={data?.pendingOsmRecords} />
        <Stat label="Conflitos OSM" value={data?.conflictingOsmRecords} alert={Number(data?.conflictingOsmRecords) > 0} />
        <Stat label="Segmentos pendentes" value={data?.unverifiedStreetSegments} />
        <Stat label="Geometrias inválidas" value={data?.invalidStreetGeometries} alert={Number(data?.invalidStreetGeometries) > 0} />
        <Stat label="Nomes duplicados" value={data?.duplicateStreetNames} alert={Number(data?.duplicateStreetNames) > 0} />
        <Stat label="Geometrias duplicadas" value={data?.duplicateStreetGeometries} alert={Number(data?.duplicateStreetGeometries) > 0} />
        <Stat label="Com nomes antigos" value={data?.streetsWithOldNames} />
        <Stat label="Pontos de referência" value={data?.landmarks ?? data?.places} />
        <Stat label="Referências populares" value={data?.localReferences} />
        <Stat label="Correções pendentes" value={data?.pendingCorrections} alert={Number(data?.pendingCorrections) > 0} />
      </div>

      {data?.topSearches && data.topSearches.length > 0 ? (
        <section className="mt-5 rounded-2xl bg-[#1c242c] p-4 border border-white/5">
          <h3 className="text-sm font-bold text-amber-300">🔍 Termos & Ruas Mais Pesquisados</h3>
          <p className="mt-0.5 text-xs text-slate-400">Ajuda a identificar onde os entregadores e moradores mais navegam</p>
          <div className="mt-3 grid gap-1.5">
            {data.topSearches.map((s) => (
              <div key={s.query} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-sm">
                <span className="font-medium text-slate-200">{s.query}</span>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">{s.count} buscas</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data?.topReferences && data.topReferences.length > 0 ? (
        <section className="mt-4 rounded-2xl bg-[#1c242c] p-4 border border-white/5">
          <h3 className="text-sm font-bold text-emerald-300">🔗 Referências Populares Mais Utilizadas</h3>
          <p className="mt-0.5 text-xs text-slate-400">Expressões locais validadas pela comunidade de entregadores</p>
          <div className="mt-3 grid gap-1.5">
            {data.topReferences.map((r) => (
              <div key={r.popularPhrase} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-sm">
                <div>
                  <span className="font-semibold text-white">{r.popularPhrase}</span>
                  {r.targetStreetName ? <span className="ml-2 text-xs text-slate-400">→ {r.targetStreetName}</span> : null}
                </div>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-300">{r.confirmationsCount} conf.</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-6 grid gap-2">
        <Link to="/admin/mapa" className="flex h-14 items-center justify-between rounded-2xl bg-[#1c242c] px-4 font-medium hover:bg-[#25303b] transition border border-white/5">
          <span>Conferência Cartográfica & Editor</span>
          <span className="text-sm text-amber-300">Abrir →</span>
        </Link>
        <Link to="/admin/correcoes" className="flex h-14 items-center justify-between rounded-2xl bg-[#1c242c] px-4 font-medium hover:bg-[#25303b] transition border border-white/5">
          <span>Correções & Alertas de Usuários</span>
          <span className="text-sm text-amber-300">Abrir ({data?.pendingCorrections ?? 0}) →</span>
        </Link>
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
      <Link to="/admin" className="text-sm text-amber-200 hover:underline">← Voltar ao Painel</Link>
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
  const client = useQueryClient()

  // Camadas
  const [showMultivus, setShowMultivus] = useState(true)
  const [showOsm, setShowOsm] = useState(true)
  const [activeTab, setActiveTab] = useState<'osm' | 'streets' | 'direction' | 'manual' | 'neighborhoods'>('osm')

  // Dados do backend
  const streets = useQuery({
    queryKey: ['admin-streets'],
    enabled: !!user && can(user.role, 'street:write'),
    queryFn: () => api<{ streets: EditableStreet[] }>('/api/v1/streets?inactive=1'),
  })
  const osmRecords = useQuery({
    queryKey: ['admin-osm-preview'],
    enabled: !!user && can(user.role, 'street:write'),
    queryFn: () => api<{ records: OsmRecord[] }>('/api/v1/admin/cartography/osm-preview?batch=santa-juliana'),
  })
  const coverage = useQuery({
    queryKey: ['admin-stats'],
    enabled: !!user && can(user.role, 'audit:read'),
    queryFn: () => api<{ stats: Stats }>('/api/v1/admin/stats'),
  })
  const neighborhoods = useQuery({
    queryKey: ['neighborhoods'],
    enabled: !!user && can(user.role, 'neighborhood:write'),
    queryFn: () => api<{ neighborhoods: EditableNeighborhood[] }>('/api/v1/neighborhoods'),
  })

  // Seleção e filtros
  const [selectedOsmId, setSelectedOsmId] = useState<string>('')
  const [selectedStreetId, setSelectedStreetId] = useState<string>('')
  const [osmFilter, setOsmFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [streetFilter, setStreetFilter] = useState<'ALL' | 'WITHOUT_GEOM' | 'WITH_GEOM' | 'WITHOUT_NEIGHBORHOOD'>('ALL')
  const [streetSearchTerm, setStreetSearchTerm] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const summary = useMemo(() => {
    const allStreets = streets.data?.streets ?? []
    const allOsm = osmRecords.data?.records ?? []
    return {
      totalStreets: allStreets.length,
      withGeometry: allStreets.filter((s) => Boolean(s.geometry)).length,
      withoutGeometry: allStreets.filter((s) => !s.geometry).length,
      withoutNeighborhood: allStreets.filter((s) => !s.neighborhoodName || s.neighborhoodStatus !== 'CONFIRMED').length,
      osmPending: allOsm.filter((r) => r.status === 'PENDING').length,
      osmApproved: allOsm.filter((r) => r.status === 'APPROVED').length,
      osmConflicts: allOsm.filter((r) => r.matchType === 'CONFLICT' || r.status === 'CONFLICT').length,
    }
  }, [streets.data?.streets, osmRecords.data?.records])

  const filteredStreets = useMemo(() => {
    return (streets.data?.streets ?? []).filter((s) => {
      if (streetFilter === 'WITHOUT_GEOM' && s.geometry) return false
      if (streetFilter === 'WITH_GEOM' && !s.geometry) return false
      if (streetFilter === 'WITHOUT_NEIGHBORHOOD' && s.neighborhoodName && s.neighborhoodStatus === 'CONFIRMED') return false
      if (streetSearchTerm.trim()) {
        const term = streetSearchTerm.toLowerCase()
        if (!s.officialName.toLowerCase().includes(term) && !(s.neighborhoodName ?? '').toLowerCase().includes(term)) {
          return false
        }
      }
      return true
    })
  }, [streets.data?.streets, streetFilter, streetSearchTerm])

  // Ações de merge e criação
  const [mergeTargetId, setMergeTargetId] = useState('')
  const [newStreetName, setNewStreetName] = useState('')
  const [newStreetType, setNewStreetType] = useState<StreetType>('RUA')
  const [newStreetNeighborhoodId, setNewStreetNeighborhoodId] = useState('')
  const [confirmNeighId, setConfirmNeighId] = useState('')

  // Sentido e conversão
  const [segmentDirection, setSegmentDirection] = useState<'BOTH' | 'FORWARD' | 'BACKWARD'>('BOTH')
  const [restrictionType, setRestrictionType] = useState<'NO_LEFT' | 'NO_RIGHT' | 'NO_U_TURN' | 'MANDATORY_LEFT' | 'MANDATORY_RIGHT'>('NO_LEFT')

  // Desenho manual
  const [manualOfficialName, setManualOfficialName] = useState('')
  const [manualStreetType, setManualStreetType] = useState<StreetType>('RUA')
  const [manualNeighborhoodId, setManualNeighborhoodId] = useState('')
  const [manualAlias, setManualAlias] = useState('')
  const [manualVerified, setManualVerified] = useState(false)
  const [points, setPoints] = useState<Array<{ longitude: number; latitude: number }>>([])
  const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState('')
  const [neighborhoodName, setNeighborhoodName] = useState('')
  const [neighborhoodPoints, setNeighborhoodPoints] = useState<Array<{ longitude: number; latitude: number }>>([])

  const selectedOsm = (osmRecords.data?.records ?? []).find((r) => r.id === selectedOsmId)
  const selectedStreet = (streets.data?.streets ?? []).find(
    (s) => s.id === (selectedStreetId || selectedOsm?.multivusStreetId),
  )

  // Map lines
  const lines = useMemo(() => {
    const streetLines = (streets.data?.streets ?? [])
      .map((s) => {
        const line = lineOf(s.id, s.geometry)
        if (!line) return null
        const isSelected = s.id === selectedStreet?.id
        return {
          id: s.id,
          coordinates: line.coordinates,
          color: isSelected ? '#38bdf8' : s.geometryVerified ? '#10b981' : '#f0b429',
          name: s.officialName,
        }
      })
      .filter((l): l is NonNullable<typeof l> => l !== null)
    const neighborhoodLines = (neighborhoods.data?.neighborhoods ?? []).flatMap((neighborhood) =>
      boundaryLines(neighborhood.id, neighborhood.geometry).map((line) => ({
        ...line,
        color: neighborhood.id === selectedNeighborhoodId ? '#38bdf8' : '#fb923c',
        name: `Bairro: ${neighborhood.name}`,
      })),
    )
    const draftLine = draftBoundaryLine(neighborhoodPoints)
    const streetDraftLine = activeTab === 'manual' && points.length >= 2
      ? {
          id: 'draft-street-track',
          coordinates: points.map(({ longitude, latitude }) => [longitude, latitude] as [number, number]),
          color: '#38bdf8',
          name: 'Novo traçado da rua',
        }
      : null
    return [
      ...streetLines,
      ...neighborhoodLines,
      ...(streetDraftLine ? [streetDraftLine] : []),
      ...(draftLine ? [{ ...draftLine, color: '#f0b429', name: 'Novo limite do bairro' }] : []),
    ]
  }, [
    streets.data?.streets,
    neighborhoods.data?.neighborhoods,
    selectedStreet?.id,
    selectedNeighborhoodId,
    neighborhoodPoints,
    activeTab,
    points,
  ])

  const osmLines = useMemo(() => {
    return (osmRecords.data?.records ?? [])
      .map((r) => {
        const line = lineOf(r.id, r.geometry)
        if (!line) return null
        const isSelected = r.id === selectedOsm?.id
        let color = isSelected ? '#f472b6' : '#a855f7'
        if (r.status === 'APPROVED') color = '#059669'
        if (r.matchType === 'CONFLICT' || r.status === 'CONFLICT') color = '#ef4444'
        if (r.matchType === 'NEW_STREET') color = '#06b6d4'
        return {
          id: r.id,
          coordinates: line.coordinates,
          color,
          name: r.sourceName,
        }
      })
      .filter((l): l is NonNullable<typeof l> => l !== null)
  }, [osmRecords.data?.records, selectedOsm?.id])

  // Filtragem da lista OSM
  const filteredOsmRecords = useMemo(() => {
    return (osmRecords.data?.records ?? []).filter((r) => {
      if (osmFilter === 'EXACT' && r.matchType !== 'MATCH_EXACT') return false
      if (osmFilter === 'ALIAS' && r.matchType !== 'MATCH_ALIAS') return false
      if (osmFilter === 'FUZZY' && r.matchType !== 'MATCH_FUZZY') return false
      if (osmFilter === 'CONFLICT' && r.matchType !== 'CONFLICT' && r.status !== 'CONFLICT') return false
      if (osmFilter === 'NEW_STREET' && r.matchType !== 'NEW_STREET') return false
      if (osmFilter === 'UNRESOLVED' && r.matchType !== 'UNRESOLVED') return false
      if (osmFilter === 'APPROVED' && r.status !== 'APPROVED') return false
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const matchesOsm = r.sourceName.toLowerCase().includes(term)
        const matchesMultivus = (r.multivusOfficialName ?? '').toLowerCase().includes(term)
        if (!matchesOsm && !matchesMultivus) return false
      }
      return true
    })
  }, [osmRecords.data?.records, osmFilter, searchTerm])

  function selectOsm(record: OsmRecord) {
    setSelectedOsmId(record.id)
    if (record.multivusStreetId) {
      setSelectedStreetId(record.multivusStreetId)
      setMergeTargetId(record.multivusStreetId)
    } else {
      setSelectedStreetId('')
      setMergeTargetId('')
    }
    setNewStreetName(record.sourceName)
    if (record.geometry?.coordinates) {
      mapRef.current?.fitBounds(record.geometry.coordinates)
    }
    setMessage(null)
  }

  function selectStreetDirectly(street: EditableStreet) {
    setSelectedStreetId(street.id)
    setManualOfficialName(street.officialName)
    setManualStreetType((street.streetType as StreetType) ?? 'RUA')
    setManualNeighborhoodId(street.neighborhoodId ?? '')
    setManualVerified(street.verified)
    setManualAlias('')
    setPoints([])
    const line = lineOf(street.id, street.geometry)
    if (line) mapRef.current?.fitBounds(line.coordinates)
    setMessage(null)
  }

  function selectNeighborhood(neighborhood: EditableNeighborhood) {
    setSelectedNeighborhoodId(neighborhood.id)
    setNeighborhoodName(neighborhood.name)
    setNeighborhoodPoints(polygonOuterRing(neighborhood.geometry) ?? [])
    const boundary = boundaryLines(neighborhood.id, neighborhood.geometry)[0]
    if (boundary) mapRef.current?.fitBounds(boundary.coordinates)
    setMessage(null)
  }

  // Ações de conferência
  async function handleApproveGeometry() {
    if (!selectedStreet && !selectedOsm?.multivusStreetId) {
      setMessage('Selecione ou mescle com uma rua do Multivus primeiro.')
      return
    }
    const streetId = selectedStreet?.id || selectedOsm?.multivusStreetId
    if (!streetId) return

    setBusy(true)
    try {
      await api('/api/v1/admin/cartography/approve-geometry', {
        method: 'POST',
        body: JSON.stringify({
          streetId,
          importRecordId: selectedOsm?.id,
          source: 'OpenStreetMap',
        }),
      })
      setMessage(`Trecho OSM aprovado e agregado à geometria de ${selectedStreet?.officialName ?? 'a via'}. A confiança do nome não foi alterada.`)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-streets'] }),
        client.invalidateQueries({ queryKey: ['admin-osm-preview'] }),
        client.invalidateQueries({ queryKey: ['admin-stats'] }),
      ])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao aprovar geometria')
    } finally {
      setBusy(false)
    }
  }

  async function handleRejectGeometry() {
    if (!selectedOsmId) return
    setBusy(true)
    try {
      await api('/api/v1/admin/cartography/reject-geometry', {
        method: 'POST',
        body: JSON.stringify({ importRecordId: selectedOsmId, reason: 'Rejeitado pelo editor cartográfico' }),
      })
      setMessage('Geometria rejeitada no lote.')
      await client.invalidateQueries({ queryKey: ['admin-osm-preview'] })
      await client.invalidateQueries({ queryKey: ['admin-stats'] })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao rejeitar')
    } finally {
      setBusy(false)
    }
  }

  async function handleMergeStreet() {
    if (!selectedOsmId || !mergeTargetId) {
      setMessage('Selecione a rua do Multivus para mesclar.')
      return
    }
    setBusy(true)
    try {
      await api('/api/v1/admin/cartography/merge-street', {
        method: 'POST',
        body: JSON.stringify({ importRecordId: selectedOsmId, targetStreetId: mergeTargetId }),
      })
      setMessage('Rua mesclada com a geometria OSM e aprovada!')
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-streets'] }),
        client.invalidateQueries({ queryKey: ['admin-osm-preview'] }),
        client.invalidateQueries({ queryKey: ['admin-stats'] }),
      ])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao mesclar')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateFromOsm() {
    if (!selectedOsmId || !newStreetName.trim()) {
      setMessage('Defina o nome oficial da nova via.')
      return
    }
    setBusy(true)
    try {
      await api('/api/v1/admin/cartography/create-from-osm', {
        method: 'POST',
        body: JSON.stringify({
          importRecordId: selectedOsmId,
          officialName: newStreetName.trim(),
          streetType: newStreetType,
          neighborhoodId: newStreetNeighborhoodId || null,
        }),
      })
      setMessage(`Nova via "${newStreetName}" criada a partir da geometria OSM!`)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-streets'] }),
        client.invalidateQueries({ queryKey: ['admin-osm-preview'] }),
        client.invalidateQueries({ queryKey: ['admin-stats'] }),
      ])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao criar nova via')
    } finally {
      setBusy(false)
    }
  }

  async function handleMarkConflict() {
    if (!selectedOsmId) return
    setBusy(true)
    try {
      await api('/api/v1/admin/cartography/mark-conflict', {
        method: 'POST',
        body: JSON.stringify({ importRecordId: selectedOsmId, notes: 'Marcado como conflito para conferência em campo' }),
      })
      setMessage('Registro marcado como CONFLITO.')
      await client.invalidateQueries({ queryKey: ['admin-osm-preview'] })
      await client.invalidateQueries({ queryKey: ['admin-stats'] })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao marcar conflito')
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmNeighborhood() {
    if (!selectedStreet?.id || !confirmNeighId) {
      setMessage('Selecione o bairro a ser confirmado.')
      return
    }
    setBusy(true)
    try {
      await api('/api/v1/admin/cartography/confirm-neighborhood', {
        method: 'POST',
        body: JSON.stringify({
          streetId: selectedStreet.id,
          neighborhoodId: confirmNeighId,
          source: 'Conferência administrativa local',
        }),
      })
      setMessage(`Bairro confirmado para ${selectedStreet.officialName}!`)
      await client.invalidateQueries({ queryKey: ['admin-streets'] })
      await client.invalidateQueries({ queryKey: ['admin-stats'] })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao confirmar bairro')
    } finally {
      setBusy(false)
    }
  }

  // Sentido de circulação e conversões
  async function handleSaveDirection() {
    if (!selectedStreet?.id || !selectedStreet.geometry) {
      setMessage('Selecione uma rua com geometria primeiro.')
      return
    }
    setBusy(true)
    try {
      await api('/api/v1/street-segments', {
        method: 'POST',
        body: JSON.stringify({
          streetId: selectedStreet.id,
          direction: segmentDirection,
          geometry: selectedStreet.geometry,
        }),
      })
      setMessage(`Sentido de circulação (${segmentDirection}) registrado e verificado!`)
      await client.invalidateQueries({ queryKey: ['admin-stats'] })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar sentido')
    } finally {
      setBusy(false)
    }
  }

  // Desenho Manual
  async function handleSaveManual() {
    setMessage(null)
    const geometry = points.length >= 2
      ? { type: 'LineString', coordinates: points.map((point) => [point.longitude, point.latitude]) }
      : undefined
    if (!manualOfficialName.trim()) {
      setMessage('Informe o nome oficial da rua.')
      return
    }
    setBusy(true)
    try {
      if (selectedStreetId) {
        await api(`/api/v1/streets/${selectedStreetId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            officialName: manualOfficialName.trim(),
            streetType: manualStreetType,
            neighborhoodId: manualNeighborhoodId || null,
            verified: manualVerified,
            ...(geometry ? { geometry } : {}),
          }),
        })
        if (manualAlias.trim()) {
          await api('/api/v1/street-aliases', {
            method: 'POST',
            body: JSON.stringify({ streetId: selectedStreetId, alias: manualAlias.trim(), aliasType: 'OLD_NAME' }),
          })
        }
        setMessage('Rua atualizada. O histórico foi preservado com audit_log.')
      } else {
        await api('/api/v1/streets', {
          method: 'POST',
          body: JSON.stringify({
            officialName: manualOfficialName.trim(),
            streetType: manualStreetType,
            neighborhoodId: manualNeighborhoodId || null,
            source: 'Conferência local',
            sourceDate: new Date().toISOString().slice(0, 10),
            geometry: geometry ?? null,
            aliases: manualAlias.trim() ? [{ alias: manualAlias.trim(), aliasType: 'OLD_NAME' }] : [],
          }),
        })
        setMessage('Rua criada com sucesso!')
      }
      setPoints([])
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-streets'] }),
        client.invalidateQueries({ queryKey: ['admin-stats'] }),
        client.invalidateQueries({ queryKey: ['neighborhoods'] }),
      ])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a rua.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveNeighborhood() {
    setMessage(null)
    if (!neighborhoodName.trim()) {
      setMessage('Informe o nome do bairro.')
      return
    }
    if (neighborhoodPoints.length < 3) {
      setMessage('Marque pelo menos 3 pontos no mapa para desenhar o limite do bairro.')
      return
    }
    const ring = neighborhoodPoints.map(({ longitude, latitude }) => [longitude, latitude])
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([...first])
    const geometry = { type: 'Polygon', coordinates: [ring] }
    setBusy(true)
    try {
      if (selectedNeighborhoodId) {
        await api(`/api/v1/neighborhoods/${selectedNeighborhoodId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: neighborhoodName.trim(),
            source: 'Conferência local',
            sourceDate: new Date().toISOString().slice(0, 10),
            geometry,
          }),
        })
        setMessage(`Bairro "${neighborhoodName.trim()}" e seu limite foram atualizados.`)
      } else {
        const response = await api<{ neighborhood: { id: string } }>('/api/v1/neighborhoods', {
          method: 'POST',
          body: JSON.stringify({
            name: neighborhoodName.trim(),
            source: 'Conferência local',
            sourceDate: new Date().toISOString().slice(0, 10),
            geometry,
          }),
        })
        setSelectedNeighborhoodId(response.neighborhood.id)
        setMessage(`Bairro "${neighborhoodName.trim()}" e seu limite foram cadastrados.`)
      }
      setNeighborhoodPoints([])
      await Promise.all([
        client.invalidateQueries({ queryKey: ['neighborhoods'] }),
        client.invalidateQueries({ queryKey: ['admin-streets'] }),
        client.invalidateQueries({ queryKey: ['admin-stats'] }),
      ])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o bairro.')
    } finally {
      setBusy(false)
    }
  }

  if (!user) return <Navigate to="/entrar" replace />
  if (!can(user.role, 'street:write')) return <p className="p-4">Sem permissão para editar o mapa.</p>

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_minmax(0,1.4fr)] bg-[#0e141b] text-white">
      {/* Cabeçalho */}
      <header className="flex flex-col border-b border-white/10 bg-[#12181f]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-sm font-medium text-amber-300 hover:underline">
              ← Painel
            </Link>
            <span className="text-slate-500">|</span>
            <h1 className="text-base font-semibold">Conferência Cartográfica & Mapa</h1>
          </div>

          {/* Camadas do Mapa */}
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer rounded-lg bg-black/30 px-2.5 py-1.5 border border-white/10">
              <input
                type="checkbox"
                checked={showMultivus}
                onChange={(e) => setShowMultivus(e.target.checked)}
                className="accent-amber-400"
              />
              <span className="font-semibold text-amber-300">MULTIVUS</span>
              <span className="text-slate-400">({streets.data?.streets.length ?? 0})</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer rounded-lg bg-black/30 px-2.5 py-1.5 border border-white/10">
              <input
                type="checkbox"
                checked={showOsm}
                onChange={(e) => setShowOsm(e.target.checked)}
                className="accent-purple-400"
              />
              <span className="font-semibold text-purple-300">OSM (Base)</span>
              <span className="text-slate-400">({osmRecords.data?.records.length ?? 0})</span>
            </label>
          </div>
        </div>

        {/* Barra de Auditoria de Indicadores da Malha Viária */}
        <div className="grid grid-cols-2 gap-2 border-t border-white/5 bg-black/25 px-4 py-2 text-[11px] sm:grid-cols-5">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">OSM Pendentes:</span>
            <span className="font-bold text-purple-300">{summary.osmPending}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Aprovadas:</span>
            <span className="font-bold text-emerald-300">{summary.osmApproved}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Conflitos:</span>
            <span className={`font-bold ${summary.osmConflicts > 0 ? 'text-red-400' : 'text-slate-300'}`}>{summary.osmConflicts}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Sem Geometria:</span>
            <span className={`font-bold ${summary.withoutGeometry > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{summary.withoutGeometry}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Sem Bairro:</span>
            <span className="font-bold text-amber-300">{summary.withoutNeighborhood}</span>
          </div>
        </div>
        {coverage.data?.stats ? (
          <div className="grid grid-cols-2 gap-2 border-t border-white/5 bg-black/15 px-4 py-2 text-[11px] sm:grid-cols-3 lg:grid-cols-6">
            <div><span className="text-slate-400">Geometrias viárias:</span> <strong className="text-white">{coverage.data.stats.streetsWithGeometry}/{coverage.data.stats.streets}</strong> <span className="text-emerald-300">· {coverage.data.stats.geometryVerifiedStreets} verificadas</span></div>
            <div><span className="text-slate-400">Sem geometria:</span> <strong className="text-amber-300">{coverage.data.stats.streetsWithoutGeometry}</strong></div>
            <div><span className="text-slate-400">Sem bairro confirmado:</span> <strong className="text-amber-300">{coverage.data.stats.streetsWithoutNeighborhood}</strong></div>
            <div><span className="text-slate-400">Limites de bairros:</span> <strong className="text-white">{coverage.data.stats.neighborhoodsWithGeometry}/{coverage.data.stats.neighborhoods}</strong></div>
            <div><span className="text-slate-400">Endereços com coordenada:</span> <strong className="text-white">{coverage.data.stats.addressPointsWithGeometry}/{coverage.data.stats.addressPoints}</strong> <span className="text-emerald-300">· {coverage.data.stats.addressPointsVerified} verificados</span></div>
            <div><span className="text-slate-400">Pontos sem coordenada:</span> <strong className="text-amber-300">{coverage.data.stats.placesWithoutCoordinates}</strong></div>
          </div>
        ) : coverage.isError ? (
          <p className="border-t border-white/5 bg-black/15 px-4 py-2 text-[11px] text-red-300">Não foi possível carregar as métricas de cobertura do banco.</p>
        ) : null}
      </header>

      {/* Mapa Central */}
      <div className="relative h-full w-full">
        <Map
          handle={mapRef}
          className="h-full w-full"
          lines={lines}
          osmLines={osmLines}
          showMultivus={showMultivus}
          showOsm={showOsm}
          points={(activeTab === 'neighborhoods' ? neighborhoodPoints : points).map((point, index) => ({
            id: String(index),
            ...point,
            color: '#f0b429',
          }))}
          onClick={activeTab === 'manual'
            ? (point) => setPoints((current) => [...current, point])
            : activeTab === 'neighborhoods'
              ? (point) => setNeighborhoodPoints((current) => [...current, point])
              : undefined}
        />
        {/* Legenda Flutuante */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-xl bg-slate-900/90 p-2 text-[11px] shadow-lg backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="h-2 w-4 rounded-full bg-[#10b981]" />
            <span>Multivus (geometria verificada)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-4 rounded-full bg-[#f0b429]" />
            <span>Multivus (geometria pendente)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-4 rounded-full bg-[#a855f7]" />
            <span>OpenStreetMap (Geometria Real)</span>
          </div>
        </div>
      </div>

      {/* Painel Inferior de Conferência */}
      <div className="flex flex-col overflow-hidden bg-[#12181f] border-t border-white/10">
        {/* Navegação por Abas */}
        <div className="flex overflow-x-auto border-b border-white/10 bg-[#161e27] px-3">
          <button
            type="button"
            onClick={() => setActiveTab('osm')}
            className={`shrink-0 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition border-b-2 ${
              activeTab === 'osm'
                ? 'border-purple-400 text-purple-300 bg-white/5'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Conferência OSM ({osmRecords.data?.records.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('streets')}
            className={`shrink-0 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition border-b-2 ${
              activeTab === 'streets'
                ? 'border-amber-400 text-amber-300 bg-white/5'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Ruas Multivus ({streets.data?.streets.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('direction')}
            className={`shrink-0 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition border-b-2 ${
              activeTab === 'direction'
                ? 'border-teal-400 text-teal-300 bg-white/5'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Sentido & Conversões
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`shrink-0 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition border-b-2 ${
              activeTab === 'manual'
                ? 'border-sky-400 text-sky-300 bg-white/5'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Desenho Manual
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('neighborhoods')}
            className={`shrink-0 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition border-b-2 ${
              activeTab === 'neighborhoods'
                ? 'border-orange-400 text-orange-300 bg-white/5'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Bairros ({neighborhoods.data?.neighborhoods.length ?? 0})
          </button>
        </div>

        {/* Notificações e Mensagens */}
        {message ? (
          <div className="bg-amber-500/20 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-200">
            {message}
          </div>
        ) : null}

        {/* Conteúdo da Aba */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* ABA 1: CONFERÊNCIA OSM */}
          {activeTab === 'osm' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
              {/* Coluna 1: Lista e Filtros de Registros OSM */}
              <div className="flex flex-col gap-2 overflow-y-auto pr-1">
                <div className="flex gap-2">
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrar por nome OSM ou Multivus..."
                    className="h-10 flex-1 rounded-xl bg-[#1c242c] px-3 text-xs outline-none border border-white/5"
                  />
                  <select
                    value={osmFilter}
                    onChange={(e) => setOsmFilter(e.target.value)}
                    className="h-10 rounded-xl bg-[#1c242c] px-3 text-xs outline-none border border-white/5"
                  >
                    <option value="ALL">Todos os status</option>
                    <option value="EXACT">MATCH_EXACT</option>
                    <option value="ALIAS">MATCH_ALIAS</option>
                    <option value="FUZZY">MATCH_FUZZY</option>
                    <option value="CONFLICT">CONFLICT</option>
                    <option value="NEW_STREET">NEW_STREET</option>
                    <option value="UNRESOLVED">UNRESOLVED</option>
                    <option value="APPROVED">APPROVED</option>
                  </select>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[340px]">
                  {filteredOsmRecords.map((record) => {
                    const isSelected = record.id === selectedOsmId
                    return (
                      <div
                        key={record.id}
                        onClick={() => selectOsm(record)}
                        className={`cursor-pointer rounded-xl p-3 border transition text-xs ${
                          isSelected
                            ? 'bg-purple-950/40 border-purple-500 text-white'
                            : 'bg-[#1c242c] border-white/5 hover:bg-[#25303b] text-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-sm text-white">{record.sourceName}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              record.status === 'APPROVED'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : record.matchType === 'MATCH_EXACT'
                                  ? 'bg-green-500/20 text-green-300'
                                  : record.matchType === 'MATCH_ALIAS'
                                    ? 'bg-blue-500/20 text-blue-300'
                                    : record.matchType === 'MATCH_FUZZY'
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : record.matchType === 'CONFLICT'
                                        ? 'bg-red-500/20 text-red-300'
                                        : 'bg-purple-500/20 text-purple-300'
                            }`}
                          >
                            {record.matchType} ({record.score}%)
                          </span>
                        </div>
                        {record.multivusOfficialName ? (
                          <div className="mt-1 text-slate-400">
                            → Multivus: <span className="text-amber-200 font-medium">{record.multivusOfficialName}</span>
                          </div>
                        ) : (
                          <div className="mt-1 text-slate-500 italic">Sem correspondência no Multivus</div>
                        )}
                      </div>
                    )
                  })}
                  {filteredOsmRecords.length === 0 ? (
                    <p className="p-4 text-center text-xs text-slate-500">Nenhum registro encontrado no filtro.</p>
                  ) : null}
                </div>
              </div>

              {/* Coluna 2: Cartão de Inspeção Cartográfica */}
              <div className="rounded-2xl bg-[#1c242c] p-4 border border-white/5 overflow-y-auto">
                {selectedOsm ? (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <h3 className="font-semibold text-sm text-white">Inspeção da Via</h3>
                      <span className="rounded bg-purple-500/20 px-2 py-0.5 font-mono text-[10px] text-purple-300">
                        OSM ID: {selectedOsm.osmId}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-slate-400 text-[11px] block">Nome Multivus</span>
                        <span className="font-medium text-amber-200 text-sm">
                          {selectedStreet?.officialName || selectedOsm.multivusOfficialName || '— (Não associada)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] block">Nome OSM</span>
                        <span className="font-medium text-purple-200 text-sm">{selectedOsm.sourceName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] block">Tipo de Logradouro</span>
                        <span className="font-medium text-white">{selectedStreet?.streetType || selectedOsm.streetType}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] block">Bairro</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-white">{selectedStreet?.neighborhoodName || 'Não confirmado'}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${selectedStreet?.neighborhoodStatus === 'CONFIRMED' ? 'bg-teal-500/20 text-teal-300' : 'bg-amber-500/20 text-amber-300'}`}>
                            {selectedStreet?.neighborhoodStatus === 'CONFIRMED' ? 'Confirmado' : 'Pendente'}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] block">Confiança Cartográfica</span>
                        <span className={`font-bold text-sm ${(selectedStreet?.confidenceScore ?? selectedOsm.score) >= 90 ? 'text-teal-400' : 'text-amber-400'}`}>
                          {selectedStreet?.confidenceScore ?? selectedOsm.score}/100
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] block">Geometria</span>
                        <span className={`font-medium ${selectedStreet?.geometryVerified ? 'text-emerald-400' : selectedStreet?.geometry ? 'text-amber-400' : 'text-slate-400'}`}>
                          {selectedStreet?.geometryVerified ? '✅ Geometria verificada' : selectedStreet?.geometry ? '⏳ Geometria pendente' : 'Sem geometria'}
                        </span>
                      </div>
                    </div>

                    {/* Fontes independentes */}
                    <div className="rounded-xl bg-black/30 p-2.5 border border-white/5 space-y-1 text-[11px]">
                      <div className="text-slate-400 font-semibold uppercase text-[10px] tracking-wide">Fontes dos Dados:</div>
                      <div>• Nome: <span className="text-slate-300">{selectedStreet?.source || 'Não registrado'}</span></div>
                      <div>• Geometria: <span className="text-slate-300">{selectedStreet?.geometrySource || 'Não registrado'}</span></div>
                      <div>• Bairro: <span className="text-slate-300">{selectedStreet?.neighborhoodSource || 'Não conferido'}</span></div>
                    </div>

                    {/* Botões de Ação do Painel */}
                    <div className="pt-2 border-t border-white/10 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleApproveGeometry()}
                          className="h-10 rounded-xl bg-[#f0b429] font-bold text-slate-900 hover:brightness-105 active:scale-95 transition"
                        >
                          APROVAR GEOMETRIA
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleRejectGeometry()}
                          className="h-10 rounded-xl bg-white/10 font-medium hover:bg-white/20 transition"
                        >
                          REJEITAR
                        </button>
                      </div>

                      {/* Mesclar com outra rua */}
                      <div className="rounded-xl bg-[#161e27] p-2.5 border border-white/5 space-y-1.5">
                        <span className="font-semibold text-slate-300 text-[11px] block">Mesclar com outra rua Multivus:</span>
                        <div className="flex gap-2">
                          <select
                            value={mergeTargetId}
                            onChange={(e) => setMergeTargetId(e.target.value)}
                            className="h-9 flex-1 rounded-lg bg-[#1c242c] px-2 text-xs outline-none"
                          >
                            <option value="">Selecione a rua do Multivus...</option>
                            {(streets.data?.streets ?? []).map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.officialName} ({s.geometry ? 'Com geometria' : 'Sem geometria'})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={busy || !mergeTargetId}
                            onClick={() => void handleMergeStreet()}
                            className="h-9 rounded-lg bg-blue-600 px-3 font-semibold hover:bg-blue-500 transition text-xs"
                          >
                            MESCLAR
                          </button>
                        </div>
                      </div>

                      {/* Criar nova via a partir do OSM */}
                      {selectedOsm.matchType === 'NEW_STREET' || !selectedOsm.multivusStreetId ? (
                        <div className="rounded-xl bg-[#161e27] p-2.5 border border-white/5 space-y-1.5">
                          <span className="font-semibold text-slate-300 text-[11px] block">Criar nova via no Multivus:</span>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={newStreetName}
                              onChange={(e) => setNewStreetName(e.target.value)}
                              placeholder="Nome oficial da nova via"
                              className="h-9 rounded-lg bg-[#1c242c] px-2 text-xs outline-none"
                            />
                            <select
                              value={newStreetType}
                              onChange={(e) => setNewStreetType(e.target.value as StreetType)}
                              className="h-9 rounded-lg bg-[#1c242c] px-2 text-xs outline-none"
                            >
                              {STREET_TYPES.map((t) => <option key={t}>{t}</option>)}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <select
                              value={newStreetNeighborhoodId}
                              onChange={(e) => setNewStreetNeighborhoodId(e.target.value)}
                              className="h-9 flex-1 rounded-lg bg-[#1c242c] px-2 text-xs outline-none"
                            >
                              <option value="">Bairro (opcional)...</option>
                              {(neighborhoods.data?.neighborhoods ?? []).map((n) => (
                                <option key={n.id} value={n.id}>{n.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={busy || !newStreetName.trim()}
                              onClick={() => void handleCreateFromOsm()}
                              className="h-9 rounded-lg bg-emerald-600 px-3 font-semibold hover:bg-emerald-500 transition text-xs"
                            >
                              CRIAR VIA
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {/* Confirmar Bairro & Marcar Conflito */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleMarkConflict()}
                          className="h-9 rounded-xl bg-red-950/40 text-red-300 border border-red-800/40 font-medium hover:bg-red-900/40 transition"
                        >
                          MARCAR CONFLITO
                        </button>
                        <div className="flex gap-1">
                          <select
                            value={confirmNeighId}
                            onChange={(e) => setConfirmNeighId(e.target.value)}
                            className="h-9 flex-1 rounded-xl bg-[#161e27] px-2 text-xs outline-none"
                          >
                            <option value="">Confirmar Bairro...</option>
                            {(neighborhoods.data?.neighborhoods ?? []).map((n) => (
                              <option key={n.id} value={n.id}>{n.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={busy || !confirmNeighId || !selectedStreet?.id}
                            onClick={() => void handleConfirmNeighborhood()}
                            className="h-9 rounded-xl bg-teal-600 px-2 font-semibold text-xs hover:bg-teal-500 transition"
                          >
                            OK
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center p-8 text-center text-slate-400">
                    <div>
                      <p className="font-semibold text-white">Nenhuma via selecionada</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Clique em uma via na lista ao lado ou na linha roxa no mapa para inspecionar e aprovar a geometria.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ABA 2: RUAS MULTIVUS */}
          {activeTab === 'streets' && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 gap-2">
                  <input
                    value={streetSearchTerm}
                    onChange={(e) => setStreetSearchTerm(e.target.value)}
                    placeholder="Buscar rua por nome ou bairro..."
                    className="h-10 flex-1 rounded-xl bg-[#1c242c] px-3 text-xs outline-none border border-white/5"
                  />
                  <select
                    value={streetFilter}
                    onChange={(e) => setStreetFilter(e.target.value as typeof streetFilter)}
                    className="h-10 rounded-xl bg-[#1c242c] px-3 text-xs outline-none border border-white/5"
                  >
                    <option value="ALL">Todas as ruas ({summary.totalStreets})</option>
                    <option value="WITHOUT_GEOM">Sem geometria ({summary.withoutGeometry})</option>
                    <option value="WITH_GEOM">Com geometria ({summary.withGeometry})</option>
                    <option value="WITHOUT_NEIGHBORHOOD">Sem bairro confirmado ({summary.withoutNeighborhood})</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400">Exibindo: <strong className="text-white">{filteredStreets.length}</strong></span>
                  <span className="text-emerald-400">Com geometria: <strong>{summary.withGeometry}</strong></span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {filteredStreets.map((street) => (
                  <button
                    key={street.id}
                    type="button"
                    onClick={() => selectStreetDirectly(street)}
                    className={`rounded-xl p-3 text-left transition border text-xs ${
                      street.id === selectedStreetId
                        ? 'bg-amber-950/40 border-amber-500 text-white'
                        : 'bg-[#1c242c] border-white/5 hover:bg-[#25303b] text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{street.officialName}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${street.geometryVerified ? 'bg-emerald-500/20 text-emerald-300' : street.geometry ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-500/20 text-slate-300'}`}>
                        {street.geometryVerified ? 'GEOMETRIA VERIFICADA' : street.geometry ? 'GEOMETRIA PENDENTE' : 'SEM GEOMETRIA'}
                      </span>
                    </div>
                    <div className="mt-1 text-slate-400 text-[11px]">
                      Bairro: {street.neighborhoodName || 'Não confirmado'}
                    </div>
                    <div className="mt-0.5 text-slate-500 text-[10px]">
                      Fonte: {street.source || 'Não registrada'}{street.sourceDate ? ` (${street.sourceDate})` : ''}
                    </div>
                  </button>
                ))}
                {filteredStreets.length === 0 ? (
                  <p className="col-span-full p-4 text-center text-xs text-slate-400">Nenhuma rua encontrada com esse filtro.</p>
                ) : null}
              </div>
            </div>
          )}

          {/* ABA 3: SENTIDO & CONVERSÕES */}
          {activeTab === 'direction' && (
            <div className="max-w-xl mx-auto space-y-4">
              <div className="rounded-2xl bg-[#1c242c] p-4 border border-white/5 space-y-3">
                <h3 className="font-semibold text-sm text-white">Sentido de Circulação da Via</h3>
                <p className="text-xs text-slate-400">
                  Via selecionada: <span className="text-amber-200 font-semibold">{selectedStreet?.officialName || 'Nenhuma via selecionada'}</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSegmentDirection('BOTH')}
                    className={`h-11 rounded-xl font-semibold text-xs transition ${segmentDirection === 'BOTH' ? 'bg-teal-500 text-slate-900' : 'bg-white/10 text-white'}`}
                  >
                    MÃO DUPLA
                  </button>
                  <button
                    type="button"
                    onClick={() => setSegmentDirection('FORWARD')}
                    className={`h-11 rounded-xl font-semibold text-xs transition ${segmentDirection === 'FORWARD' ? 'bg-teal-500 text-slate-900' : 'bg-white/10 text-white'}`}
                  >
                    MÃO ÚNICA (IDA)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSegmentDirection('BACKWARD')}
                    className={`h-11 rounded-xl font-semibold text-xs transition ${segmentDirection === 'BACKWARD' ? 'bg-teal-500 text-slate-900' : 'bg-white/10 text-white'}`}
                  >
                    MÃO ÚNICA (VOLTA)
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy || !selectedStreet?.id || !selectedStreet.geometry}
                  onClick={() => void handleSaveDirection()}
                  className="w-full h-11 rounded-xl bg-[#f0b429] font-bold text-slate-900 hover:brightness-105 transition text-xs"
                >
                  CONFIRMAR SENTIDO EM CAMPO
                </button>
              </div>

              {/* Conversões Proibidas (Turn Restrictions) */}
              <div className="rounded-2xl bg-[#1c242c] p-4 border border-white/5 space-y-3">
                <h3 className="font-semibold text-sm text-white">Restrições de Conversão</h3>
                <p className="text-xs text-slate-400">
                  Marque restrições de manobra confirmadas no trânsito local.
                </p>
                <select
                  value={restrictionType}
                  onChange={(e) => setRestrictionType(e.target.value as 'NO_LEFT' | 'NO_RIGHT' | 'NO_U_TURN' | 'MANDATORY_LEFT' | 'MANDATORY_RIGHT')}
                  className="h-11 w-full rounded-xl bg-[#161e27] px-3 text-xs outline-none"
                >
                  <option value="NO_LEFT">PROIBIDO VIRAR À ESQUERDA</option>
                  <option value="NO_RIGHT">PROIBIDO VIRAR À DIREITA</option>
                  <option value="NO_U_TURN">PROIBIDO RETORNO</option>
                  <option value="MANDATORY_LEFT">OBRIGATÓRIO À ESQUERDA</option>
                  <option value="MANDATORY_RIGHT">OBRIGATÓRIO À DIREITA</option>
                </select>
              </div>
            </div>
          )}

          {/* ABA 4: DESENHO MANUAL */}
          {activeTab === 'manual' && (
            <div className="max-w-xl mx-auto space-y-3">
              <p className="text-xs text-slate-400">
                Para traçar uma rua, toque no mapa em sequência ao longo do percurso. O traçado é salvo como geometria da via; não representa número de residência.
              </p>
              <label className="block text-xs text-slate-300">
                Selecionar via existente para redesenhar:
                <select
                  value={selectedStreetId}
                  onChange={(e) => {
                    const s = streets.data?.streets.find((item) => item.id === e.target.value)
                    setSelectedStreetId(e.target.value)
                    setManualOfficialName(s?.officialName ?? '')
                    setManualStreetType((s?.streetType as StreetType) ?? 'RUA')
                    setManualNeighborhoodId(s?.neighborhoodId ?? '')
                    setManualVerified(s?.verified ?? false)
                    setManualAlias('')
                    setPoints([])
                  }}
                  className="mt-1 h-11 w-full rounded-xl bg-[#1c242c] px-3 text-xs"
                >
                  <option value="">Nova via</option>
                  {(streets.data?.streets ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.officialName} {s.geometryVerified ? '· Verificada' : '· Sem geometria'}
                    </option>
                  ))}
                </select>
              </label>

              <input
                value={manualOfficialName}
                onChange={(e) => setManualOfficialName(e.target.value)}
                placeholder="Nome oficial"
                className="h-11 w-full rounded-xl bg-[#1c242c] px-3 text-xs"
              />

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={manualStreetType}
                  onChange={(e) => setManualStreetType(e.target.value as StreetType)}
                  className="h-11 rounded-xl bg-[#1c242c] px-3 text-xs"
                >
                  {STREET_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
                <select
                  value={manualNeighborhoodId}
                  onChange={(e) => setManualNeighborhoodId(e.target.value)}
                  className="h-11 rounded-xl bg-[#1c242c] px-3 text-xs"
                >
                  <option value="">Bairro...</option>
                  {(neighborhoods.data?.neighborhoods ?? []).map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>

              <input
                value={manualAlias}
                onChange={(e) => setManualAlias(e.target.value)}
                placeholder="Nome antigo / alias (ex.: Lírios)"
                className="h-11 w-full rounded-xl bg-[#1c242c] px-3 text-xs"
              />

              <label className="flex h-10 items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={manualVerified}
                  onChange={(e) => setManualVerified(e.target.checked)}
                  className="accent-amber-400"
                />
                Marcar o nome como verificado em campo (confiança 100)
              </label>

              <p className="text-xs text-slate-400">
                {points.length === 0
                  ? 'Toque no mapa para desenhar a geometria (mínimo 2 pontos).'
                  : `${points.length} ponto(s) desenhado(s).`}
              </p>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  className="h-11 rounded-xl bg-white/10 font-medium text-xs hover:bg-white/20 transition"
                  onClick={() => setPoints([])}
                >
                  Limpar Pontos
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="h-11 rounded-xl bg-[#f0b429] font-bold text-slate-900 text-xs hover:brightness-105 transition"
                  onClick={() => void handleSaveManual()}
                >
                  {busy ? 'Salvando...' : 'Salvar Rua'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'neighborhoods' && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">Bairros cadastrados</h2>
                    <p className="text-xs text-slate-400">Selecione para editar ou comece um novo cadastro.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNeighborhoodId('')
                      setNeighborhoodName('')
                      setNeighborhoodPoints([])
                      setMessage(null)
                    }}
                    className="h-10 shrink-0 rounded-xl bg-orange-500 px-3 text-xs font-bold text-slate-950"
                  >
                    + Novo bairro
                  </button>
                </div>
                {neighborhoods.isError ? (
                  <p className="rounded-xl bg-red-950/40 p-3 text-xs text-red-200">Não foi possível carregar os bairros. Verifique sua conexão e tente novamente.</p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {(neighborhoods.data?.neighborhoods ?? []).map((neighborhood) => (
                    <button
                      key={neighborhood.id}
                      type="button"
                      onClick={() => selectNeighborhood(neighborhood)}
                      className={`rounded-xl border p-3 text-left ${
                        neighborhood.id === selectedNeighborhoodId
                          ? 'border-orange-400 bg-orange-950/30'
                          : 'border-white/5 bg-[#1c242c] hover:bg-[#25303b]'
                      }`}
                    >
                      <span className="block font-semibold">{neighborhood.name}</span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {neighborhood.hasGeometry ? 'Limite desenhado' : 'Sem limite cadastrado'}
                        {neighborhood.source ? ` · Fonte: ${neighborhood.source}` : ''}
                      </span>
                    </button>
                  ))}
                  {neighborhoods.data?.neighborhoods.length === 0 ? (
                    <p className="rounded-xl bg-[#1c242c] p-4 text-sm text-slate-400">Nenhum bairro cadastrado.</p>
                  ) : null}
                </div>
              </section>

              <section className="space-y-3 rounded-2xl border border-white/5 bg-[#1c242c] p-4">
                <div>
                  <h2 className="font-semibold">{selectedNeighborhoodId ? 'Editar bairro' : 'Cadastrar bairro'}</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Informe o nome e toque no mapa para marcar pelo menos 3 pontos contornando o bairro. O último ponto será ligado ao primeiro.
                    Desenhos manuais ficam identificados como conferência local, não como limite oficial.
                  </p>
                </div>
                <label className="block text-xs text-slate-300">
                  Nome do bairro
                  <input
                    value={neighborhoodName}
                    onChange={(event) => setNeighborhoodName(event.target.value)}
                    placeholder="Ex.: Centro"
                    maxLength={160}
                    className="mt-1 h-11 w-full rounded-xl bg-[#111820] px-3 text-sm text-white outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </label>
                <p className="text-xs text-orange-200">
                  {neighborhoodPoints.length
                    ? `${neighborhoodPoints.length} ponto(s) marcados. Clique no mapa para continuar o contorno.`
                    : 'Nenhum ponto marcado. Amplie o mapa e comece a contornar o bairro.'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNeighborhoodPoints([])}
                    className="h-11 rounded-xl bg-white/10 text-xs font-semibold hover:bg-white/20"
                  >
                    Limpar contorno
                  </button>
                  <button
                    type="button"
                    disabled={busy || neighborhoodPoints.length < 3 || !neighborhoodName.trim()}
                    onClick={() => void handleSaveNeighborhood()}
                    className="h-11 rounded-xl bg-orange-400 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? 'Salvando...' : 'Salvar bairro e limite'}
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, alert }: { label: string; value: number | undefined; alert?: boolean }) {
  return (
    <div className={`flex flex-col justify-between rounded-2xl p-4 border transition ${alert ? 'bg-amber-950/20 border-amber-500/40 text-amber-200' : 'bg-[#1c242c] border-white/5 text-slate-300'}`}>
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <span className="mt-1 text-2xl font-bold text-white">{value ?? '—'}</span>
    </div>
  )
}


type Stats = {
  pendingCorrections: number
  streets: number
  verifiedStreets: number
  streetsWithGeometry?: number
  geometryVerifiedStreets?: number
  streetsWithoutGeometry: number
  streetsWithoutNeighborhood?: number
  streetsWithOldNames?: number
  neighborhoods: number
  neighborhoodsWithGeometry?: number
  neighborhoodsWithoutGeometry?: number
  addressPoints?: number
  addressPointsWithGeometry?: number
  addressPointsWithoutGeometry?: number
  addressPointsVerified?: number
  placesWithoutCoordinates?: number
  landmarksWithoutCoordinates?: number
  pendingOsmRecords?: number
  conflictingOsmRecords?: number
  unverifiedStreetSegments?: number
  invalidStreetGeometries?: number
  duplicateStreetNames?: number
  duplicateStreetGeometries?: number
  places: number
  landmarks?: number
  localReferences?: number
  aliases: number
  users: number
  topSearches?: Array<{ query: string; count: number }>
  topReferences?: Array<{ popularPhrase: string; targetStreetName: string | null; confirmationsCount: number }>
  correctionsByType?: Array<{ correctionType: string; count: number }>
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
  neighborhoodName: string | null
  neighborhoodStatus?: string | null
  neighborhoodSource?: string | null
  verified: boolean
  confidenceScore?: number | null
  geometrySource?: string | null
  geometrySourceDate?: string | null
  geometryVerified?: boolean
  source?: string | null
  sourceDate?: string | null
  geometry: unknown
  aliases?: Array<{ id: string; alias: string; aliasType: string; active?: boolean }>
}

type EditableNeighborhood = {
  id: string
  name: string
  source: string | null
  sourceDate: string | null
  hasGeometry: boolean
  geometry: unknown
}

function polygonOuterRing(geometry: unknown): Array<{ longitude: number; latitude: number }> | null {
  if (!geometry || typeof geometry !== 'object' || !('type' in geometry) || !('coordinates' in geometry)) return null
  const shape = geometry as { type: unknown; coordinates: unknown }
  const polygons = shape.type === 'Polygon'
    ? [shape.coordinates]
    : shape.type === 'MultiPolygon' && Array.isArray(shape.coordinates)
      ? shape.coordinates
      : []
  const polygon = polygons[0]
  const ring = Array.isArray(polygon) ? polygon[0] : null
  if (!Array.isArray(ring)) return null
  const result = ring.flatMap((position) => {
    if (!Array.isArray(position) || typeof position[0] !== 'number' || typeof position[1] !== 'number') return []
    if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) return []
    return [{ longitude: position[0], latitude: position[1] }]
  })
  if (result.length > 1) {
    const first = result[0]
    const last = result[result.length - 1]
    if (first?.longitude === last?.longitude && first.latitude === last.latitude) result.pop()
  }
  return result.length >= 3 ? result : null
}

function boundaryLines(id: string, geometry: unknown): Array<{ id: string; coordinates: [number, number][] }> {
  if (!geometry || typeof geometry !== 'object' || !('type' in geometry) || !('coordinates' in geometry)) return []
  const shape = geometry as { type: unknown; coordinates: unknown }
  const polygons = shape.type === 'Polygon'
    ? [shape.coordinates]
    : shape.type === 'MultiPolygon' && Array.isArray(shape.coordinates)
      ? shape.coordinates
      : []
  return polygons.flatMap((polygon, polygonIndex) => {
    if (!Array.isArray(polygon) || !Array.isArray(polygon[0])) return []
    const coordinates = polygon[0].flatMap((position): [number, number][] => {
      if (!Array.isArray(position) || typeof position[0] !== 'number' || typeof position[1] !== 'number') return []
      if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) return []
      return [[position[0], position[1]]]
    })
    return coordinates.length >= 4 ? [{ id: `${id}-${polygonIndex}`, coordinates }] : []
  })
}

function draftBoundaryLine(points: Array<{ longitude: number; latitude: number }>) {
  if (points.length < 2) return null
  const coordinates = points.map(({ longitude, latitude }) => [longitude, latitude] as [number, number])
  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]
  if (points.length >= 3 && first && last) {
    if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first])
  }
  return { id: 'draft-neighborhood-boundary', coordinates }
}

type OsmRecord = {
  id: string
  batchName: string
  osmId: string
  sourceName: string
  normalizedSourceName: string
  streetType: string
  geometry: { type: 'LineString'; coordinates: [number, number][] } | null
  multivusStreetId: string | null
  multivusOfficialName: string | null
  matchType: string
  score: number
  status: string
  conflicts: unknown
  tags: Record<string, string> | null
  createdAt: string
}
