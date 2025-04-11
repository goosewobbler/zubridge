import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { useStore } from './store'; // Import the Zustand store

// Define action types (can be expanded)
export type AppAction = { type: 'INCREMENT' } | { type: 'DECREMENT' };

// Function to fetch initial state and set it in the store
export const initializeState = async () => {
  try {
    console.log('Bridge: Fetching initial state...');
    const initialCount = await invoke<number>('get_counter');
    useStore.setState({ counter: initialCount });
    console.log('Bridge: Initial state set to', initialCount);
  } catch (error) {
    console.error('Bridge: Failed to get initial counter:', error);
    // Set a default state in case of error
    useStore.setState({ counter: 0 });
  }
};

// Function to listen for backend state updates
export const setupStateListener = async (): Promise<UnlistenFn> => {
  console.log('Bridge: Setting up state listener...');
  const unlisten = await listen<number>('zubridge-tauri:state-update', (event) => {
    console.log(`Bridge: Received state-update event: ${event.payload}`);
    // Update Zustand store directly
    useStore.setState({ counter: event.payload });
  });
  console.log('Bridge: State listener active.');
  return unlisten;
};

// Function to dispatch actions based on the current mode
export const dispatchAction = async (action: AppAction, mode: string) => {
  console.log(`Bridge: Dispatching action in mode '${mode}':`, action);

  // For now, basic and handlers mode invoke commands directly
  // Reducers mode would need different logic later
  if (mode === 'basic' || mode === 'handlers' || mode === 'reducers') {
    try {
      switch (action.type) {
        case 'INCREMENT':
          await invoke('increment_counter');
          console.log('Bridge: Invoked increment_counter');
          break;
        case 'DECREMENT':
          await invoke('decrement_counter');
          console.log('Bridge: Invoked decrement_counter');
          break;
        default:
          console.warn('Bridge: Unknown action type', action);
      }
      // Note: We don't update the store here directly anymore.
      // The backend command emits an event, and the listener updates the store.
    } catch (error) {
      console.error(`Bridge: Error invoking command for action ${action.type}:`, error);
    }
  } else {
    console.warn('Bridge: Unknown mode for dispatch:', mode);
  }
};
