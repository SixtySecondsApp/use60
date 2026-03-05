import { create } from 'zustand';
export const useTourStore = create(() => ({ isActive: false, step: 0 }));
