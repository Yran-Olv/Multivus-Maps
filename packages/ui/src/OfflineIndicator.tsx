type OfflineIndicatorProps = {
  online: boolean
  pending?: number
}

export function OfflineIndicator({ online, pending = 0 }: OfflineIndicatorProps) {
  if (online && pending === 0) return null
  const text = online
    ? `${pending} alteração(ões) aguardando sincronização`
    : pending > 0
      ? `Sem internet. ${pending} alteração(ões) salvas neste aparelho`
      : 'Sem internet. Mostrando o que já está neste aparelho'
  return <div className="bg-amber-300 px-4 py-2 text-center text-sm font-medium text-slate-900">{text}</div>
}
