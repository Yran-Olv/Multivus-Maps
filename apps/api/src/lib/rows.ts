export function rowsOf<T>(result: { rows?: T[] } | T[]): T[] {
  if (Array.isArray(result)) return result
  return result.rows ?? []
}
