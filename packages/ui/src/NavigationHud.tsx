import { useState } from 'react'

export type NavigationHudProps = {
  instruction: string
  nextInstruction?: string
  distanceToManeuver: string
  remainingDistance: string
  remainingDuration: string
  destinationTitle: string
  maneuverType?: string
  maneuverModifier?: string
  speedKmh?: number | null
  offline?: boolean
  gpsUnavailable?: boolean
  isRecalculating?: boolean
  isArrived?: boolean
  statusMessage?: string | null
  following?: boolean
  voiceEnabled: boolean
  onToggleVoice: () => void
  onRecalculate?: () => void
  onResumeFollowing?: () => void
  onEndNavigation: () => void
}

export function NavigationHud({
  instruction,
  nextInstruction,
  distanceToManeuver,
  remainingDistance,
  remainingDuration,
  destinationTitle,
  maneuverType,
  maneuverModifier,
  speedKmh,
  offline = false,
  gpsUnavailable = false,
  isRecalculating = false,
  isArrived = false,
  statusMessage,
  following = true,
  voiceEnabled,
  onToggleVoice,
  onRecalculate,
  onResumeFollowing,
  onEndNavigation,
}: NavigationHudProps) {
  const maneuverIcon = getManeuverIcon(maneuverType, maneuverModifier)
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex flex-col justify-between px-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))] sm:px-3">
      <section className="pointer-events-auto mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/95 text-white shadow-lg">
        {isRecalculating || gpsUnavailable || offline ? (
          <div className={`flex min-h-7 items-center justify-between gap-2 px-3 py-1 text-[11px] font-semibold ${
            gpsUnavailable || isRecalculating ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-100'
          }`}>
            <span className="min-w-0 truncate">
              {gpsUnavailable ? 'GPS indisponível — confira a localização' :
                isRecalculating ? (statusMessage || 'Recalculando rota…') :
                  offline ? 'Sem internet — usando a rota carregada' : statusMessage}
            </span>
            {isRecalculating && onRecalculate ? (
              <button type="button" onClick={onRecalculate} className="shrink-0 underline">Tentar</button>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-500 text-2xl" aria-hidden="true">
            {maneuverIcon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-black leading-none tracking-tight">{distanceToManeuver}</p>
            <h2 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug sm:text-base">{instruction}</h2>
          </div>
        </div>
        {nextInstruction && !isArrived ? (
          <p className="truncate border-t border-slate-700 px-3 py-1.5 text-xs text-slate-300">
            A seguir: {nextInstruction}
          </p>
        ) : null}
      </section>

      <section className="pointer-events-auto mx-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-3 text-slate-900 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{destinationTitle}</p>
            <p className="text-xs text-slate-600">
              {remainingDistance} · ~{remainingDuration}
              {speedKmh !== null && speedKmh !== undefined ? ` · ${Math.round(speedKmh)} km/h` : ''}
            </p>
          </div>
          {!following && onResumeFollowing ? (
            <button type="button" onClick={onResumeFollowing} className="h-9 shrink-0 rounded-lg bg-sky-100 px-2 text-xs font-semibold text-sky-900">
              Seguir
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleVoice}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-300"
            aria-label={voiceEnabled ? 'Desativar avisos de voz' : 'Ativar avisos de voz'}
            title={voiceEnabled ? 'Desativar avisos de voz' : 'Ativar avisos de voz'}
          >
            {voiceEnabled ? '🔊' : '🔇'}
          </button>
          <button type="button" onClick={() => setCollapsed((value) => !value)} className="h-9 rounded-lg px-2 text-xs font-semibold text-slate-700">
            {collapsed ? 'Mais' : 'Recolher'}
          </button>
          <button type="button" onClick={onEndNavigation} className="h-9 shrink-0 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white">
            Encerrar
          </button>
        </div>
        {!collapsed && (
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-500">Distância restante</p>
              <p className="text-base font-extrabold">{remainingDistance}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-500">Tempo estimado</p>
              <p className="text-base font-extrabold text-teal-700">~{remainingDuration}</p>
            </div>
          </div>
        )}
        {isArrived ? <p className="mt-2 rounded-lg bg-emerald-100 px-2 py-1.5 text-sm font-bold text-emerald-900">Você chegou ao destino.</p> : null}
      </section>
    </div>
  )
}

function getManeuverIcon(type?: string, modifier?: string): string {
  switch (type) {
    case 'arrive':
      return '🏁'
    case 'depart':
      return '⬆️'
    case 'turn': {
      if (modifier === 'right') return '↗️'
      if (modifier === 'left') return '↖️'
      if (modifier === 'slight right') return '↗️'
      if (modifier === 'slight left') return '↖️'
      if (modifier === 'sharp right') return '➡️'
      if (modifier === 'sharp left') return '⬅️'
      if (modifier === 'uturn') return '↩️'
      return '⬆️'
    }
    case 'roundabout':
      return '🔄'
    case 'fork':
      return modifier === 'left' ? '↖️' : '↗️'
    default:
      return '⬆️'
  }
}
