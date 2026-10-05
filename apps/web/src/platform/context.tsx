import { createContext, useContext } from 'react'
import type { Platform } from './index'

const PlatformContext = createContext<Platform | null>(null)

export const PlatformProvider = PlatformContext.Provider

export function usePlatform(): Platform {
  const platform = useContext(PlatformContext)
  if (!platform) throw new Error('Plataforma ainda não iniciada')
  return platform
}
