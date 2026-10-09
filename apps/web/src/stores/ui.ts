import { create } from 'zustand'
import type { SavedDestination } from '@multivus/shared'

export type SelectedPlace = SavedDestination


type UiState = {
  online: boolean
  pending: number
  location: { latitude: number; longitude: number } | null
  selected: SelectedPlace | null
  number: string
  notice: string | null
  correctionOpen: boolean
  updateAvailable: boolean
  navigating: boolean
  setOnline: (online: boolean) => void
  setPending: (pending: number) => void
  setLocation: (location: { latitude: number; longitude: number } | null) => void
  setSelected: (selected: SelectedPlace | null, number?: string) => void
  setNumber: (number: string) => void
  setNotice: (notice: string | null) => void
  setCorrectionOpen: (open: boolean) => void
  setUpdateAvailable: (available: boolean) => void
  setNavigating: (navigating: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  online: true,
  pending: 0,
  location: null,
  selected: null,
  number: '',
  notice: null,
  correctionOpen: false,
  updateAvailable: false,
  navigating: false,
  setOnline: (online) => set({ online }),
  setPending: (pending) => set({ pending }),
  setLocation: (location) => set({ location }),
  setSelected: (selected, number) => set({ selected, number: number ?? '' }),
  setNumber: (number) => set({ number }),
  setNotice: (notice) => set({ notice }),
  setCorrectionOpen: (correctionOpen) => set({ correctionOpen }),
  setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),
  setNavigating: (navigating) => set({ navigating }),
}))
