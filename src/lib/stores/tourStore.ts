import { create } from 'zustand';

interface TourState {
  isTourActive: boolean;
  setTourActive: (active: boolean) => void;
  /** 0-based index of the currently active tour step. -1 when tour is not running. */
  currentTourStep: number;
  setCurrentTourStep: (step: number) => void;
}

export const useTourStore = create<TourState>((set) => ({
  isTourActive: false,
  setTourActive: (active) => set({ isTourActive: active }),
  currentTourStep: -1,
  setCurrentTourStep: (step) => set({ currentTourStep: step }),
}));
