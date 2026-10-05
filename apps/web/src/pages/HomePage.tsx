import { createRoutingProvider, formatShareText, type RouteCalculationResult } from '@multivus/map-core'
import { enqueueOperation } from '@multivus/offline'
import type { CorrectionType } from '@multivus/shared'
import {
  AddressBottomSheet,
  CurrentLocationButton,
  Map,
  MapCorrectionModal,
  SearchBar,
  type MapHandle,
} from '@multivus/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { usePlatform } from '../platform/context'
import { linesOf } from '../lib/catalog'
import { db } from '../lib/db'
import { useSession } from '../lib/session'
import { flushPending, isUuid } from '../lib/sync'
import { useCatalog } from '../hooks/use-catalog'
import { useUi } from '../stores/ui'

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
const routing = createRoutingProvider({
  provider: env?.VITE_ROUTING_PROVIDER || 'osrm',
  osrmBaseUrl: env?.VITE_OSRM_BASE_URL || 'https://router.project-osrm.org',
})

export function HomePage() {
  const navigate = useNavigate()
  const platform = usePlatform()
  const catalog = useCatalog()
  const mapRef = useRef<MapHandle>(null)
  const selected = useUi((state) => state.selected)
  const number = useUi((state) => state.number)
  const notice = useUi((state) => state.notice)
  const location = useUi((state) => state.location)
  const online = useUi((state) => state.online)
  const correctionOpen = useUi((state) => state.correctionOpen)
  const [busy, setBusy] = useState(false)
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null)
  const [correctionType, setCorrectionType] = useState<CorrectionType>('WRONG_STREET_NAME')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [goMessage, setGoMessage] = useState<string | null>(null)
  const [activeRoute, setActiveRoute] = useState<RouteCalculationResult | null>(null)

  useEffect(() => {
    setGoMessage(null)
    setActiveRoute(null)
  }, [selected?.id])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => useUi.getState().setNotice(null), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const lines = useMemo(
    () =>
      (catalog.data?.streets ?? [])
        .flatMap((street) => linesOf(street.id, street.geometry)),
    [catalog.data?.streets],
  )
  const points = pin
    ? [{ id: 'correction-pin', longitude: pin.longitude, latitude: pin.latitude, color: '#e15b64' }]
    : []

  async function centerOnMe() {
    setBusy(true)
    try {
      const position = await platform.location.getCurrentPosition()
      useUi.getState().setLocation(position)
      mapRef.current?.flyTo(position.longitude, position.latitude)
    } catch (error) {
      useUi.getState().setNotice(error instanceof Error ? error.message : 'Localização indisponível')
    } finally {
      setBusy(false)
    }
  }

  async function go() {
    if (!selected) return
    const place = [selected.title, number].filter(Boolean).join(', ')

    if (!selected.verified || selected.latitude === null || selected.longitude === null) {
      setGoMessage('Esta via ainda não possui geometria verificada no Multivus Maps. Escolha um mapa externo abaixo.')
      return
    }

    let userPos = location
    if (!userPos) {
      try {
        userPos = await platform.location.getCurrentPosition()
        useUi.getState().setLocation(userPos)
      } catch {
        // Fallback para o centro urbano de Santa Juliana se GPS não estiver disponível
        userPos = { latitude: -19.30889, longitude: -47.52417 }
      }
    }

    setGoMessage('Calculando rota OSRM...')
    try {
      const routeResult = await routing.calculateRoute(
        { latitude: userPos.latitude, longitude: userPos.longitude },
        { latitude: selected.latitude, longitude: selected.longitude },
      )

      if (routeResult.status === 'ok' && routeResult.geometry) {
        setActiveRoute(routeResult)
        mapRef.current?.fitBounds(routeResult.geometry.coordinates)
        setGoMessage(`Rota calculada: ${(routeResult.distance / 1000).toFixed(1)} km (~${Math.max(1, Math.round(routeResult.duration / 60))} min)`)
        return
      }
    } catch (error) {
      console.warn('Erro ao calcular rota OSRM:', error)
    }

    // Se falhar o cálculo OSRM, abre navegação nativa externa
    const result = await platform.navigation.startNavigation({
      label: place,
      latitude: selected.latitude,
      longitude: selected.longitude,
    })
    if (result.status === 'centered') {
      mapRef.current?.flyTo(result.longitude, result.latitude)
      setGoMessage('Ponto centralizado. A rota também abriu no mapa do celular.')
      return
    }
    setGoMessage('Rota externa iniciada no aplicativo do dispositivo.')
  }

  async function openExternal(app?: 'google' | 'waze' | 'apple') {
    if (!selected) return
    const place = [selected.title, number].filter(Boolean).join(', ')
    await platform.navigation.openExternalMap(app || 'google', {
      label: place,
      latitude: selected.latitude,
      longitude: selected.longitude,
    })
  }

  async function save() {
    if (!selected) return
    const clientRequestId = crypto.randomUUID()
    await db.favorites.put({
      id: clientRequestId,
      label: number ? `${selected.title}, ${number}` : selected.title,
      streetId: selected.kind === 'street' ? selected.id : null,
      placeId: selected.kind === 'place' ? selected.id : null,
      customerInput: selected.customerInput,
      matchedAlias: selected.matchedAlias,
      createdAt: new Date().toISOString(),
      pending: true,
    })
    if (useSession.getState().accessToken && isUuid(selected.id)) {
      await enqueueOperation(
        db,
        'favorite',
        {
          label: number ? `${selected.title}, ${number}` : selected.title,
          streetId: selected.kind === 'street' ? selected.id : null,
          placeId: selected.kind === 'place' ? selected.id : null,
          deliveryLocationId: null,
          customerInput: selected.customerInput,
          matchedAlias: selected.matchedAlias,
          clientRequestId,
        },
        clientRequestId,
      )
      if (online) await flushPending().catch(() => undefined)
    }
    useUi.getState().setPending(await db.syncQueue.count())
    useUi.getState().setNotice('Endereço salvo neste aparelho.')
  }

  async function share() {
    if (!selected) return
    const text = formatShareText({
      officialName: selected.title,
      number,
      oldNames: selected.oldNames,
      neighborhoodName: selected.neighborhoodName,
    })
    const result = await platform.share.share({ title: selected.title, text })
    if (result === 'copied') useUi.getState().setNotice('Endereço copiado.')
  }

  function openCorrection() {
    const center = mapRef.current?.getCenter()
    setPin(
      location ??
        (center ? { latitude: center.latitude, longitude: center.longitude } : null),
    )
    useUi.getState().setCorrectionOpen(true)
  }

  async function submitCorrection() {
    if (!pin || description.trim().length < 3) {
      useUi.getState().setNotice('Descreva o problema e mantenha o marcador no ponto.')
      return
    }
    setSubmitting(true)
    const clientRequestId = crypto.randomUUID()
    try {
      await enqueueOperation(
        db,
        'map-correction',
        {
          correctionType,
          description: description.trim(),
          latitude: pin.latitude,
          longitude: pin.longitude,
          entityType: selected?.kind ?? null,
          entityId: selected && isUuid(selected.id) ? selected.id : null,
          clientRequestId,
        },
        clientRequestId,
      )
      if (online && useSession.getState().accessToken) {
        await flushPending()
        useUi.getState().setNotice('Correção enviada para revisão. Ela ainda não altera o mapa.')
      } else {
        useUi.getState().setNotice('Correção guardada neste aparelho. Entre na conta para enviar.')
      }
      useUi.getState().setCorrectionOpen(false)
      setDescription('')
    } catch (error) {
      useUi.getState().setNotice(error instanceof Error ? error.message : 'Não foi possível guardar a correção')
    } finally {
      useUi.getState().setPending(await db.syncQueue.count())
      setSubmitting(false)
    }
  }

  return (
    <div className="relative h-full">
      <Map
        handle={mapRef}
        className="h-full w-full"
        lines={lines}
        routeLine={activeRoute?.geometry}
        points={points}
        userLocation={location}
        onClick={correctionOpen ? (point) => setPin(point) : undefined}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3">
        <div className="pointer-events-auto">
          <SearchBar onFocus={() => navigate('/busca')} />
        </div>
        {notice ? (
          <p className="pointer-events-none mt-2 rounded-2xl bg-white/95 px-4 py-3 text-sm text-slate-800 shadow">{notice}</p>
        ) : null}
      </div>
      <div className="absolute right-4 bottom-4 z-20">
        <CurrentLocationButton onClick={() => void centerOnMe()} busy={busy} />
      </div>
      {selected && !correctionOpen ? (
        <AddressBottomSheet
          title={selected.title}
          neighborhood={selected.neighborhoodName}
          oldNames={selected.oldNames}
          warning={selected.warning}
          customerInput={selected.usedOldName ? selected.customerInput : null}
          reference={selected.reference}
          confidence={selected.confidence}
          source={selected.source}
          sourceDate={selected.sourceDate}
          verified={selected.verified}
          hasGeometry={Boolean(selected.verified && selected.latitude !== null && selected.longitude !== null)}
          streetNumber={number}
          onStreetNumber={(value) => useUi.getState().setNumber(value)}
          onClose={() => {
            useUi.getState().setSelected(null)
            setActiveRoute(null)
          }}
          onGo={() => void go()}
          onOpenExternal={(app) => void openExternal(app)}
          onSave={() => void save()}
          onShare={() => void share()}
          onAddReference={() => navigate(`/entregas?referencia=${encodeURIComponent(selected.title)}`)}
          onAddPhoto={() => navigate(`/entregas?foto=1&referencia=${encodeURIComponent(selected.title)}`)}
          onReport={openCorrection}
          goMessage={goMessage}
          activeRouteSummary={
            activeRoute?.status === 'ok'
              ? {
                  distanceKm: activeRoute.distance / 1000,
                  durationMin: Math.max(1, Math.round(activeRoute.duration / 60)),
                  nextInstruction: activeRoute.steps[0]?.instruction,
                }
              : null
          }
          onClearRoute={() => setActiveRoute(null)}
        />
      ) : null}
      <MapCorrectionModal
        open={correctionOpen}
        description={description}
        correctionType={correctionType}
        coordinateLabel={
          pin ? `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}` : 'Toque no mapa para marcar'
        }
        submitting={submitting}
        onClose={() => useUi.getState().setCorrectionOpen(false)}
        onChangeType={setCorrectionType}
        onChangeDescription={setDescription}
        onUseMyLocation={() => void centerOnMe().then(() => {
          const current = useUi.getState().location
          if (current) setPin(current)
        })}
        onSubmit={() => void submitCorrection()}
      />
    </div>
  )
}
