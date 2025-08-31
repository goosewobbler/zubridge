import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
// Import UI package styles
import '@zubridge/ui/styles.css';
import './styles/index.css';
// Import Zubridge components
import { withElectron } from '@zubridge/ui/electron';
// Import shared utilities
import {
  createDoubleCounterThunk,
  createDoubleCounterSlowThunk,
  createDistinctiveCounterThunk,
  createDistinctiveCounterSlowThunk,
  createDoubleCounterWithGetStateOverrideThunk,
  createDoubleCounterSlowThunkForSyncHandlers,
  createDistinctiveCounterSlowThunkForSyncHandlers,
  type ThunkContext,
} from '@zubridge/apps-shared';
// Import debug utility
import { debug } from '@zubridge/core';

// Create the Electron app component
const ElectronApp = withElectron();

// Define possible window types
type WindowType = 'main' | 'secondary' | 'runtime';

// App wrapper component to handle async loading of debug info
function AppWrapper() {
  // Create state for our app
  const [windowType, setWindowType] = useState<WindowType | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [modeName, setModeName] = useState('unknown');
  const [currentSubscriptions, setCurrentSubscriptions] = useState<string[] | '*'>('*');

  // Fetch window info on mount
  useEffect(() => {
    const initApp = async () => {
      try {
        // Get window info using the Electron API
        if (window.electronAPI) {
          const info = await window.electronAPI.getWindowInfo();
          const modeInfo = await window.electronAPI.getMode();

          if (info) {
            setWindowType(info.type as WindowType);
            setWindowId(info.id);
            setCurrentSubscriptions(info.subscriptions);
          }
          if (modeInfo) {
            setModeName((modeInfo.modeName || modeInfo.name || 'unknown').toLowerCase());
          }
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      }
    };

    initApp();
  }, []);

  const modeMap = {
    'zustand-basic': 'Zustand Basic',
    'zustand-handlers': 'Zustand Handlers',
    'zustand-reducers': 'Zustand Reducers',
    redux: 'Redux',
    custom: 'Custom',
  };
  const modeTitle = modeMap[modeName] || `Unknown Mode (${modeName})`;

  // Create thunk context
  const thunkContext: ThunkContext = {
    environment: 'renderer',
    logPrefix: `RENDERER-${windowType?.toUpperCase() || 'UNKNOWN'}`,
  };

  // Show loading screen while getting info
  if (!windowType || windowId === null) {
    return <div>Loading Window Info...</div>;
  }

  // Create handlers
  const actionHandlers = {
    createWindow: async () => {
      try {
        if (!window.electronAPI) {
          throw new Error('Electron API not available');
        }
        const result = await window.electronAPI.createRuntimeWindow();
        return { success: true, id: result.windowId };
      } catch (error) {
        console.error('Failed to create window:', error);
        return { success: false, error: String(error) };
      }
    },
    closeWindow: async () => {
      try {
        if (!window.electronAPI) {
          throw new Error('Electron API not available');
        }
        await window.electronAPI.closeCurrentWindow();
        return { success: true };
      } catch (error) {
        console.error('Failed to close window:', error);
        return { success: false, error: String(error) };
      }
    },
    quitApp: async () => {
      try {
        if (!window.electronAPI) {
          throw new Error('Electron API not available');
        }
        await window.electronAPI.quitApp();
        return { success: true };
      } catch (error) {
        console.error('Failed to quit app:', error);
        return { success: false, error: String(error) };
      }
    },
    doubleCounter: (counter: number) => createDoubleCounterThunk(counter, thunkContext),
    doubleCounterSlow: (counter: number) => {
      // Use sync handlers thunk creators for redux and reducers modes
      if (modeName === 'redux' || modeName === 'zustand-reducers') {
        return createDoubleCounterSlowThunkForSyncHandlers(counter, thunkContext);
      }
      return createDoubleCounterSlowThunk(counter, thunkContext);
    },
    distinctiveCounter: (counter: number) => createDistinctiveCounterThunk(counter, thunkContext),
    distinctiveCounterSlow: (counter: number) => {
      // Use sync handlers thunk creators for redux and reducers modes
      if (modeName === 'redux' || modeName === 'zustand-reducers') {
        return createDistinctiveCounterSlowThunkForSyncHandlers(counter, thunkContext);
      }
      return createDistinctiveCounterSlowThunk(counter, thunkContext);
    },
    doubleCounterWithGetStateOverride: (counter: number) =>
      createDoubleCounterWithGetStateOverrideThunk(counter, thunkContext),
  };

  // Create subscription handlers that update the state
  const handleSubscribe = async (keys: string[]) => {
    debug('ui', `[AppWrapper] Attempting to subscribe to keys: ${keys.join(', ')}`);
    if (window.electronAPI) {
      try {
        // Subscribe directly to the requested keys without first unsubscribing
        const result = await window.electronAPI.subscribe(keys);
        debug('ui', '[AppWrapper] Subscribe API call successful:', result);
        if (result.success && result.subscriptions) {
          setCurrentSubscriptions(result.subscriptions);
        }
      } catch (error) {
        debug('ui:error', '[AppWrapper] Error in subscribe:', error);
      }
    }
  };

  const handleUnsubscribe = async (keys: string[]) => {
    debug('ui', `[AppWrapper] Attempting to unsubscribe from keys: ${keys.join(', ')}`);
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.unsubscribe(keys);
        debug('ui', '[AppWrapper] Unsubscribe API call successful:', result);
        if (result.success && result.subscriptions) {
          setCurrentSubscriptions(result.subscriptions);
        }
      } catch (error) {
        debug('ui:error', '[AppWrapper] Error in unsubscribe:', error);
      }
    }
  };

  // Render the ElectronApp component with the window info
  return (
    <ElectronApp
      windowInfo={{
        id: String(windowId),
        type: windowType,
        platform: modeName,
      }}
      windowTitle={`${windowType.charAt(0).toUpperCase() + windowType.slice(1)} Window`}
      appName={`Zubridge - ${modeTitle} Mode`}
      actionHandlers={actionHandlers}
      currentSubscriptions={currentSubscriptions}
      onSubscribe={handleSubscribe}
      onUnsubscribe={handleUnsubscribe}
    />
  );
}

// Get the DOM container element
const container = document.getElementById('root');

// Create React root and render the app
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>,
);
