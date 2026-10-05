type StreetDetailsProps = {
  title: string
  streetNumber?: string
  neighborhood?: string | null
  oldNames?: string[]
  warning?: string | null
  customerInput?: string | null
  reference?: string | null
  confidence?: number
  source?: string | null
  sourceDate?: string | null
  verified?: boolean
}

export function StreetDetails({
  title,
  streetNumber,
  neighborhood,
  oldNames = [],
  warning,
  customerInput,
  reference,
  confidence = 0,
  source,
  sourceDate,
  verified = false,
}: StreetDetailsProps) {
  const place = streetNumber ? `${title}, ${streetNumber}` : title
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nome atual</p>
      <div className="mb-1 flex items-start gap-2">
        <h2 className="text-xl font-semibold text-slate-900">{place}</h2>
        <span className={`mt-1 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${verified ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'}`}>
          {verified ? 'Verificada' : 'Não verificada'}
        </span>
      </div>
      {neighborhood ? <p className="text-slate-700">Bairro {neighborhood}</p> : <p className="text-slate-500">Bairro ainda não associado</p>}
      {oldNames.length > 0 ? (
        <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-amber-950">
          <p className="text-sm font-semibold">🔄 Alteração de nome</p>
          {oldNames.map((oldName) => (
            <p key={oldName} className="mt-1 text-sm">
              {oldName} → {title}
            </p>
          ))}
          <p className="mt-2 text-sm">Essa rua teve o nome alterado. Alguns moradores ainda utilizam o nome antigo.</p>
        </div>
      ) : null}
      {warning ? <p className="mt-3 text-sm font-medium text-amber-900">⚠️ {warning}</p> : null}
      {customerInput ? <p className="mt-2 text-sm text-slate-700">Cliente informou: {customerInput}</p> : null}
      {reference ? <p className="mt-1 text-sm text-slate-700">Referência: {reference}</p> : null}
      {oldNames.length > 0 && confidence < 100 ? (
        <p className="mt-2 text-xs text-slate-500">
          Confiança {confidence}/100. A troca veio de uma fonte oficial e ainda não foi conferida no local.
        </p>
      ) : null}
      <p className="mt-2 text-sm text-slate-500">
        {source ?? 'Fonte local'}
        {sourceDate ? ` · ${sourceDate}` : ''}
        {' · Santa Juliana - MG'}
      </p>
    </div>
  )
}
