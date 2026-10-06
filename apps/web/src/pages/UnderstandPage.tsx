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
  const records = useMemo(() => allCatalogRecords(catalog.data), [catalog.data])
  const resolved = text.trim().length > 1 ? resolveAddress(records, text) : null

  function openMap() {
    if (!resolved?.hit) return
    const point = pointOf(resolved.hit.geometry) ?? (
      resolved.hit.latitude && resolved.hit.longitude
        ? { latitude: resolved.hit.latitude, longitude: resolved.hit.longitude }
        : null
    )
    useUi.getState().setSelected(
      {
        id: resolved.hit.id,
        kind: resolved.hit.kind === 'landmark' ? 'place' : 'street',
        title: resolved.officialName ?? resolved.hit.title,
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
        latitude: point?.latitude ?? null,
        longitude: point?.longitude ?? null,
        probableRadiusMeters: resolved.probableRadiusMeters,
        spatialRelationLabel: resolved.spatialRelationLabel,
        landmarkName: resolved.matchedLandmark,
        importanceScore: resolved.matchedLandmarkImportance,
        category: resolved.matchedLandmarkCategory,
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
        <h1 className="text-lg font-semibold">Entender endereço WhatsApp</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="mb-3 text-sm text-slate-400">
          Cole a mensagem que o cliente mandou no WhatsApp. O Multivus Maps identifica nomes antigos, referências locais e pontos da cidade.
        </p>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Entrega na Rua Lírios 120, casa azul perto da igreja"
          className="min-h-36 w-full rounded-2xl bg-[#1c242c] p-4 text-base outline-none border border-white/5 focus:border-[#f0b429]"
        />
        {resolved?.hit && resolved.officialName ? (
          <section className="mt-4 rounded-3xl bg-white p-5 text-slate-900 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                Endereço Identificado
              </span>
              <span className="text-xs font-medium text-slate-500">
                Confiança: {resolved.confidence}/100
              </span>
            </div>

            <h2 className="mt-3 text-2xl font-bold text-slate-900 leading-tight">
              {[resolved.officialName, resolved.number].filter(Boolean).join(', ')}
            </h2>

            {resolved.hit.neighborhoodName ? (
              <p className="mt-1 text-sm font-medium text-slate-600">Bairro {resolved.hit.neighborhoodName}</p>
            ) : null}

            {resolved.usedOldName && resolved.matchedAlias ? (
              <div className="mt-3 rounded-xl bg-amber-50 p-3 border border-amber-200 text-amber-900">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Nome Antigo Detectado</p>
                <p className="text-sm font-semibold">{resolved.matchedAlias} → {resolved.officialName}</p>
              </div>
            ) : null}

            {resolved.matchedReference ? (
              <div className="mt-3 rounded-xl bg-blue-50 p-3 border border-blue-200 text-blue-900">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-800">Referência Popular da Cidade</p>
                <p className="text-sm font-semibold">"{resolved.matchedReference}" aponta para esta via</p>
              </div>
            ) : null}

            {resolved.matchedLandmark ? (
              <div className="mt-3 rounded-xl bg-purple-50 p-3 border border-purple-200 text-purple-900">
                <p className="text-xs font-bold uppercase tracking-wider text-purple-800">Ponto de Referência Próximo</p>
                <p className="text-sm font-semibold">📍 {resolved.matchedLandmark}</p>
              </div>
            ) : null}

            {resolved.probableRadiusMeters ? (
              <div className="mt-3 rounded-xl bg-amber-50 p-3 border border-amber-200 text-amber-950">
                <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-amber-800">
                  <span>🎯 Raio Provável de Entrega</span>
                </div>
                <p className="mt-1 text-sm font-semibold">
                  {resolved.spatialRelationLabel ?? `Raio de ~${resolved.probableRadiusMeters} metros ao redor de ${resolved.matchedLandmark}`}
                </p>
                <p className="mt-0.5 text-xs text-amber-800/80">
                  O mapa exibirá o círculo da área estimada de ~{resolved.probableRadiusMeters}m para guiar o entregador.
                </p>
              </div>
            ) : null}

            {resolved.additionalLandmarks?.length ? (
              <div className="mt-3 rounded-xl bg-slate-100 p-2.5 text-xs text-slate-700">
                <span className="font-semibold text-slate-900">Outros pontos citados:</span>{' '}
                {resolved.additionalLandmarks.join(', ')}
              </div>
            ) : null}

            {resolved.reference ? (
              <div className="mt-3 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Complemento / Referência do cliente:</span>{' '}
                {resolved.reference}
              </div>
            ) : null}

            <button
              type="button"
              onClick={openMap}
              className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#f0b429] text-base font-bold text-slate-900 shadow-md active:scale-[0.98] transition hover:bg-[#e2a823]"
            >
              <span>IR (ENCONTRAR NO MAPA)</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </section>
        ) : text.trim().length > 1 ? (
          <div className="mt-4 rounded-2xl bg-[#1c242c] p-4 text-center">
            <p className="text-sm text-slate-400">Não identificamos a rua ou ponto nessa mensagem.</p>
            <p className="mt-1 text-xs text-slate-500">Tente buscar digitando apenas o nome da rua ou ponto na busca geral.</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function allCatalogRecords(catalog: {
  streets?: Array<{ id: string; officialName: string; streetType: string; neighborhoodName: string | null; verified: boolean; source: string | null; sourceDate: string | null; geometry: unknown; aliases: { alias: string; aliasType: string }[]; confidence?: number | null }>
  landmarks?: Array<{ id: string; name: string; category: string; aliases: string[]; streetId: string | null; streetNumber: string | null; neighborhoodName: string | null; address: string | null; description: string | null; latitude: number | null; longitude: number | null; verified: boolean; confidence: number; importanceScore?: number }>
  localReferences?: Array<{ id: string; popularPhrase: string; relationType: string; targetStreetId: string | null; targetStreetName: string | null; landmarkId: string | null; landmarkName: string | null; description: string | null; confirmationsCount: number; confidence: number; verified: boolean }>
} | undefined): SearchableRecord[] {
  if (!catalog) return []
  const list: SearchableRecord[] = []

  for (const street of catalog.streets ?? []) {
    const point = pointOf(street.geometry)
    list.push({
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
    })
  }

  for (const lm of catalog.landmarks ?? []) {
    list.push({
      id: lm.id,
      kind: 'landmark' as const,
      title: lm.name,
      category: lm.category,
      neighborhoodName: lm.neighborhoodName,
      verified: lm.verified,
      confidence: lm.confidence,
      importanceScore: lm.importanceScore ?? 70,
      latitude: lm.latitude,
      longitude: lm.longitude,
      targetStreetId: lm.streetId,
      aliases: (lm.aliases ?? []).map((alias) => ({ alias, aliasType: 'POPULAR_NAME' })),
      extraText: lm.description,
    })
  }

  for (const ref of catalog.localReferences ?? []) {
    list.push({
      id: ref.id,
      kind: 'reference' as const,
      title: ref.popularPhrase,
      relationType: ref.relationType,
      targetStreetId: ref.targetStreetId,
      targetStreetName: ref.targetStreetName,
      landmarkId: ref.landmarkId,
      landmarkName: ref.landmarkName,
      verified: ref.verified,
      confidence: ref.confidence,
      extraText: ref.description,
    })
  }

  return list
}

