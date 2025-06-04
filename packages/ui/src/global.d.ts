// Import app window augmentations
import type {} from '@zubridge/types/app';

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
