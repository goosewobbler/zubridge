// Global interface extensions
interface Window {
  // Electron API exposed through contextBridge
  electron?: {
    createWindow: () => Promise<{ id: string | number }>;
    closeWindow: () => Promise<void>;
    quitApp: () => Promise<void>;
  };

  // Any other global interfaces needed
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
