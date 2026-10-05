const STREET_PREFIXES = new Set([
  'rua',
  'r',
  'avenida',
  'av',
  'alameda',
  'al',
  'travessa',
  'tv',
  'praca',
  'pca',
  'beco',
  'rodovia',
  'rod',
  'largo',
  'via',
])

const NAME_QUALIFIERS = new Set(['antiga', 'antigo'])

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '')
}

export function normalizeAddress(value: string): string {
  const cleaned = stripAccents(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const tokens = cleaned.split(' ').filter(Boolean)
  while (tokens.length > 1 && (STREET_PREFIXES.has(tokens[0] ?? '') || NAME_QUALIFIERS.has(tokens[0] ?? ''))) {
    tokens.shift()
  }
  if (tokens[0] === 'nome' && tokens[1] === 'antigo') tokens.splice(0, 2)
  while (tokens.length > 1 && STREET_PREFIXES.has(tokens[0] ?? '')) tokens.shift()
  return tokens.join(' ')
}
