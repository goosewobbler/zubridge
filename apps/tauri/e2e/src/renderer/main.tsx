import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { cleanupZubridge, initializeBridge } from '@zubridge/tauri';
import { debug } from '@zubridge/utils';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@zubridge/ui/styles.css';
import './styles/index.css';
import { AppRoot } from './App.js';

const renderError = (label: string, message: string, stack?: string) => {
  const root = document.body || document.documentElement;
  if (!root) return;
  let panel = document.getElementById('__renderer_error__');
  if (!panel) {
    panel = document.createElement('pre');
    panel.id = '__renderer_error__';
    panel.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;margin:0;padding:16px;background:#1e1b4b;color:#fca5a5;font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap;overflow:auto;';
    root.appendChild(panel);
  }
  panel.textContent = `${panel.textContent ?? ''}\n[${label}] ${message}\n${stack ?? ''}`.trim();
};

window.addEventListener('error', (event) => {
  const err = event.error ?? event.message;
  const message = err instanceof Error ? err.message : String(err);
  renderError('window.onerror', message, err instanceof Error ? err.stack : undefined);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  renderError('unhandledrejection', message, reason instanceof Error ? reason.stack : undefined);
});

// Load the WebDriverIO Tauri frontend plugin so `window.wdioTauri` is available
// for the test runner. Fire-and-forget — the plugin's own waitForInit / retry
// logic handles ordering vs Tauri's globals.
import('@wdio/tauri-plugin').catch((error) => {
  // Non-fatal: tests will fail loudly if this never arrives, but the app itself
  // doesn't need it to function.
  console.warn('[App] @wdio/tauri-plugin failed to load:', error);
});

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
        // Expose the backend-thunk hooks the shared UI's "Main Thunk" buttons
        // call. On Tauri these invoke Rust commands that drive a backend thunk;
        // Electron exposes the equivalent from its Node main process via preload.
        window.counter = {
          executeMainThunk: () => invoke('execute_main_thunk'),
          executeMainThunkSlow: () => invoke('execute_main_thunk_slow'),
        };
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
