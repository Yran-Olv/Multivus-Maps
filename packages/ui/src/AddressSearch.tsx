import type { ReactNode } from 'react'

export type AddressHit = {
  id: string
  entityId?: string
  entityKind?: 'street' | 'place' | 'landmark' | 'reference' | 'neighborhood'
  number?: string | null
  customerInput?: string | null
  query?: string | null
  destination?: import('@multivus/shared').SavedDestination
  title: string
  subtitle?: string | null
  warning?: string | null
  meta?: string | null
  oldNames?: string[]
  usedOldName?: boolean
  matchedAlias?: string | null
  neighborhoodName?: string | null
  confidence?: number
  verified?: boolean
  latitude?: number | null
  longitude?: number | null
  resolvedNumber?: string | null
  coordinatesVerified?: boolean
  coordinateType?: import('@multivus/shared').SavedDestination['coordinateType']
  coordinateSource?: string | null
  coordinateSourceDate?: string | null
  numberVerified?: boolean
  source?: string | null
  sourceDate?: string | null
}

type AddressSearchProps = {
  query: string
  onQueryChange: (value: string) => void
  onBack: () => void
  recents: AddressHit[]
  favorites: AddressHit[]
  results: AddressHit[]
  loading?: boolean
  onSelect: (hit: AddressHit) => void
  onUnderstand?: () => void
}

export function AddressSearch({
  query,
  onQueryChange,
  onBack,
  recents,
  favorites,
  results,
  loading = false,
  onSelect,
  onUnderstand,
}: AddressSearchProps) {
  const searching = query.trim().length > 0
  return (
    <div className="flex h-full flex-col bg-[#0e141b] text-white">
      <div className="p-3">
        <label className="flex items-center gap-2 rounded-full bg-white px-3 text-slate-900">
          <button type="button" className="grid h-11 w-11 place-items-center" onClick={onBack} aria-label="Voltar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5 8 12l7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          <input
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Pesquisar endereço, rua ou cliente..."
            className="h-14 w-full bg-transparent text-base outline-none"
          />
        </label>
        {onUnderstand ? (
          <button type="button" className="mt-3 h-11 w-full rounded-2xl bg-white/10 text-sm font-semibold" onClick={onUnderstand}>
            Entender endereço
          </button>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {searching ? (
          <Section title={loading ? 'Buscando...' : 'Resultados'}>
            {results.length === 0 && !loading ? <Empty text="Nenhum endereço encontrado." /> : null}
            {results.map((hit) => (
              <Hit key={hit.id} hit={hit} onSelect={onSelect} />
            ))}
          </Section>
        ) : (
          <>
            <Section title="Recentes">
              {recents.length === 0 ? <Empty text="Suas últimas buscas aparecem aqui." /> : null}
              {recents.map((hit) => (
                <Hit key={hit.id} hit={hit} onSelect={onSelect} />
              ))}
            </Section>
            <Section title="Favoritos">
              {favorites.length === 0 ? <Empty text="Salve um endereço para achar rápido." /> : null}
              {favorites.map((hit) => (
                <Hit key={hit.id} hit={hit} onSelect={onSelect} />
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      <div className="overflow-hidden rounded-2xl bg-[#1c242c]">{children}</div>
    </section>
  )
}

function Hit({ hit, onSelect }: { hit: AddressHit; onSelect: (hit: AddressHit) => void }) {
  const hasOld = hit.oldNames && hit.oldNames.length > 0
  const confidence = hit.confidence ?? (hit.verified ? 100 : 70)
  const isHighConfidence = confidence >= 90

  return (
    <button
      type="button"
      className="block w-full border-b border-white/5 px-4 py-4 text-left transition hover:bg-white/5 last:border-b-0"
      onClick={() => onSelect(hit)}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg font-medium text-white">{hit.title}</span>
        {hit.verified ? (
          <span className="shrink-0 rounded-md bg-teal-500/20 px-2 py-0.5 text-xs font-medium text-teal-300">
            Verificada
          </span>
        ) : null}
      </div>

      {hit.usedOldName ? (
        <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-amber-300">
          <span>🔄</span>
          <span>Antiga {hit.matchedAlias ?? hit.subtitle?.replace(/^🔄\s*Antiga:\s*/, '')}</span>
        </div>
      ) : hasOld ? (
        <p className="mt-1 text-sm text-slate-300">
          Também conhecida como: <span className="text-amber-200">{hit.oldNames?.join(', ')}</span>
        </p>
      ) : hit.subtitle && hit.subtitle !== hit.neighborhoodName ? (
        <p className="mt-1 text-sm text-amber-200">{hit.subtitle}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <span>Bairro: {hit.neighborhoodName || <span className="italic text-slate-500">Não confirmado</span>}</span>
        <span>•</span>
        <span className={isHighConfidence ? 'text-teal-400 font-medium' : 'text-amber-400/90 font-medium'}>
          Confiança: {confidence}/100
        </span>
        {hit.meta ? (
          <>
            <span>•</span>
            <span>{hit.meta}</span>
          </>
        ) : null}
      </div>

      {hit.warning ? (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200">
          ⚠️ {hit.warning}
        </p>
      ) : null}
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-4 text-sm text-slate-400">{text}</p>
}
