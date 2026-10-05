type SearchBarProps = {
  value?: string
  placeholder?: string
  onChange?: (value: string) => void
  onFocus?: () => void
  onBack?: () => void
  autoFocus?: boolean
}

export function SearchBar({
  value = '',
  placeholder = 'Pesquisar endereço, rua ou cliente...',
  onChange,
  onFocus,
  onBack,
  autoFocus = false,
}: SearchBarProps) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white px-3 shadow-lg shadow-black/20">
      {onBack ? (
        <button type="button" className="grid h-11 w-11 place-items-center text-slate-700" onClick={onBack} aria-label="Voltar">
          <ArrowLeft />
        </button>
      ) : (
        <span className="grid h-11 w-11 place-items-center text-lg font-semibold text-teal-800">M</span>
      )}
      <input
        value={value}
        autoFocus={autoFocus}
        readOnly={!onChange}
        onChange={(event) => onChange?.(event.target.value)}
        onFocus={onFocus}
        onClick={onFocus}
        placeholder={placeholder}
        className="h-14 w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-500"
        aria-label="Pesquisar endereço, rua ou cliente"
      />
    </div>
  )
}

function ArrowLeft() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 5 8 12l7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
