import {
  createNavigationSession,
  createRoutingProvider,
  formatNavigationDistance,
  formatNavigationDuration,
  formatShareText,
  haversineDistance,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { usePlatform } from '../platform/context'
import { linesOf } from '../lib/catalog'
import { hasValidDestinationCoordinates, isNavigableDestination } from '../lib/destination'
import { db } from '../lib/db'
import { useSession } from '../lib/session'
import { flushPending, isUuid } from '../lib/sync'
import { APP_VERSION, clearAppCacheAndReload } from '../lib/pwa-update'
import { useCatalog } from '../hooks/use-catalog'
import { useUi } from '../stores/ui'

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
const routing = createRoutingProvider({
  provider: env?.VITE_ROUTING_PROVIDER || 'osrm',
  osrmBaseUrl: env?.VITE_OSRM_BASE_URL || 'https://router.project-osrm.org',
})

const configuredNavigationZoom = Number.parseFloat(env?.VITE_NAVIGATION_ZOOM ?? '15')
const NAVIGATION_ZOOM = Number.isFinite(configuredNavigationZoom)
  ? Math.min(19, Math.max(15, configuredNavigationZoom))
  : 15
const CAMERA_MINIMUM_SHIFT_METERS = 12
const CAMERA_UPDATE_INTERVAL_MS = 450

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
  const updateAvailable = useUi((state) => state.updateAvailable)
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
  const [following, setFollowing] = useState(false)
  const [gpsUnavailable, setGpsUnavailable] = useState(false)

  const watchUnsubRef = useRef<(() => void) | null>(null)
  const isRecalculatingRef = useRef(false)
  const navSessionRef = useRef<NavigationSession | null>(null)
  const followingRef = useRef(false)
  const onlineRef = useRef(online)
  const cameraPointRef = useRef<{ latitude: number; longitude: number } | null>(null)
  const cameraUpdateAtRef = useRef(0)
  const routeRequestRef = useRef(0)
  onlineRef.current = online

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
  const points = useMemo(() => {
    const list: Array<{ id: string; longitude: number; latitude: number; color?: string }> = []
    if (pin) {
      list.push({ id: 'correction-pin', longitude: pin.longitude, latitude: pin.latitude, color: '#e15b64' })
    }
    if (selected && hasValidDestinationCoordinates(selected)) {
      list.push({ id: 'destination-pin', longitude: selected.longitude, latitude: selected.latitude, color: '#f59e0b' })
    }
    return list
  }, [pin, selected])

  const stopNavigation = useCallback(() => {
    if (watchUnsubRef.current) {
      watchUnsubRef.current()
      watchUnsubRef.current = null
    }
    platform.voice.stop()
    navSessionRef.current = null
    setNavSession(null)
    followingRef.current = false
    setFollowing(false)
    useUi.getState().setNavigating(false)
  }, [platform])

  const calculateAndShowRoute = useCallback(async (
    target: typeof selected,
    requestedNumber: string,
    requestId: number,
  ) => {
    if (!target || !isNavigableDestination(target, requestedNumber)) return

    let userPos = useUi.getState().location
    if (!userPos) {
      try {
        userPos = await platform.location.getCurrentPosition()
        useUi.getState().setLocation(userPos)
      } catch (error) {
        if (requestId !== routeRequestRef.current) return
        setRouteFailed(true)
        setGoMessage(error instanceof Error ? `GPS indisponível: ${error.message}` : 'GPS indisponível para calcular a rota.')
        return
      }
    }

    setGoMessage('Calculando trajeto no mapa...')
    setRouteFailed(false)
    try {
      const routeResult = await routing.calculateRoute(
        { latitude: userPos.latitude, longitude: userPos.longitude },
        { latitude: target.latitude, longitude: target.longitude },
      )

      if (requestId !== routeRequestRef.current) return
      if (routeResult.status === 'ok' && routeResult.geometry && routeResult.geometry.coordinates.length >= 2) {
        setActiveRoute(routeResult)
        mapRef.current?.fitBounds(routeResult.geometry.coordinates)
        setGoMessage(`Trajeto traçado: ${(routeResult.distance / 1000).toFixed(1)} km (~${Math.max(1, Math.round(routeResult.duration / 60))} min).`)
      } else {
        setRouteFailed(true)
        setGoMessage(routeResult.message || 'Não foi possível traçar a rota.')
      }
    } catch (err) {
      if (requestId !== routeRequestRef.current) return
      console.warn('Erro ao traçar rota automática:', err)
      setRouteFailed(true)
      setGoMessage('Não foi possível calcular a rota.')
    }
  }, [platform.location])

  useEffect(() => {
    const requestId = ++routeRequestRef.current
    setGoMessage(null)
    setActiveRoute(null)
    setRouteFailed(false)
    stopNavigation()

    if (!selected) return

    if (hasValidDestinationCoordinates(selected)) {
      mapRef.current?.flyTo(selected.longitude, selected.latitude, 16)
      if (isNavigableDestination(selected, number)) {
        void calculateAndShowRoute(selected, number, requestId)
      } else {
        setGoMessage('Há um ponto no mapa, mas ele não confirma a entrada nem o número predial. A rota precisa de uma coordenada verificada.')
      }
    } else {
      setGoMessage('Este endereço não possui coordenadas de destino. Informe uma correção para ajudar a localizar o ponto.')
    }
  }, [selected, number, calculateAndShowRoute, stopNavigation])

  async function centerOnMe() {
    setBusy(true)
    try {
      const position = await platform.location.getCurrentPosition()
      useUi.getState().setLocation(position)
      if (navSessionRef.current?.isNavigating) {
        followingRef.current = true
        setFollowing(true)
        cameraPointRef.current = position
        mapRef.current?.easeTo(position.longitude, position.latitude, NAVIGATION_ZOOM, 650)
      } else {
        mapRef.current?.easeTo(position.longitude, position.latitude, NAVIGATION_ZOOM, 550)
      }
    } catch (error) {
      useUi.getState().setNotice(error instanceof Error ? error.message : 'Localização indisponível')
    } finally {
      setBusy(false)
    }
  }

  function toggleVoice() {
    setNavSession((prev) => {
      if (!prev) return null
      const nextVoice = !prev.voiceEnabled
      platform.voice.setEnabled(nextVoice)
      const updated = { ...prev, voiceEnabled: nextVoice }
      navSessionRef.current = updated
      return updated
    })
  }

  async function triggerRecalculate(pos: { latitude: number; longitude: number }, destination: NavigationDestination) {
    if (isRecalculatingRef.current) return
    if (!onlineRef.current) {
      const current = navSessionRef.current
      if (current) {
        const updated = { ...current, status: 'recalculating' as const, statusMessage: 'Sem conexão. Mantendo a rota carregada.' }
        navSessionRef.current = updated
        setNavSession(updated)
      }
      return
    }
    isRecalculatingRef.current = true
    try {
      const routeResult = await routing.calculateRoute(
        { latitude: pos.latitude, longitude: pos.longitude },
        { latitude: destination.latitude, longitude: destination.longitude },
      )
      if (routeResult.status === 'ok' && routeResult.geometry && routeResult.geometry.coordinates.length >= 2) {
        setActiveRoute(routeResult)
        platform.voice.speak('Rota recalculada.')
        setNavSession((curr) => {
          if (!curr) return null
          const updated = {
            ...curr,
            activeRoute: routeResult,
            currentStepIndex: 0,
            routeProgressMeters: 0,
            remainingDistance: routeResult.distance,
            remainingDuration: routeResult.duration,
            currentInstruction: routeResult.steps[0]?.instruction || curr.currentInstruction,
            nextInstruction: routeResult.steps[1]?.instruction,
            distanceToNextManeuver: routeResult.steps[0]?.distance || routeResult.distance,
            isOffRoute: false,
            status: 'navigating' as const,
            statusMessage: 'Rota recalculada',
          }
          navSessionRef.current = updated
          return updated
        })
      } else {
        const current = navSessionRef.current
        if (current) {
          const updated = { ...current, status: 'recalculating' as const, statusMessage: routeResult.message || 'Não foi possível recalcular. Mantendo a rota carregada.' }
          navSessionRef.current = updated
          setNavSession(updated)
        }
      }
    } catch (err) {
      console.warn('Falha ao recalcular rota:', err)
      const current = navSessionRef.current
      if (current) {
        const updated = { ...current, status: 'recalculating' as const, statusMessage: 'Falha no recálculo. Mantendo a rota carregada.' }
        navSessionRef.current = updated
        setNavSession(updated)
      }
    } finally {
      isRecalculatingRef.current = false
    }
  }

  function handleGpsProgress(pos: GeoPosition) {
    setGpsUnavailable(false)
    setCurrentGps(pos)
    useUi.getState().setLocation(pos)
    const previous = navSessionRef.current
    if (!previous?.isNavigating) return

    const now = Date.now()
    const lastCameraPoint = cameraPointRef.current
    const cameraDistance = lastCameraPoint
      ? haversineDistance([lastCameraPoint.longitude, lastCameraPoint.latitude], [pos.longitude, pos.latitude])
      : Infinity

    if (followingRef.current && cameraDistance >= CAMERA_MINIMUM_SHIFT_METERS && now - cameraUpdateAtRef.current >= CAMERA_UPDATE_INTERVAL_MS) {
      mapRef.current?.easeTo(pos.longitude, pos.latitude, NAVIGATION_ZOOM, CAMERA_UPDATE_INTERVAL_MS)
      cameraPointRef.current = pos
      cameraUpdateAtRef.current = now
    }

    const result = updateNavigationProgress(previous, [pos.longitude, pos.latitude], {
      positionAccuracyMeters: pos.accuracy,
    })
    navSessionRef.current = result.session
    setNavSession(result.session)
    if (result.announcement) platform.voice.speak(result.announcement)

    if (result.session.isOffRoute && !isRecalculatingRef.current && onlineRef.current) {
      void triggerRecalculate(pos, result.session.destination)
    }
    if (result.session.isArrived) {
      watchUnsubRef.current?.()
      watchUnsubRef.current = null
      useUi.getState().setNotice('Você chegou ao destino!')
    }
  }

  async function startTurnByTurn(
    route: RouteCalculationResult,
    destination: NavigationDestination,
    origin: GeoPosition,
  ) {
    if (route.status !== 'ok' || !route.geometry || route.geometry.coordinates.length < 2) {
      setRouteFailed(true)
      setGoMessage('A rota não possui geometria válida para iniciar a navegação.')
      return
    }
    const session = createNavigationSession(route, destination, { voiceEnabled: true })
    navSessionRef.current = session
    setNavSession(session)
    followingRef.current = true
    setFollowing(true)
    useUi.getState().setNavigating(true)
    setGpsUnavailable(false)
    setGoMessage(null)
    setRouteFailed(false)
    cameraPointRef.current = origin
    cameraUpdateAtRef.current = Date.now()
    mapRef.current?.easeTo(origin.longitude, origin.latitude, NAVIGATION_ZOOM, 700)

    platform.voice.speak(`Iniciando navegação. ${session.currentInstruction}`)

    if (watchUnsubRef.current) {
      watchUnsubRef.current()
      watchUnsubRef.current = null
    }

    try {
      const unsub = await platform.location.watchPosition(
        (position) => handleGpsProgress(position),
        (error) => {
          setGpsUnavailable(true)
          console.warn('Erro ao acompanhar GPS contínuo:', error)
        },
      )
      watchUnsubRef.current = unsub
    } catch (error) {
      setGpsUnavailable(true)
      console.warn('Não foi possível iniciar GPS contínuo:', error)
    }
  }

  async function go() {
    if (!selected) return
    const place = [selected.title, number].filter(Boolean).join(', ')
    if (!isNavigableDestination(selected, number)) {
      setGoMessage('Este destino não possui um ponto confirmado para navegação. Informe uma correção antes de iniciar.')
      return
    }

    setRouteFailed(false)
    setGpsUnavailable(false)
    setGoMessage('Obtendo sua localização GPS...')
    let userPos: GeoPosition
    try {
      userPos = await platform.location.getCurrentPosition()
      useUi.getState().setLocation(userPos)
      setCurrentGps(userPos)
    } catch (error) {
      setGpsUnavailable(true)
      setRouteFailed(true)
      setGoMessage(error instanceof Error ? `GPS indisponível: ${error.message}` : 'GPS indisponível. Permita o acesso à localização e tente novamente.')
      return
    }

    const destination: NavigationDestination = {
      title: place,
      latitude: selected.latitude,
      longitude: selected.longitude,
    }
    setGoMessage('Calculando rota no Multivus Maps...')
    try {
      const routeResult = await routing.calculateRoute(
        { latitude: userPos.latitude, longitude: userPos.longitude },
        { latitude: selected.latitude, longitude: selected.longitude },
      )
      if (routeResult.status === 'ok' && routeResult.geometry && routeResult.geometry.coordinates.length >= 2) {
        setActiveRoute(routeResult)
        mapRef.current?.fitBounds(routeResult.geometry.coordinates, { padding: 80, maxZoom: NAVIGATION_ZOOM, duration: 550 })
        await startTurnByTurn(routeResult, destination, userPos)
        return
      }

      setRouteFailed(true)
      setGoMessage(routeResult.message || 'Não foi possível calcular uma rota válida no Multivus Maps.')
    } catch (error) {
      console.warn('Erro ao calcular rota OSRM:', error)
      setRouteFailed(true)
      setGoMessage('Não foi possível calcular a rota no Multivus Maps.')
    }
  }

  async function openExternal(app?: 'google' | 'waze' | 'apple') {
    if (!selected) return
    const place = [selected.title, number].filter(Boolean).join(', ')
    if (!isNavigableDestination(selected, number)) {
      useUi.getState().setNotice('Sem um ponto de destino confirmado; o endereço foi mantido no Multivus Maps para correção.')
      return
    }
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
      entityId: selected.id,
      entityKind: selected.kind,
      number,
      destination: selected,
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
        radiusArea={
          selected && hasValidDestinationCoordinates(selected) && selected.probableRadiusMeters
            ? {
                longitude: selected.longitude,
                latitude: selected.latitude,
                radiusMeters: selected.probableRadiusMeters,
                label: selected.spatialRelationLabel ?? undefined,
              }
            : null
        }
        onClick={correctionOpen ? (point) => setPin(point) : undefined}
        onUserMove={() => {
          if (!navSessionRef.current?.isNavigating) return
          followingRef.current = false
          setFollowing(false)
        }}
      />

      {navSession ? (
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
          gpsUnavailable={gpsUnavailable}
          isRecalculating={navSession.status === 'recalculating' || navSession.isOffRoute}
          isArrived={navSession.isArrived}
          statusMessage={navSession.statusMessage}
          following={following}
          voiceEnabled={navSession.voiceEnabled}
          onToggleVoice={toggleVoice}
          onResumeFollowing={() => {
            const position = currentGps ?? location
            if (!position) return
            followingRef.current = true
            setFollowing(true)
            cameraPointRef.current = position
            mapRef.current?.easeTo(position.longitude, position.latitude, NAVIGATION_ZOOM, 650)
          }}
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
            <div className="pointer-events-auto flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SearchBar onFocus={() => navigate('/busca')} />
              </div>
              <button
                type="button"
                onClick={() => void clearAppCacheAndReload()}
                title={`Multivus Maps v${APP_VERSION} - Atualizar e limpar cache`}
                className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#12181f]/90 text-amber-400 shadow-lg shadow-black/30 border border-white/10 active:scale-95 hover:bg-[#1a232d] transition backdrop-blur"
                aria-label="Atualizar aplicativo e limpar cache do celular"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 21h5v-5" />
                </svg>
                {updateAvailable ? (
                  <span className="absolute top-1 right-1 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500" />
                  </span>
                ) : null}
              </button>
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
              hasGeometry={isNavigableDestination(selected, number)}
              hasCoordinates={hasValidDestinationCoordinates(selected)}
              coordinatesVerified={selected.coordinatesVerified ?? false}
              coordinateType={selected.coordinateType ?? null}
              coordinateSource={selected.coordinateSource ?? null}
              coordinateSourceDate={selected.coordinateSourceDate ?? null}
              numberVerified={selected.numberVerified ?? false}
              resolvedNumber={selected.resolvedNumber ?? null}
              streetNumber={number}
              probableRadiusMeters={selected.probableRadiusMeters}
              spatialRelationLabel={selected.spatialRelationLabel}
              landmarkName={selected.landmarkName}
              importanceScore={selected.importanceScore}
              category={selected.category}
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
