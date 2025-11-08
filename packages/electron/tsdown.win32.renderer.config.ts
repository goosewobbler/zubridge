import { defineConfig } from 'tsdown';
import { defineEnv } from 'unenv';
import { externalizeUnenvRuntime } from './scripts/build-utils.js';

const { env } = defineEnv({
  nodeCompat: true,
  npmShims: true,
  resolve: true,
  overrides: {},
  presets: [],
});

const { alias } = env;

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
  alias,
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
