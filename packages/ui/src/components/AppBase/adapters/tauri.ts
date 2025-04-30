import type { PlatformHandlers } from '../WindowInfo';

/**
 * Configuration for the Tauri adapter
 */
export interface TauriAdapterConfig {
  /**
   * The WebviewWindow constructor from Tauri
   */
  WebviewWindow: any;

  /**
   * The invoke function from Tauri
   */
  invoke?: any;

  /**
   * The current window label
   */
  windowLabel: string;

  /**
   * Whether this is Tauri v1 (defaults to false, meaning it's v2+)
   */
  isV1?: boolean;
}

/**
 * Creates platform-specific handlers for Tauri
 *
 * @param config - Configuration for the Tauri adapter
 * @returns Platform-specific handlers
 */
export function createTauriAdapter(config: TauriAdapterConfig): PlatformHandlers {
  const { WebviewWindow, invoke, windowLabel, isV1 = false } = config;

  return {
    createWindow: async () => {
      try {
        const uniqueLabel = `runtime_${Date.now()}`;

        // Create a new window
        const webview = new WebviewWindow(uniqueLabel, {
          url: window.location.pathname,
          title: `Runtime Window (${uniqueLabel})`,
          width: 600,
          height: 485,
        });

        // Set up event listeners
        const createdPromise = new Promise<boolean>((resolve) => {
          webview.once('tauri://created', () => {
            console.log(`Window ${uniqueLabel} created`);
            resolve(true);
          });

          webview.once('tauri://error', (e: any) => {
            console.error(`Failed to create window ${uniqueLabel}:`, e);
            resolve(false);
          });

          // If no event is fired within 2 seconds, assume success
          setTimeout(() => resolve(true), 2000);
        });

        const success = await createdPromise;
        return { success, id: uniqueLabel };
      } catch (error) {
        console.error('Error creating window:', error);
        return { success: false };
      }
    },

    closeWindow: async () => {
      try {
        // Get window by label
        const currentWindow = await WebviewWindow.getByLabel(windowLabel);

        if (currentWindow) {
          await currentWindow.close();
          return { success: true };
        } else {
          console.warn(`WebviewWindow.getByLabel returned null for label: ${windowLabel}`);
          return { success: false };
        }
      } catch (error) {
        console.error('Error closing window:', error);
        return { success: false };
      }
    },

    quitApp: async () => {
      try {
        if (invoke) {
          // The command name might be different between versions
          const command = isV1 ? 'quit_app' : 'plugin:zubridge|quit_app';
          await invoke(command);
          return { success: true };
        } else {
          console.warn('invoke function not provided to Tauri adapter');
          return { success: false };
        }
      } catch (error) {
        console.error('Error quitting app:', error);
        return { success: false };
      }
    },
  };
}
