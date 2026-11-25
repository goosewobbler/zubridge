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

export default defineConfig([
  // Renderer-safe entry point (default)
  {
    entry: ['src/renderer.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    deps: {
      neverBundle: (id) => {
        if (externalizeUnenvRuntime(id)) {
          return true;
        }
        return ['electron', 'zustand', 'zustand/vanilla'].includes(id);
      },
      alwaysBundle: ['@zubridge/utils', 'weald', '@wdio/logger'],
      onlyBundle: false,
    },
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
  },
  // Main process entry
  {
    entry: ['src/main.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    deps: {
      neverBundle: ['electron', 'zustand', 'zustand/vanilla', '@wdio/logger'],
      // weald is bundled because this package doesn't declare it; left external, the import
      // fails in consumers. @wdio/logger stays external: it's only loaded in WDIO E2E.
      alwaysBundle: ['@zubridge/utils', 'weald'],
      onlyBundle: false,
    },
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
  },
]);
