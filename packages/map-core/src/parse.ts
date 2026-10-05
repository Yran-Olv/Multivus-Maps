import { normalizeAddress } from './normalize'

export type ParsedAddress = {
  raw: string
  streetQuery: string
  number: string | null
  reference: string | null
}

const LEAD_IN = /^(?:entrega[r]?|pedido|vai)\s+(?:na|no|em|para|pra)\s+/i

export function parseAddressText(raw: string): ParsedAddress {
  const original = raw.trim()
  const text = original.replace(/\s+/g, ' ').replace(LEAD_IN, '')
  const chunks = text.split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean)
  let streetChunk = chunks[0] ?? text
  let number: string | null = null
  const trailingNumber = streetChunk.match(/^(.*\D)\s+(\d{1,5}[a-zA-Z]?)$/)
  if (trailingNumber?.[1] && trailingNumber[2] && normalizeAddress(trailingNumber[1]).length >= 2) {
    streetChunk = trailingNumber[1].trim()
    number = trailingNumber[2]
  }

  const references: string[] = []
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
  }
}
