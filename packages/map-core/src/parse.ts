import { normalizeAddress } from './normalize'

export type ParsedAddress = {
  raw: string
  streetQuery: string
  number: string | null
  reference: string | null
  neighborhood?: string | null
}

const LEAD_IN = /^(?:entrega[r]?|pedido|vai|levar|ir)\s+(?:na|no|em|para|pra|ao)\s+/i

const REFERENCE_KEYWORD = /\b(?:perto\s+d[aeo]s?|proxim[oa]\s+a[os]?|em\s+frente\s+(?:a[os]?|d[aeo]s?)?|ao\s+lado\s+(?:d[aeo]s?)?|atr[aá]s\s+d[aeo]s?|depois\s+d[aeo]s?|antes\s+d[aeo]s?|no\s+trevo\s+d[aeo]s?|subindo\s+d[aeo]s?|descendo\s+d[aeo]s?|vizinho\s+(?:a[os]?|d[aeo]s?)?|casa\s+|ap(?:to)?\s+|apartamento\s+|bloco\s+|fundos|esquina\s+com)\b/i

const PREP_PREFIX = /^(?:perto\s+d[aeo]s?|proxim[oa]\s+a[os]?|em\s+frente\s+(?:a[os]?|d[aeo]s?)?|ao\s+lado\s+(?:d[aeo]s?)?|atr[aá]s\s+d[aeo]s?|depois\s+d[aeo]s?|antes\s+d[aeo]s?|no\s+trevo\s+d[aeo]s?|vizinho\s+(?:a[os]?|d[aeo]s?)?)\s+/i

const HOUSE_DESC_PREFIX = /^(?:casa\s+[a-zA-ZÀ-ÿ0-9]+\s*|sobrado\s+[a-zA-ZÀ-ÿ0-9]+\s*|muro\s+[a-zA-ZÀ-ÿ0-9]+\s*|port[aã]o\s+[a-zA-ZÀ-ÿ0-9]+\s*|ap(?:to)?\s+[a-zA-ZÀ-ÿ0-9]+\s*)[,;\s]+/i

export function parseAddressText(raw: string): ParsedAddress {
  const original = raw.trim()
  let text = original.replace(/\s+/g, ' ').replace(LEAD_IN, '')

  const references: string[] = []

  let detectedNeighborhood: string | null = null
  const neighborhoodMatch = text.match(/\b(?:bairro|b\.)\s+([a-zA-ZÀ-ÿ0-9\s]+?)(?:[,;\n]|$)/i)
  if (neighborhoodMatch?.[1]) {
    detectedNeighborhood = neighborhoodMatch[1].trim()
    text = text.replace(neighborhoodMatch[0], ' ')
  }

  // Se começar com descrição física (ex: "casa azul atrás do Posto 2000")
  const houseMatch = text.match(HOUSE_DESC_PREFIX)
  if (houseMatch) {
    const desc = houseMatch[0].replace(/[,;\s]+$/, '').trim()
    if (desc) references.push(desc)
    text = text.slice(houseMatch[0].length).trim()
  }

  const chunks = text.split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean)
  let streetChunk = chunks[0] ?? text
  let number: string | null = null

  // Se o próprio chunk inicial começar com preposição de referência (ex: "perto do Barbosão", "atrás da Farma Cunha")
  const leadingPrepMatch = streetChunk.match(PREP_PREFIX)
  if (leadingPrepMatch) {
    references.push(streetChunk)
    streetChunk = streetChunk.slice(leadingPrepMatch[0].length).trim()
  } else {
    const refIndex = streetChunk.search(REFERENCE_KEYWORD)
    if (refIndex > 0) {
      const inlineRef = streetChunk.slice(refIndex).trim()
      streetChunk = streetChunk.slice(0, refIndex).trim()
      if (inlineRef) references.push(inlineRef)
    }
  }

  const NON_STREET_NUMBER_PREFIXES = /\b(?:posto|auto\s+posto|loja|supermercado|farma|drogaria|farm[aá]cia|padaria|box|bloco|quadra|lote|br|km)\b/i

  const trailingNumber = streetChunk.match(/^(.*?\D)\s+(\d{1,5}[a-zA-Z]?)(?:\s+(.*))?$/)
  if (
    trailingNumber?.[1] &&
    trailingNumber[2] &&
    normalizeAddress(trailingNumber[1]).length >= 2 &&
    !NON_STREET_NUMBER_PREFIXES.test(trailingNumber[1].trim())
  ) {
    streetChunk = trailingNumber[1].trim()
    number = trailingNumber[2]
    if (trailingNumber[3]?.trim()) {
      references.push(trailingNumber[3].trim())
    }
  }

  for (const chunk of chunks.slice(1)) {
    if (!number && /^\d{1,5}[a-zA-Z]?$/.test(chunk)) {
      number = chunk
      continue
    }
    references.push(chunk)
  }

  return {
    raw: original,
    streetQuery: streetChunk || original,
    number,
    reference: references.length ? references.join(', ') : null,
    neighborhood: detectedNeighborhood,
  }
}
