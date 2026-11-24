import { defineConfig } from 'tsdown';
import { defineEnv } from 'unenv';
import { createUnenvExternalPlugin, externalizeUnenvRuntime } from './scripts/build-utils.js';

const { env } = defineEnv({
  nodeCompat: true,
  npmShims: true,
  resolve: false,
  overrides: {},
  presets: [],
});

const { alias } = env;
// Windows-specific config for preload (sandboxed context, needs polyfills)
export default defineConfig({
  entry: ['src/preload.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  deps: {
    neverBundle: (id) => {
      if (externalizeUnenvRuntime(id)) {
        return true;
      }
      return ['electron', 'zustand', 'zustand/vanilla', '@wdio/logger'].includes(id);
    },
    alwaysBundle: ['@zubridge/utils', 'weald'],
    onlyBundle: false,
  },
  outDir: 'dist',
  clean: false,
  sourcemap: false,
  treeshake: true,
  platform: 'node',
  target: 'node18',
  alias,
  plugins: [createUnenvExternalPlugin()],
  outExtensions({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
      dts: format === 'cjs' ? '.d.cts' : '.d.ts',
    };
  },
});
