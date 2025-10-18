import { defineConfig } from 'tsup';

// Windows-specific config for renderer (browser context)
export default defineConfig({
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
    options.platform = 'browser';
    options.mainFields = ['browser', 'module', 'main'];
    options.define = {
      ...options.define,
      global: 'global',
    };
  },
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
      dts: format === 'cjs' ? '.d.cts' : '.d.ts',
    };
  },
});
