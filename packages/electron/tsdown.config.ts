import { defineConfig } from 'tsdown';
import { createUnenvExternalPlugin, externalizeUnenvRuntime } from './scripts/build-utils.js';

// Unenv is used via plugin transformation, not aliases
// This prevents rolldown from resolving aliases to absolute paths

export default defineConfig([
  // Renderer-safe entry point (default)
  {
    entry: ['src/renderer.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    external: (id) => {
      if (externalizeUnenvRuntime(id)) return true;
      return ['electron', 'zustand', 'zustand/vanilla'].includes(id);
    },
    noExternal: ['@zubridge/core', 'weald', '@wdio/logger'],
    outDir: 'dist',
    clean: true,
    sourcemap: false,
    treeshake: true,
    platform: 'neutral',
    target: 'es2020',
    define: {
      global: 'global',
    },
    banner: {
      js: '// Renderer-safe build with polyfilled Node.js modules',
    },
    plugins: [createUnenvExternalPlugin()],
    inputOptions(options) {
      options.resolve = {
        ...options.resolve,
        mainFields: ['browser', 'module', 'main'],
      };
    },
    outExtensions({ format }) {
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
    external: ['electron', 'zustand', 'zustand/vanilla', 'weald', '@wdio/logger'],
    noExternal: ['@zubridge/core'],
    outDir: 'dist',
    clean: false,
    sourcemap: false,
    treeshake: true,
    platform: 'node',
    target: 'node18',
    banner: {
      js: '// Node.js build with bundled dependencies',
    },
    outExtensions({ format }) {
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
    external: (id) => {
      if (externalizeUnenvRuntime(id)) return true;
      return ['electron', 'zustand', 'zustand/vanilla', 'weald', '@wdio/logger'].includes(id);
    },
    noExternal: ['@zubridge/core'],
    outDir: 'dist',
    clean: false,
    sourcemap: false,
    treeshake: true,
    platform: 'node',
    target: 'node18',
    plugins: [createUnenvExternalPlugin()],
    outExtensions({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.js',
        dts: format === 'cjs' ? '.d.cts' : '.d.ts',
      };
    },
  },
]);
