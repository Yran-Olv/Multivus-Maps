import { CORRECTION_TYPE_LABELS, CORRECTION_TYPES, type CorrectionType } from '@multivus/shared'

type MapCorrectionModalProps = {
  open: boolean
  description: string
  correctionType: CorrectionType
  coordinateLabel: string
  submitting?: boolean
  onClose: () => void
  onChangeType: (value: CorrectionType) => void
  onChangeDescription: (value: string) => void
  onUseMyLocation: () => void
  onSubmit: () => void
}

export function MapCorrectionModal(props: MapCorrectionModalProps) {
  if (!props.open) return null
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#0e141b] text-white">
      <header className="flex items-center justify-between px-4 py-4">
        <h2 className="text-lg font-semibold">Informar problema no mapa</h2>
        <button type="button" onClick={props.onClose} className="text-sm text-slate-300">
          Fechar
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <p className="mb-3 text-sm text-slate-300">
          A correção entra como pendente. Ela só altera o mapa depois da revisão.
        </p>
        <p className="mb-4 text-sm text-amber-200">Marcador: {props.coordinateLabel}</p>
        <button type="button" onClick={props.onUseMyLocation} className="mb-4 h-12 rounded-xl bg-white/10 px-4 text-base">
          Usar minha localização
        </button>
        <div className="grid gap-2">
          {CORRECTION_TYPES.map((type) => (
            <label key={type} className="flex min-h-12 items-center gap-3 rounded-xl bg-[#1c242c] px-3">
              <input
                type="radio"
                name="correction-type"
                checked={props.correctionType === type}
                onChange={() => props.onChangeType(type)}
              />
              <span>{CORRECTION_TYPE_LABELS[type]}</span>
            </label>
          ))}
        </div>
        <label className="mt-4 block text-sm text-slate-300">
          Descrição
          <textarea
            value={props.description}
            onChange={(event) => props.onChangeDescription(event.target.value)}
            className="mt-1 min-h-28 w-full rounded-xl bg-[#1c242c] p-3 text-base text-white outline-none"
            placeholder="O que está errado neste ponto?"
          />
        </label>
        <button
          type="button"
          disabled={props.submitting}
          onClick={props.onSubmit}
          className="mt-4 h-14 w-full rounded-2xl bg-[#f0b429] text-base font-semibold text-slate-900 disabled:opacity-60"
        >
          {props.submitting ? 'Enviando...' : 'Enviar correção'}
        </button>
      </div>
    </div>
  )
}
