import { defineConfig } from 'tsup';

export default defineConfig([
  // Renderer-safe entry point (default)
  {
    entry: ['src/renderer.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    external: ['electron', 'zustand', 'zustand/vanilla'],
    noExternal: ['@zubridge/core', 'weald', '@wdio/logger'],
    outDir: 'dist',
    clean: true,
    bundle: true,
    splitting: false,
    sourcemap: false,
    treeshake: true,
    platform: 'neutral',
    target: 'es2020',
    esbuildOptions(options) {
      options.banner = {
        js: '// Renderer-safe build with polyfilled Node.js modules',
      };
      // Use esbuild's built-in Node.js polyfills for browser compatibility
      options.define = {
        ...options.define,
        global: 'global',
      };
      // Enable Node.js polyfills
      options.platform = 'browser';
      options.mainFields = ['browser', 'module', 'main'];
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
    external: ['electron', 'zustand', 'zustand/vanilla', 'weald', '@wdio/logger'],
    noExternal: ['@zubridge/core'],
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
    external: ['electron', 'zustand', 'zustand/vanilla', 'weald', '@wdio/logger'],
    noExternal: ['@zubridge/core'],
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
      // Replace process references for sandbox compatibility
      options.define = {
        ...options.define,
        // Replace process.platform with "linux" to use 60000ms timeout for all platforms
        'process.platform': '"linux"',
        // Replace process.env references with undefined for sandbox compatibility
        'process.env.WDIO': 'undefined',
        'process.env.WDIO_LOG_LEVEL': 'undefined',
        'process.env.DEBUG': 'undefined',
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
