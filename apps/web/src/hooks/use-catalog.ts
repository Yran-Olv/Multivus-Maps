import { useQuery } from '@tanstack/react-query'
import { ensureSeed, readCatalog, refreshCatalogFromApi } from '../lib/catalog'
import { useUi } from '../stores/ui'

export function useCatalog() {
  const online = useUi((state) => state.online)
  return useQuery({
    queryKey: ['catalog'],
    queryFn: async () => {
      await ensureSeed()
      if (online) {
        try {
          await refreshCatalogFromApi()
        } catch {
          // O seed local continua disponível.
        }
      }
      return readCatalog()
    },
  })
}
