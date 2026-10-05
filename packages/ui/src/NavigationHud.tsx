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
  isRecalculating?: boolean
  isArrived?: boolean
  voiceEnabled: boolean
  onToggleVoice: () => void
  onRecalculate?: () => void
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
  isRecalculating = false,
  isArrived = false,
  voiceEnabled,
  onToggleVoice,
  onRecalculate,
  onEndNavigation,
}: NavigationHudProps) {
  const maneuverIcon = getManeuverIcon(maneuverType, maneuverModifier)

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex flex-col justify-between p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))]">
      {/* 1. HUD Superior: Instrução Imediata da Manobra */}
      <div className="pointer-events-auto mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-3xl bg-slate-900/95 text-white shadow-2xl backdrop-blur-md border border-slate-800">
          {/* Alerta de Status / Offline / Recálculo */}
          {isRecalculating ? (
            <div className="flex items-center justify-between bg-amber-500/90 px-4 py-2 text-xs font-semibold text-slate-950">
              <span className="flex items-center gap-1.5 animate-pulse">
                <span>⚠️</span> Fora da rota planejada • Recalculando...
              </span>
              {onRecalculate ? (
                <button
                  type="button"
                  onClick={onRecalculate}
                  className="rounded-md bg-slate-950/20 px-2 py-0.5 text-[11px] font-bold underline"
                >
                  Recalcular agora
                </button>
              ) : null}
            </div>
          ) : offline ? (
            <div className="bg-sky-600/90 px-4 py-1.5 text-center text-xs font-medium text-white">
              Sem internet. Navegação continua com a rota carregada.
            </div>
          ) : null}

          {/* Instrução Principal */}
          <div className="flex items-center gap-4 p-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-teal-500 text-white shadow-lg">
              <span className="text-3xl">{maneuverIcon}</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tight text-white">{distanceToManeuver}</span>
              </div>
              <h2 className="mt-0.5 text-base font-semibold leading-snug text-slate-100 line-clamp-2">
                {instruction}
              </h2>
            </div>
          </div>

          {/* Próxima Instrução (Preview secundário) */}
          {nextInstruction && !isArrived ? (
            <div className="border-t border-slate-800/80 bg-slate-950/40 px-4 py-2.5 text-xs text-slate-400 flex items-center gap-2">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">A seguir:</span>
              <span className="truncate text-slate-300 font-medium">{nextInstruction}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* 2. HUD Inferior: Painel de Controle e Resumo */}
      <div className="pointer-events-auto mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-3xl bg-white/95 p-4 text-slate-900 shadow-2xl backdrop-blur-md border border-slate-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Destino</p>
              <h3 className="truncate text-sm font-bold text-slate-900">{destinationTitle}</h3>
            </div>

            {/* Controle de Voz e Velocidade */}
            <div className="flex items-center gap-2">
              {speedKmh !== null && speedKmh !== undefined ? (
                <div className="rounded-xl bg-slate-100 px-2.5 py-1 text-center">
                  <span className="text-xs font-bold text-slate-800">{Math.round(speedKmh)}</span>
                  <span className="text-[10px] text-slate-500 block leading-tight">km/h</span>
                </div>
              ) : null}

              <button
                type="button"
                onClick={onToggleVoice}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                  voiceEnabled
                    ? 'border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100'
                    : 'border-slate-300 bg-slate-100 text-slate-400 hover:bg-slate-200'
                }`}
                title={voiceEnabled ? 'Desativar avisos de voz' : 'Ativar avisos de voz'}
              >
                <span className="text-lg">{voiceEnabled ? '🔊' : '🔇'}</span>
              </button>
            </div>
          </div>

          {/* Estimativas Restantes */}
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 border border-slate-100">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Distância Restante</p>
              <p className="mt-0.5 text-xl font-black text-slate-900">{remainingDistance}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tempo Estimado</p>
              <p className="mt-0.5 text-xl font-black text-teal-700">~{remainingDuration}</p>
            </div>
          </div>

          {/* Botão Encerrar */}
          <div className="mt-3">
            <button
              type="button"
              onClick={onEndNavigation}
              className="h-12 w-full rounded-2xl bg-rose-600 text-sm font-bold text-white shadow hover:bg-rose-700 active:scale-[0.99] transition"
            >
              ENCERRAR NAVEGAÇÃO
            </button>
          </div>
        </div>
      </div>
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
