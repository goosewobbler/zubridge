import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
// Import UI package styles
import '@zubridge/ui/styles.css';
import './styles/index.css';
// Import Zubridge components
import { withElectron } from '@zubridge/ui/electron';
// Import shared utilities
import { createDoubleCounterThunk, createDoubleCounterSlowThunk, type ThunkContext } from '@zubridge/apps-shared';

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
    basic: 'Zustand Basic',
    handlers: 'Zustand Handlers',
    reducers: 'Zustand Reducers',
    redux: 'Redux',
    custom: 'Custom',
  };
  const modeTitle = modeMap[modeName];

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
    doubleCounterSlow: (counter: number) => createDoubleCounterSlowThunk(counter, thunkContext),
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
