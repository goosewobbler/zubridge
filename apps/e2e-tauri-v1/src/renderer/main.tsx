import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
// Import v1 APIs
import { getCurrent } from '@tauri-apps/api/window';
import { cleanupZubridge, initializeBridge } from '@zubridge/tauri';
import { withTauri } from '@zubridge/ui/tauri';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@zubridge/ui/styles.css';
import './styles/index.css';

// Create the Tauri app component
const TauriApp = withTauri();

type WindowType = 'main' | 'secondary' | 'runtime';

// App wrapper component to handle async loading
function AppWrapper() {
  const [windowType, setWindowType] = useState<WindowType>('main');
  const [windowLabel, setWindowLabel] = useState('main');
  const [bridgeInitialized, setBridgeInitialized] = useState(false);

  // Effect for setting up bridge and window info
  useEffect(() => {
    const setupApp = async () => {
      try {
        // Wait for Tauri v1 globals (if needed)
        while (
          !(window as { __TAURI__?: { invoke?: unknown; event?: { listen?: unknown } } })
            .__TAURI__ ||
          typeof (window as { __TAURI__?: { invoke?: unknown; event?: { listen?: unknown } } })
            .__TAURI__?.invoke !== 'function' ||
          typeof (window as { __TAURI__?: { invoke?: unknown; event?: { listen?: unknown } } })
            .__TAURI__?.event?.listen !== 'function'
        ) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        // Initialize Zubridge bridge
        await initializeBridge({
          invoke,
          listen: listen as unknown as <E = unknown>(
            event: string,
            handler: (event: E) => void,
          ) => Promise<() => void>,
          commands: {
            getInitialState: 'get_initial_state',
            dispatchAction: 'dispatch_action',
            stateUpdateEvent: 'zubridge://state-update',
          },
        });
        setBridgeInitialized(true);
        // Fetch window info using v1 API
        const currentWindow = getCurrent();
        const label = currentWindow.label;
        setWindowLabel(label);
        if (label.startsWith('runtime_')) {
          setWindowType('runtime');
        } else if (label === 'main') {
          setWindowType('main');
        } else {
          setWindowType('secondary');
        }
      } catch (_error) {
        setWindowLabel('error-label');
        setBridgeInitialized(false);
      }
    };
    setupApp();
    return () => {
      cleanupZubridge();
    };
  }, []);

  // Show loading screen while getting info & initializing bridge
  if (!bridgeInitialized) {
    return <div>Initializing Bridge...</div>;
  }

  // // Placeholder/noop handlers for Tauri
  // const actionHandlers = {
  //   createWindow: async () => ({ success: false, error: 'Not implemented' }),
  //   closeWindow: async () => ({ success: false, error: 'Not implemented' }),
  //   quitApp: async () => ({ success: false, error: 'Not implemented' }),
  //   doubleCounter: (_counter: number) => undefined,
  //   doubleCounterSlow: (_counter: number) => undefined,
  //   distinctiveCounter: (_counter: number) => undefined,
  //   distinctiveCounterSlow: (_counter: number) => undefined,
  //   doubleCounterWithGetStateOverride: (_counter: number) => undefined,
  // };

  // // Subscription handlers (no-op for now)
  // const handleSubscribe = async (_keys: string[]) => {};
  // const handleUnsubscribe = async (_keys: string[]) => {};

  return (
    <TauriApp
      windowInfo={{
        id: windowLabel,
        type: windowType,
        platform: 'tauri-v1',
      }}
      windowTitle={`${windowType.charAt(0).toUpperCase() + windowType.slice(1)} Window`}
      appName={'Zubridge - Tauri v1 Example'}
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
