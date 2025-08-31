// @ts-expect-error: React is used for JSX

// Correct import paths for Tauri window APIs
import { WebviewWindow } from '@tauri-apps/api/window'; // Import WebviewWindow from correct path
import type { AnyState } from '@zubridge/tauri'; // Import state type if needed for selectors
// Import Zubridge hooks
import { useZubridgeDispatch, useZubridgeStore } from '@zubridge/tauri'; // Removed initializeBridge import
import { CounterActions, Header, ThemeToggle, WindowActions, WindowDisplay } from '@zubridge/ui';
import React from 'react';
import './styles/index.css';

interface RuntimeAppProps {
  windowLabel: string;
}

interface ThemeState {
  is_dark: boolean;
}

// Use AnyState or define a more specific State type expected from the backend
interface AppState extends AnyState {
  // Assuming backend sends { counter: number }
  counter?: number; // Make optional as it might not be present during init
  theme?: ThemeState;
}

export function RuntimeApp({ windowLabel }: RuntimeAppProps) {
  // Get dispatch function from Zubridge hook
  const dispatch = useZubridgeDispatch();

  // Get counter from Zubridge store
  const counter = useZubridgeStore<number>((state: AppState) => state.counter ?? 0);

  // Get theme state
  const isDarkMode = useZubridgeStore<boolean>((state: AppState) => state.theme?.is_dark ?? false);

  // Get the bridge status (optional, for loading indicators etc.)
  const bridgeStatus = useZubridgeStore((state) => state.__bridge_status);

  // Apply theme based on state
  React.useEffect(() => {
    // Remove both theme classes first
    document.body.classList.remove('dark-theme', 'light-theme');

    // Add the appropriate theme class
    document.body.classList.add(isDarkMode ? 'dark-theme' : 'light-theme');

    console.log(`[App.runtime] Theme set to ${isDarkMode ? 'dark' : 'light'} mode`);
  }, [isDarkMode]);

  const incrementCounter = () => {
    // Dispatch Zubridge action - Use command name as type
    dispatch('COUNTER:INCREMENT');
  };

  const decrementCounter = () => {
    // Dispatch Zubridge action - Use command name as type
    dispatch('COUNTER:DECREMENT');
  };

  const doubleCounterThunk = () => {
    // Use a thunk to get the current state and dispatch a new action
    const currentValue = counter;
    console.log(
      `[${windowLabel}] Thunk: Doubling counter from ${currentValue} to ${currentValue * 2}`,
    );
    dispatch('COUNTER:SET', currentValue * 2);
  };

  const doubleCounterAction = () => {
    const currentValue = counter;
    console.log(
      `[${windowLabel}] Action: Doubling counter from ${currentValue} to ${currentValue * 2}`,
    );
    dispatch('COUNTER:SET', currentValue * 2);
  };

  const toggleTheme = () => {
    dispatch('THEME:TOGGLE');
  };

  // Use Tauri API for window creation
  const createWindow = () => {
    const uniqueLabel = `runtime_${Date.now()}`;
    const webview = new WebviewWindow(uniqueLabel, {
      url: window.location.pathname, // Use current path
      title: `Runtime Window (${uniqueLabel})`,
      width: 600,
      height: 485,
    });
    webview.once('tauri://created', () => console.log(`Window ${uniqueLabel} created`));
    webview.once('tauri://error', (e) =>
      console.error(`Failed to create window ${uniqueLabel}:`, e),
    );
  };

  // Use WebviewWindow.getByLabel to get the current window instance
  const closeWindow = async () => {
    console.log(`[App.runtime] Attempting to close window with label: ${windowLabel}`);
    try {
      // Await the promise returned by getByLabel
      const currentWindow = await WebviewWindow.getByLabel(windowLabel);
      if (currentWindow) {
        console.log('[App.runtime] Found window, calling close()...');
        await currentWindow.close();
      } else {
        console.warn(
          `[App.runtime] WebviewWindow.getByLabel returned null for label: ${windowLabel}`,
        );
      }
    } catch (error) {
      console.error('[App.runtime] Error closing window:', error);
    }
  };

  return (
    <WindowDisplay
      windowId={windowLabel}
      windowTitle="Runtime Window"
      mode="tauri"
      bridgeStatus={bridgeStatus as 'ready' | 'error' | 'initializing'}
      isRuntimeWindow={true}
    >
      <Header
        windowId={windowLabel}
        windowTitle="Runtime Window"
        mode="tauri"
        bridgeStatus={bridgeStatus as 'ready' | 'error' | 'initializing'}
        counterValue={counter}
      />
      <CounterActions
        onIncrement={incrementCounter}
        onDecrement={decrementCounter}
        onDouble={(method) => (method === 'thunk' ? doubleCounterThunk() : doubleCounterAction())}
        isLoading={bridgeStatus === 'initializing'}
      />

      <div className="theme-section">
        <ThemeToggle theme={isDarkMode ? 'dark' : 'light'} onToggle={toggleTheme} />

        <WindowActions
          onCreateWindow={createWindow}
          onCloseWindow={closeWindow}
          isMainWindow={false}
        />
      </div>
    </WindowDisplay>
  );
}
