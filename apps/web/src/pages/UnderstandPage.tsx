import { resolveAddress, type SearchableRecord } from '@multivus/map-core'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useCatalog } from '../hooks/use-catalog'
import { pointOf } from '../lib/catalog'
import { useUi } from '../stores/ui'

export function UnderstandPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const catalog = useCatalog()
  const initial = typeof location.state === 'object' && location.state && 'text' in location.state && typeof location.state.text === 'string'
    ? location.state.text
    : ''
  const [text, setText] = useState(initial)
  const records = useMemo(() => streetRecords(catalog.data), [catalog.data])
  const resolved = text.trim().length > 1 ? resolveAddress(records, text) : null

  function openMap() {
    if (!resolved?.hit) return
    const point = pointOf(resolved.hit.geometry)
    useUi.getState().setSelected(
      {
        id: resolved.hit.id,
        kind: 'street',
        title: resolved.hit.title,
        neighborhoodName: resolved.hit.neighborhoodName ?? null,
        oldNames: resolved.oldNames,
        usedOldName: resolved.usedOldName,
        warning: resolved.warning,
        confidence: resolved.confidence,
        customerInput: resolved.raw,
        matchedAlias: resolved.matchedAlias,
        reference: resolved.reference,
        source: resolved.hit.source ?? null,
        sourceDate: resolved.hit.sourceDate ?? null,
        verified: resolved.hit.verified,
        latitude: resolved.hit.latitude ?? point?.latitude ?? null,
        longitude: resolved.hit.longitude ?? point?.longitude ?? null,
      },
      resolved.number ?? '',
    )
    navigate('/')
  }

  return (
    <div className="flex h-full flex-col bg-[#0e141b] text-white">
      <header className="flex items-center gap-2 px-3 pt-3">
        <button type="button" className="grid h-11 w-11 place-items-center" onClick={() => navigate(-1)} aria-label="Voltar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5 8 12l7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">Entender endereço</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="mb-3 text-sm text-slate-400">Cole a mensagem que o cliente mandou. O nome antigo e o nome atual apontam para a mesma rua.</p>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Entrega na Rua Lírios 120, casa azul perto da igreja"
          className="min-h-36 w-full rounded-2xl bg-[#1c242c] p-4 text-base outline-none"
        />
        {resolved?.hit && resolved.officialName ? (
          <section className="mt-4 rounded-3xl bg-white p-4 text-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Endereço identificado</p>
            <h2 className="mt-1 text-xl font-semibold">
              {[resolved.officialName, resolved.number].filter(Boolean).join(', ')}
            </h2>
            {resolved.hit.neighborhoodName ? <p className="text-slate-700">Bairro {resolved.hit.neighborhoodName}</p> : null}
            {resolved.usedOldName && resolved.matchedAlias ? (
              <p className="mt-3 text-sm font-medium text-amber-900">⚠️ Cliente utilizou o nome antigo: {resolved.matchedAlias}</p>
            ) : null}
            {resolved.oldNames.length > 0 ? (
              <p className="mt-2 text-sm text-slate-700">
                {resolved.oldNames.map((name) => `${name} → ${resolved.officialName}`).join(' · ')}
              </p>
            ) : null}
            {resolved.warning ? <p className="mt-2 text-sm text-amber-900">{resolved.warning}</p> : null}
            {resolved.reference ? <p className="mt-2 text-sm text-slate-700">Referência: {resolved.reference}</p> : null}
            {resolved.confidence < 100 ? (
              <p className="mt-2 text-xs text-slate-500">Confiança {resolved.confidence}/100. Ainda sem conferência local.</p>
            ) : null}
            <button type="button" onClick={openMap} className="mt-4 h-12 w-full rounded-xl bg-[#f0b429] font-semibold text-slate-900">
              ENCONTRAR NO MAPA
            </button>
          </section>
        ) : text.trim().length > 1 ? (
          <p className="mt-4 text-sm text-slate-400">Não identificamos a rua nessa mensagem.</p>
        ) : null}
      </div>
    </div>
  )
}

function streetRecords(catalog: { streets: Array<{ id: string; officialName: string; streetType: string; neighborhoodName: string | null; verified: boolean; source: string | null; sourceDate: string | null; geometry: unknown; aliases: { alias: string; aliasType: string }[]; confidence?: number | null }> } | undefined): SearchableRecord[] {
  if (!catalog) return []
  return catalog.streets.map((street) => {
    const point = pointOf(street.geometry)
    return {
      id: street.id,
      kind: 'street' as const,
      title: street.officialName,
      streetType: street.streetType,
      neighborhoodName: street.neighborhoodName,
      verified: street.verified,
      source: street.source,
      sourceDate: street.sourceDate,
      geometry: street.geometry,
      aliases: street.aliases,
      confidence: street.confidence,
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
    }
  })
}
