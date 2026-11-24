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

// Windows-specific config for renderer (browser context)
export default defineConfig({
  entry: ['src/renderer.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  external: (id) => {
    if (externalizeUnenvRuntime(id)) return true;
    return ['electron', 'zustand', 'zustand/vanilla'].includes(id);
  },
  noExternal: ['@zubridge/utils', 'weald', '@wdio/logger'],
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  // Drop unused @oxc-project/runtime helper imports: left as bare side-effect imports they
  // reach the consumer's renderer unresolved and break module loading.
  treeshake: {
    moduleSideEffects: (id: string) => !id.includes('@oxc-project/runtime'),
  },
  platform: 'neutral',
  target: 'es2020',
  define: {
    global: 'global',
  },
  banner: {
    js: '// Renderer-safe build with polyfilled Node.js modules',
  },
  alias,
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
