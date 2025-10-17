import { defineConfig } from 'tsup';

// Windows-specific config that builds all entries in a single config
// This forces sequential builds to avoid heap corruption on Windows
export default defineConfig({
  entry: {
    renderer: 'src/renderer.ts',
    main: 'src/main.ts',
    preload: 'src/preload.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  outDir: 'dist',
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: false,
  treeshake: true,
  // Note: This single config approach means all entries share the same base options
  // The tsup.config.ts has different targets/platforms per entry, but on Windows
  // we trade that specificity for stability by using a unified config
  platform: 'node',
  target: 'node18',
  external: ['electron', 'zustand', 'zustand/vanilla'],
  noExternal: ['@zubridge/core', 'weald', '@wdio/logger', 'tty', 'util', 'fs', 'os', 'process'],
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
      dts: format === 'cjs' ? '.d.cts' : '.d.ts',
    };
  },
});
