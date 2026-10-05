type CurrentLocationButtonProps = {
  onClick: () => void
  busy?: boolean
}

export function CurrentLocationButton({ onClick, busy = false }: CurrentLocationButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Centralizar na minha localização"
      className="grid h-14 w-14 place-items-center rounded-full bg-white text-slate-900 shadow-lg shadow-black/25"
    >
      {busy ? <span className="text-xs">...</span> : <TargetIcon />}
    </button>
  )
}

function TargetIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
