import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { debug } from '@zubridge/core';
import { cleanupZubridge, initializeBridge } from '@zubridge/tauri';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@zubridge/ui/styles.css';
import './styles/index.css';
import { AppRoot } from './App.js';

function AppBootstrap() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = WebviewWindow.getCurrent();
        if (cancelled) return;
        setWindowLabel(current.label);
        await initializeBridge({
          invoke: invoke as <R = unknown>(
            cmd: string,
            args?: unknown,
            options?: unknown,
          ) => Promise<R>,
          listen: listen as <E = unknown>(
            event: string,
            handler: (event: E) => void,
          ) => Promise<UnlistenFn>,
        });
        if (!cancelled) setBridgeReady(true);
      } catch (error) {
        debug('ui:error', `Bridge initialization failed: ${error}`);
        if (!cancelled) setBridgeError(String(error));
      }
    })();
    return () => {
      cancelled = true;
      cleanupZubridge();
    };
  }, []);

  if (bridgeError) {
    return <div>Bridge initialization failed: {bridgeError}</div>;
  }
  if (!bridgeReady || !windowLabel) {
    return <div>Initializing Bridge...</div>;
  }

  return <AppRoot windowLabel={windowLabel} />;
}

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <AppBootstrap />
  </React.StrictMode>,
);
