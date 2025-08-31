import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const isWindows = process.platform === 'win32';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        external: [
          'electron',
          '@zubridge/electron',
          '@zubridge/electron/main',
          '@zubridge/types',
          'zustand',
        ],
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        external: [
          'electron',
          '@zubridge/electron',
          '@zubridge/electron/preload',
          '@zubridge/types',
          'zustand',
        ],
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
        external: ['electron'],
      },
    },
    // workaround for windows path issue
    // see https://github.com/alex8088/electron-vite/issues/802
    ...(isWindows && {
      resolve: {
        preserveSymlinks: true,
      },
    }),
  },
});
