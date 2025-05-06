// Global interface extensions
interface Window {
  // Electron API exposed through contextBridge
  electronAPI?: {
    createRuntimeWindow: () => Promise<{ success: boolean; windowId: number }>;
    closeCurrentWindow: () => Promise<void>;
    quitApp: () => Promise<void>;
    getWindowInfo: () => Promise<{ id: number; type: string }>;
    getMode: () => Promise<{ modeName: string; name?: string }>;
  };
  counter?: {
    executeMainThunk: () => Promise<{ success: boolean; result?: number }>;
  };
}

// Add module declarations for external modules
declare module '@zubridge/electron';
declare module '@zubridge/tauri';

// Add declaration for Tauri modules
declare module '@tauri-apps/api/webviewWindow' {
  export class WebviewWindow {
    static getByLabel(label: string): WebviewWindow | null;
    constructor(
      label: string,
      options: {
        url: string;
        title: string;
        width: number;
        height: number;
        [key: string]: any;
      },
    );
    close(): Promise<void>;
  }
}
