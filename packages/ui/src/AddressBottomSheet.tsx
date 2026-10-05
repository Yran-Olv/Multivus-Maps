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
  streetNumber: string
  onStreetNumber: (value: string) => void
  onClose: () => void
  onGo: () => void
  onSave: () => void
  onShare: () => void
  onAddReference: () => void
  onAddPhoto: () => void
  onReport: () => void
  goMessage?: string | null
}

export function AddressBottomSheet(props: AddressBottomSheetProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 max-h-[78dvh] overflow-y-auto rounded-t-3xl bg-white px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-3 text-slate-900 shadow-2xl">
      <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
      <button type="button" className="absolute right-4 top-3 text-sm text-slate-500" onClick={props.onClose}>
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
      <button
        type="button"
        onClick={props.onGo}
        className="mt-4 h-12 w-full rounded-xl bg-[#f0b429] text-sm font-semibold text-slate-900"
      >
        IR PARA O LOCAL
      </button>
      {props.goMessage ? <p className="mt-3 text-sm font-medium text-slate-800">{props.goMessage}</p> : null}
      <div className="mt-2 grid grid-cols-2 gap-2">
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
    <button type="button" onClick={onClick} className="h-12 rounded-xl bg-slate-100 text-sm font-semibold text-slate-800">
      {label}
    </button>
  )
}

function TextAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-11 rounded-xl text-left text-base text-teal-800">
      {label}
    </button>
  )
}
