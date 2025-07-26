import { create } from 'zustand';

// Define the state structure (matching Rust backend)
interface CounterStoreState {
  counter: number;
  // Add methods to update state if needed internally by the store
  // Or rely purely on external updates via the bridge
  setCounter: (count: number) => void;
}

// Create the Zustand store
export const useStore = create<CounterStoreState>((set) => ({
  counter: 0, // Initial state
  setCounter: (count) => set({ counter: count }),
}));

// Function to initialize the store (can be called by the bridge)
export const initializeStore = async () => {
  // Potentially fetch initial state here, or let the bridge do it
  console.log('Zustand store initialized');
};
