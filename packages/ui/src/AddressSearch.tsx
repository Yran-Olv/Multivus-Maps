import type { ReactNode } from 'react'

export type AddressHit = {
  id: string
  title: string
  subtitle?: string | null
  warning?: string | null
  meta?: string | null
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
  return (
    <button type="button" className="block w-full border-b border-white/5 px-4 py-4 text-left last:border-b-0" onClick={() => onSelect(hit)}>
      <span className="block text-lg font-medium">{hit.title}</span>
      {hit.subtitle ? <span className="mt-1 block text-sm text-amber-200">{hit.subtitle}</span> : null}
      {hit.warning ? <span className="mt-1 block text-sm text-amber-100">⚠️ {hit.warning}</span> : null}
      {hit.meta ? <span className="mt-1 block text-sm text-slate-400">{hit.meta}</span> : null}
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-4 text-sm text-slate-400">{text}</p>
}
