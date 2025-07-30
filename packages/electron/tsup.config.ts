import { defineConfig } from 'tsup';

export default defineConfig([
  // Main entry point - dual ESM/CJS
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    external: ['electron', 'zustand', 'zustand/vanilla', '@zubridge/core'],
    outDir: 'dist',
    clean: true,
    bundle: true,
    splitting: false,
    sourcemap: false,
    treeshake: true,
    platform: 'node',
    target: 'node18',
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.js',
        dts: format === 'cjs' ? '.d.cts' : '.d.ts',
      };
    },
  },
  // Main process entry
  {
    entry: ['src/main.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    external: ['electron', 'zustand', 'zustand/vanilla', '@zubridge/core'],
    outDir: 'dist',
    clean: false,
    bundle: true,
    splitting: false,
    sourcemap: false,
    treeshake: true,
    platform: 'node',
    target: 'node18',
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.js',
        dts: format === 'cjs' ? '.d.cts' : '.d.ts',
      };
    },
  },
  // Preload entry
  {
    entry: ['src/preload.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    external: ['electron', 'zustand', 'zustand/vanilla', '@zubridge/core'],
    outDir: 'dist',
    clean: false,
    bundle: true,
    splitting: false,
    sourcemap: false,
    treeshake: true,
    platform: 'node',
    target: 'node18',
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.js',
        dts: format === 'cjs' ? '.d.cts' : '.d.ts',
      };
    },
  },
]);
