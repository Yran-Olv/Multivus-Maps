import { StreetDetails } from './StreetDetails'

type AddressBottomSheetProps = {
  title: string
  neighborhood?: string | null
  oldNames?: string[]
  warning?: string | null
  customerInput?: string | null
  reference?: string | null
  confidence?: number
  source?: string | null
  sourceDate?: string | null
  verified?: boolean
  hasGeometry?: boolean
  streetNumber: string
  onStreetNumber: (value: string) => void
  onClose: () => void
  onGo: () => void
  onOpenExternal?: (app?: 'google' | 'waze' | 'apple') => void
  onSave: () => void
  onShare: () => void
  onAddReference: () => void
  onAddPhoto: () => void
  onReport: () => void
  goMessage?: string | null
  activeRouteSummary?: { distanceKm: number; durationMin: number; nextInstruction?: string } | null
  onClearRoute?: () => void
  routeFailed?: boolean
}

export function AddressBottomSheet(props: AddressBottomSheetProps) {
  const hasGeom = props.hasGeometry ?? props.verified ?? false

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 max-h-[78dvh] overflow-y-auto rounded-t-3xl bg-white px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-3 text-slate-900 shadow-2xl">
      <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
      <button type="button" className="absolute right-4 top-3 text-sm text-slate-500 hover:text-slate-800" onClick={props.onClose}>
        Fechar
      </button>
      <StreetDetails
        title={props.title}
        streetNumber={props.streetNumber}
        neighborhood={props.neighborhood}
        oldNames={props.oldNames}
        warning={props.warning}
        customerInput={props.customerInput}
        reference={props.reference}
        confidence={props.confidence}
        source={props.source}
        sourceDate={props.sourceDate}
        verified={props.verified}
      />
      <label className="mt-4 block text-sm text-slate-600">
        Número
        <input
          value={props.streetNumber}
          onChange={(event) => props.onStreetNumber(event.target.value)}
          inputMode="numeric"
          className="mt-1 h-12 w-full rounded-xl border border-slate-200 px-3 text-base"
          placeholder="Ex.: 125"
        />
      </label>

      {/* Rota Ativa Calculada */}
      {props.activeRouteSummary ? (
        <div className="mt-4 rounded-2xl bg-sky-50 border border-sky-200 p-4 text-sky-950">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-700">Rota OSRM Traçada</span>
            {props.onClearRoute ? (
              <button type="button" onClick={props.onClearRoute} className="text-xs text-sky-600 hover:underline">
                Limpar rota
              </button>
            ) : null}
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-2xl font-bold text-sky-900">{props.activeRouteSummary.distanceKm.toFixed(1)} km</span>
            <span className="text-sm font-medium text-sky-700">~{props.activeRouteSummary.durationMin} min</span>
          </div>
          {props.activeRouteSummary.nextInstruction ? (
            <p className="mt-2 text-sm font-medium text-sky-900">
              🧭 {props.activeRouteSummary.nextInstruction}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Se falhar o cálculo da rota: Opção manual clara sem redirecionamento automático */}
      {props.routeFailed ? (
        <div className="mt-4 rounded-2xl bg-rose-50 border border-rose-200 p-4 text-rose-950">
          <p className="text-sm font-bold flex items-center gap-1.5 text-rose-900">
            <span>⚠️</span> Não foi possível calcular a rota no Multivus Maps.
          </p>
          <p className="mt-1 text-xs text-rose-800">
            Você pode tentar calcular novamente ou abrir manualmente no seu aplicativo preferido:
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={props.onGo}
              className="h-11 w-full rounded-xl bg-rose-600 text-xs font-bold text-white shadow hover:bg-rose-700 active:scale-[0.99] transition"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => props.onOpenExternal?.('google')}
              className="h-10 rounded-xl bg-white border border-rose-300 text-xs font-semibold text-slate-800 shadow-sm hover:bg-rose-100/50"
            >
              Google Maps
            </button>
            <button
              type="button"
              onClick={() => props.onOpenExternal?.('waze')}
              className="h-10 rounded-xl bg-white border border-rose-300 text-xs font-semibold text-slate-800 shadow-sm hover:bg-rose-100/50"
            >
              Waze
            </button>
            <button
              type="button"
              onClick={() => props.onOpenExternal?.('apple')}
              className="h-10 rounded-xl bg-white border border-rose-300 text-xs font-semibold text-slate-800 shadow-sm hover:bg-rose-100/50"
            >
              Apple Maps
            </button>
          </div>
        </div>
      ) : hasGeom ? (
        /* Se tem geometria: Botão IR principal */
        <div className="mt-4">
          <button
            type="button"
            onClick={props.onGo}
            className="h-12 w-full rounded-xl bg-[#f0b429] text-sm font-bold text-slate-900 shadow hover:brightness-105 active:scale-[0.99] transition"
          >
            {props.activeRouteSummary ? 'INICIAR NAVEGAÇÃO' : 'IR PARA O LOCAL'}
          </button>
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
            <span>Ou abrir direto no:</span>
            <button type="button" onClick={() => props.onOpenExternal?.('google')} className="font-medium text-teal-800 underline">
              Google Maps
            </button>
            <span>•</span>
            <button type="button" onClick={() => props.onOpenExternal?.('waze')} className="font-medium text-teal-800 underline">
              Waze
            </button>
            <span>•</span>
            <button type="button" onClick={() => props.onOpenExternal?.('apple')} className="font-medium text-teal-800 underline">
              Apple Maps
            </button>
          </div>
        </div>
      ) : (
        /* Fallback sem geometria: Alerta claro e opções externas */
        <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-amber-950">
          <p className="text-sm font-semibold flex items-center gap-1.5 text-amber-900">
            <span>⚠️</span> Esta via ainda não possui geometria verificada no Multivus Maps.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Navegue usando o nome oficial atual ou antigo no seu aplicativo externo preferido:
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => props.onOpenExternal?.('google')}
              className="h-11 rounded-xl bg-white border border-amber-300 text-xs font-semibold text-slate-800 shadow-sm hover:bg-amber-100/50"
            >
              Google Maps
            </button>
            <button
              type="button"
              onClick={() => props.onOpenExternal?.('waze')}
              className="h-11 rounded-xl bg-white border border-amber-300 text-xs font-semibold text-slate-800 shadow-sm hover:bg-amber-100/50"
            >
              Waze
            </button>
            <button
              type="button"
              onClick={() => props.onOpenExternal?.('apple')}
              className="h-11 rounded-xl bg-white border border-amber-300 text-xs font-semibold text-slate-800 shadow-sm hover:bg-amber-100/50"
            >
              Apple Maps
            </button>
          </div>
          <button
            type="button"
            onClick={props.onReport}
            className="mt-3 w-full text-center text-xs font-medium text-amber-900 underline hover:text-amber-950"
          >
            Informar problema no mapa
          </button>
        </div>
      )}

      {props.goMessage ? <p className="mt-3 text-sm font-medium text-slate-800">{props.goMessage}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Action label="SALVAR" onClick={props.onSave} />
        <Action label="COMPARTILHAR" onClick={props.onShare} />
      </div>
      <div className="mt-3 grid gap-2">
        <TextAction label="Adicionar referência" onClick={props.onAddReference} />
        <TextAction label="Adicionar foto da fachada" onClick={props.onAddPhoto} />
        <TextAction label="Informar problema no mapa" onClick={props.onReport} />
      </div>
    </div>
  )
}

function Action({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-12 rounded-xl bg-slate-100 text-sm font-semibold text-slate-800 hover:bg-slate-200 transition">
      {label}
    </button>
  )
}

function TextAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-11 rounded-xl text-left text-base text-teal-800 hover:text-teal-900 transition">
      {label}
    </button>
  )
}
