import { create } from 'zustand'

export type SelectedPlace = {
  id: string
  kind: 'street' | 'place' | 'neighborhood'
  title: string
  neighborhoodName: string | null
  oldNames: string[]
  usedOldName: boolean
  warning: string | null
  confidence: number
  customerInput: string | null
  matchedAlias: string | null
  reference: string | null
  source: string | null
  sourceDate: string | null
  verified: boolean
  latitude: number | null
  longitude: number | null
}

type UiState = {
  online: boolean
  pending: number
  location: { latitude: number; longitude: number } | null
  selected: SelectedPlace | null
  number: string
  notice: string | null
  correctionOpen: boolean
  setOnline: (online: boolean) => void
  setPending: (pending: number) => void
  setLocation: (location: { latitude: number; longitude: number } | null) => void
  setSelected: (selected: SelectedPlace | null, number?: string) => void
  setNumber: (number: string) => void
  setNotice: (notice: string | null) => void
  setCorrectionOpen: (open: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  online: true,
  pending: 0,
  location: null,
  selected: null,
  number: '',
  notice: null,
  correctionOpen: false,
  setOnline: (online) => set({ online }),
  setPending: (pending) => set({ pending }),
  setLocation: (location) => set({ location }),
  setSelected: (selected, number) => set({ selected, number: number ?? '' }),
  setNumber: (number) => set({ number }),
  setNotice: (notice) => set({ notice }),
  setCorrectionOpen: (correctionOpen) => set({ correctionOpen }),
}))
