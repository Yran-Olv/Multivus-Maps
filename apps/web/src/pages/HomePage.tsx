import {
  createNavigationSession,
  createRoutingProvider,
  formatNavigationDistance,
  formatNavigationDuration,
  formatShareText,
  updateNavigationProgress,
  type NavigationDestination,
  type NavigationSession,
  type RouteCalculationResult,
} from '@multivus/map-core'
import { enqueueOperation } from '@multivus/offline'
import type { GeoPosition } from '@multivus/services'
import type { CorrectionType } from '@multivus/shared'
import {
  AddressBottomSheet,
  CurrentLocationButton,
  Map,
  MapCorrectionModal,
  NavigationHud,
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
  const [routeFailed, setRouteFailed] = useState(false)
  const [navSession, setNavSession] = useState<NavigationSession | null>(null)
  const [currentGps, setCurrentGps] = useState<GeoPosition | null>(null)

  const watchUnsubRef = useRef<(() => void) | null>(null)
  const isRecalculatingRef = useRef(false)

  useEffect(() => {
    setGoMessage(null)
    setActiveRoute(null)
    setRouteFailed(false)
    stopNavigation()
  }, [selected?.id])

  useEffect(() => {
    return () => {
      watchUnsubRef.current?.()
      platform.voice.stop()
    }
  }, [platform.voice])

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

  function stopNavigation() {
    if (watchUnsubRef.current) {
      watchUnsubRef.current()
      watchUnsubRef.current = null
    }
    platform.voice.stop()
    setNavSession(null)
  }

  function toggleVoice() {
    setNavSession((prev) => {
      if (!prev) return null
      const nextVoice = !prev.voiceEnabled
      platform.voice.setEnabled(nextVoice)
      return { ...prev, voiceEnabled: nextVoice }
    })
  }

  async function triggerRecalculate(pos: { latitude: number; longitude: number }, destination: NavigationDestination) {
    if (isRecalculatingRef.current || !online) return
    isRecalculatingRef.current = true
    try {
      const routeResult = await routing.calculateRoute(
        { latitude: pos.latitude, longitude: pos.longitude },
        { latitude: destination.latitude, longitude: destination.longitude },
      )
      if (routeResult.status === 'ok' && routeResult.geometry) {
        setActiveRoute(routeResult)
        platform.voice.speak('Rota recalculada.')
        setNavSession((curr) => {
          if (!curr) return null
          return {
            ...curr,
            activeRoute: routeResult,
            currentStepIndex: 0,
            remainingDistance: routeResult.distance,
            remainingDuration: routeResult.duration,
            currentInstruction: routeResult.steps[0]?.instruction || curr.currentInstruction,
            nextInstruction: routeResult.steps[1]?.instruction,
            distanceToNextManeuver: routeResult.steps[0]?.distance || routeResult.distance,
            isOffRoute: false,
            status: 'navigating',
            statusMessage: 'Rota recalculada',
          }
        })
      }
    } catch (err) {
      console.warn('Falha ao recalcular rota:', err)
    } finally {
      isRecalculatingRef.current = false
    }
  }

  function handleGpsProgress(pos: GeoPosition) {
    setCurrentGps(pos)
    useUi.getState().setLocation(pos)
    setNavSession((prev) => {
      if (!prev || !prev.isNavigating) return prev

      // Suavemente centraliza e acompanha o usuário durante a rota
      mapRef.current?.flyTo(pos.longitude, pos.latitude, 17)

      const result = updateNavigationProgress(prev, [pos.longitude, pos.latitude])

      if (result.announcement) {
        platform.voice.speak(result.announcement)
      }

      // Se saiu da rota (> 40m), dispara recálculo automático
      if (result.session.isOffRoute && !isRecalculatingRef.current && online) {
        void triggerRecalculate(pos, result.session.destination)
      }

      // Se chegou ao destino (< 30m)
      if (result.session.isArrived) {
        stopNavigation()
        useUi.getState().setNotice('Você chegou ao destino!')
      }

      return result.session
    })
  }

  async function startTurnByTurn(route: RouteCalculationResult, destination: NavigationDestination) {
    const session = createNavigationSession(route, destination, { voiceEnabled: true })
    setNavSession(session)
    setGoMessage(null)
    setRouteFailed(false)

    if (session.currentInstruction) {
      platform.voice.speak(`Iniciando navegação. ${session.currentInstruction}`)
    }

    if (watchUnsubRef.current) {
      watchUnsubRef.current()
      watchUnsubRef.current = null
    }

    try {
      const unsub = await platform.location.watchPosition(
        (pos) => {
          useUi.getState().setLocation(pos)
          handleGpsProgress(pos)
        },
        (err) => {
          console.warn('Erro ao acompanhar GPS contínuo:', err)
        },
      )
      watchUnsubRef.current = unsub
    } catch (err) {
      console.warn('Não foi possível iniciar GPS contínuo:', err)
    }
  }

  async function go() {
    if (!selected) return
    const place = [selected.title, number].filter(Boolean).join(', ')

    if (!selected.verified || selected.latitude === null || selected.longitude === null) {
      setRouteFailed(true)
      setGoMessage('Esta via ainda não possui geometria verificada no Multivus Maps.')
      return
    }

    setRouteFailed(false)
    setGoMessage('Obtendo sua localização...')

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

    const destination: NavigationDestination = {
      title: place,
      latitude: selected.latitude,
      longitude: selected.longitude,
    }

    // Se a rota já foi calculada e o usuário clicou para iniciar:
    if (activeRoute && activeRoute.status === 'ok') {
      await startTurnByTurn(activeRoute, destination)
      return
    }

    setGoMessage('Calculando rota no Multivus Maps...')
    try {
      const routeResult = await routing.calculateRoute(
        { latitude: userPos.latitude, longitude: userPos.longitude },
        { latitude: selected.latitude, longitude: selected.longitude },
      )

      if (routeResult.status === 'ok' && routeResult.geometry) {
        setActiveRoute(routeResult)
        mapRef.current?.fitBounds(routeResult.geometry.coordinates)
        setGoMessage(
          `Rota calculada: ${(routeResult.distance / 1000).toFixed(1)} km (~${Math.max(1, Math.round(routeResult.duration / 60))} min).`,
        )
        // Inicia automaticamente o modo de navegação guiada no Multivus Maps
        await startTurnByTurn(routeResult, destination)
        return
      }

      setRouteFailed(true)
      setGoMessage(routeResult.message || 'Não foi possível calcular a rota no Multivus Maps.')
    } catch (error) {
      console.warn('Erro ao calcular rota OSRM:', error)
      setRouteFailed(true)
      setGoMessage('Não foi possível calcular a rota no Multivus Maps.')
    }
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

      {/* 1. MODO NAVEGAÇÃO ATIVA: NavigationHud Guiado em Tempo Real */}
      {navSession && navSession.isNavigating ? (
        <NavigationHud
          instruction={navSession.currentInstruction}
          nextInstruction={navSession.nextInstruction}
          distanceToManeuver={formatNavigationDistance(navSession.distanceToNextManeuver)}
          remainingDistance={formatNavigationDistance(navSession.remainingDistance)}
          remainingDuration={formatNavigationDuration(navSession.remainingDuration)}
          destinationTitle={navSession.destination.title}
          maneuverType={navSession.activeRoute.steps?.[navSession.currentStepIndex]?.maneuverType}
          maneuverModifier={navSession.activeRoute.steps?.[navSession.currentStepIndex]?.maneuverModifier}
          speedKmh={currentGps?.speed !== null && currentGps?.speed !== undefined ? currentGps.speed * 3.6 : null}
          offline={!online}
          isRecalculating={navSession.status === 'recalculating' || navSession.isOffRoute}
          isArrived={navSession.isArrived}
          voiceEnabled={navSession.voiceEnabled}
          onToggleVoice={toggleVoice}
          onRecalculate={() => {
            const pt = currentGps || location
            if (pt && navSession) {
              void triggerRecalculate(pt, navSession.destination)
            }
          }}
          onEndNavigation={stopNavigation}
        />
      ) : (
        /* 2. MODO PADRÃO: Barra de busca e painel de endereço */
        <>
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
                setRouteFailed(false)
                stopNavigation()
              }}
              onGo={() => void go()}
              onOpenExternal={(app) => void openExternal(app)}
              onSave={() => void save()}
              onShare={() => void share()}
              onAddReference={() => navigate(`/entregas?referencia=${encodeURIComponent(selected.title)}`)}
              onAddPhoto={() => navigate(`/entregas?foto=1&referencia=${encodeURIComponent(selected.title)}`)}
              onReport={openCorrection}
              goMessage={goMessage}
              routeFailed={routeFailed}
              activeRouteSummary={
                activeRoute?.status === 'ok'
                  ? {
                      distanceKm: activeRoute.distance / 1000,
                      durationMin: Math.max(1, Math.round(activeRoute.duration / 60)),
                      nextInstruction: activeRoute.steps[0]?.instruction,
                    }
                  : null
              }
              onClearRoute={() => {
                setActiveRoute(null)
                setRouteFailed(false)
                setGoMessage(null)
                stopNavigation()
              }}
            />
          ) : null}
        </>
      )}
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
