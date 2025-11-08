import { defineConfig } from 'tsdown';
import { createUnenvExternalPlugin, externalizeUnenvRuntime } from './scripts/build-utils.js';

// Unenv is used via plugin transformation, not aliases
// This prevents rolldown from resolving aliases to absolute paths
// Windows-specific config for preload (sandboxed context, needs polyfills)
export default defineConfig({
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
});
