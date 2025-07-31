import { defineConfig } from 'tsup';

export default defineConfig([
  // Main entry point - dual ESM/CJS (renderer-safe)
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    external: ['electron', 'zustand', 'zustand/vanilla'],
    noExternal: ['@zubridge/core', 'weald', '@wdio/logger', 'tty', 'util', 'fs', 'os', 'process'],
    outDir: 'dist',
    clean: true,
    bundle: true,
    splitting: false,
    sourcemap: false,
    treeshake: true,
    platform: 'neutral',
    target: 'es2020',
    esbuildOptions(options) {
      options.define = {
        ...options.define,
        global: 'globalThis',
      };
      options.inject = [];
      options.banner = {
        js: '// ESM build with bundled dependencies',
      };
    },
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
    external: ['electron', 'zustand', 'zustand/vanilla'],
    noExternal: ['@zubridge/core', 'weald', '@wdio/logger'],
    outDir: 'dist',
    clean: false,
    bundle: true,
    splitting: false,
    sourcemap: false,
    treeshake: true,
    platform: 'node',
    target: 'node18',
    esbuildOptions(options) {
      options.banner = {
        js: '// Node.js build with bundled dependencies',
      };
    },
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
    external: ['electron', 'zustand', 'zustand/vanilla'],
    noExternal: ['@zubridge/core', 'weald', '@wdio/logger'],
    outDir: 'dist',
    clean: false,
    bundle: true,
    splitting: false,
    sourcemap: false,
    treeshake: true,
    platform: 'node',
    target: 'node18',
    esbuildOptions(options) {
      options.banner = {
        js: '// Node.js build with bundled dependencies',
      };
    },
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.js',
        dts: format === 'cjs' ? '.d.cts' : '.d.ts',
      };
    },
  },
]);
