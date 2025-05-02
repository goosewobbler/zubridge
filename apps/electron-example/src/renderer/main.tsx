import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
// Import UI package styles
import '@zubridge/ui/styles.css';
import './styles/index.css';
// Import Zubridge components
import { withElectron } from '@zubridge/ui/electron';

// Define the ElectronAPI for TypeScript
declare global {
  interface Window {
    electronAPI?: {
      createRuntimeWindow: () => Promise<{ success: boolean; windowId?: number }>;
      closeCurrentWindow: () => void;
      quitApp: () => void;
      getWindowInfo: () => Promise<{ id: number; type: string }>;
      getMode: () => Promise<{ modeName?: string; name?: string }>;
    };
  }
}

// Create the Electron app component
const ElectronApp = withElectron();

// Define possible window types
type WindowType = 'main' | 'secondary' | 'runtime';

// App wrapper component to handle async loading of debug info
function AppWrapper() {
  // Create state for our app
  const [windowType, setWindowType] = useState<WindowType | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [modeId, setModeId] = useState('unknown');

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
            setModeId((modeInfo.modeName || modeInfo.name || 'unknown').toLowerCase());
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
  const modeTitle = modeMap[modeId];

  // Show loading screen while getting info
  if (!windowType || windowId === null) {
    return <div>Loading Window Info...</div>;
  }

  // Render the ElectronApp component with the window info
  return (
    <ElectronApp
      windowInfo={{
        id: String(windowId),
        type: windowType,
        platform: modeId,
      }}
      windowTitle={`${windowType.charAt(0).toUpperCase() + windowType.slice(1)} Window`}
      appName={`Zubridge - ${modeTitle} Mode`}
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
