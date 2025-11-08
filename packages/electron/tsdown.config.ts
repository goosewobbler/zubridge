import { defineConfig } from 'tsdown';
import { defineEnv } from 'unenv';

const { env } = defineEnv({
  nodeCompat: true,
  npmShims: true,
  resolve: true,
  overrides: {},
  presets: [],
});

const { alias } = env;

// Externalize unenv runtime modules to avoid bundling issues
const externalizeUnenvRuntime = (id: string) => {
  return (
    id.includes('unenv/dist/runtime') ||
    id.includes('unenv/runtime') ||
    id.includes('unenv\\dist\\runtime') ||
    id.includes('unenv\\runtime')
  );
};

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
    alias,
    outExtensions({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.js',
        dts: format === 'cjs' ? '.d.cts' : '.d.ts',
      };
    },
  },
]);
