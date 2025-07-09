import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@zubridge/electron': resolve(__dirname, '../../packages/electron/src'),
        '@zubridge/types': resolve(__dirname, '../../packages/types/src'),
      },
      extensions: ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs'],
    },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        external: ['@zubridge/electron', '@zubridge/types', 'zustand', 'electron'],
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@zubridge/electron': resolve(__dirname, '../../packages/electron/src'),
        '@zubridge/types': resolve(__dirname, '../../packages/types/src'),
      },
      extensions: ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs'],
    },
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        external: ['electron', '@zubridge/electron', '@zubridge/types', 'zustand'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@zubridge/electron': resolve(__dirname, '../../packages/electron/dist'),
        '@zubridge/types': resolve(__dirname, '../../packages/types/dist'),
        '@zubridge/ui': resolve(__dirname, '../../packages/ui/dist'),
      },
      extensions: ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs'],
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
        external: ['electron'],
      },
    },
  },
});
