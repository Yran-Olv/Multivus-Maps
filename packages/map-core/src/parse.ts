import { normalizeAddress } from './normalize'

export type ParsedAddress = {
  raw: string
  streetQuery: string
  number: string | null
  reference: string | null
  neighborhood?: string | null
}

const LEAD_IN = /^(?:entrega[r]?|pedido|vai|levar|ir)\s+(?:na|no|em|para|pra|ao)\s+/i

const REFERENCE_KEYWORD = /\b(?:perto\s+d[aeo]s?|proxim[oa]\s+a[os]?|em\s+frente\s+(?:a[os]?|d[aeo]s?)?|ao\s+lado\s+(?:d[aeo]s?)?|atr[aá]s\s+d[aeo]s?|casa\s+|ap(?:to)?\s+|apartamento\s+|bloco\s+|fundos|esquina\s+com)\b/i


export function parseAddressText(raw: string): ParsedAddress {
  const original = raw.trim()
  let text = original.replace(/\s+/g, ' ').replace(LEAD_IN, '')

  let detectedNeighborhood: string | null = null
  const neighborhoodMatch = text.match(/\b(?:bairro|b\.)\s+([a-zA-ZÀ-ÿ0-9\s]+?)(?:[,;\n]|$)/i)
  if (neighborhoodMatch?.[1]) {
    detectedNeighborhood = neighborhoodMatch[1].trim()
    text = text.replace(neighborhoodMatch[0], ' ')
  }

  const chunks = text.split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean)
  let streetChunk = chunks[0] ?? text
  let number: string | null = null
  const references: string[] = []

  const refIndex = streetChunk.search(REFERENCE_KEYWORD)
  if (refIndex > 0) {
    const inlineRef = streetChunk.slice(refIndex).trim()
    streetChunk = streetChunk.slice(0, refIndex).trim()
    if (inlineRef) references.push(inlineRef)
  }

  const trailingNumber = streetChunk.match(/^(.*?\D)\s+(\d{1,5}[a-zA-Z]?)(?:\s+(.*))?$/)
  if (trailingNumber?.[1] && trailingNumber[2] && normalizeAddress(trailingNumber[1]).length >= 2) {
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
