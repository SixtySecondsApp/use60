import { create } from 'zustand';

interface TourState {
  isTourActive: boolean;
  currentTourStep: number;
  setTourActive: (active: boolean) => void;
  setCurrentTourStep: (step: number) => void;
}

export const useTourStore = create<TourState>((set) => ({
  isTourActive: false,
  currentTourStep: 0,
  setTourActive: (active) => set({ isTourActive: active }),
  setCurrentTourStep: (step) => set({ currentTourStep: step }),
}));
