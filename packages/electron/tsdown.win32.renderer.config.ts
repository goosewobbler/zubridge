import { defineConfig } from 'tsdown';
import { createUnenvExternalPlugin, externalizeUnenvRuntime } from './scripts/build-utils.js';

// Unenv is used via plugin transformation, not aliases
// This prevents rolldown from resolving aliases to absolute paths

// Windows-specific config for renderer (browser context)
export default defineConfig({
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
});
