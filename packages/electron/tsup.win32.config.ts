import { defineConfig } from 'tsup';

// Windows-specific config that builds entries sequentially to avoid heap corruption
// We cannot use an array of configs on Windows, so we build them one at a time via the build script
// This config just defines the renderer build - main and preload will be built separately

export default defineConfig({
  entry: ['src/renderer.ts', 'src/main.ts', 'src/preload.ts'],
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
  // Use neutral platform and es2020 target to support both node and browser contexts
  // This is a compromise - the original config has different settings per entry,
  // but on Windows we need sequential builds to avoid crashes
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
