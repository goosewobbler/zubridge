import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        external: ['@zubridge/electron', '@zubridge/types', 'zustand', 'electron'],
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        external: ['electron', '@zubridge/electron', '@zubridge/electron/preload', '@zubridge/types', 'zustand'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
        external: ['electron', '@zubridge/electron', '@zubridge/ui', '@zubridge/ui/styles.css'],
      },
    },
  },
});
