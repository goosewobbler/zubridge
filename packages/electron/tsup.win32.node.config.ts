import { defineConfig } from 'tsup';

// Windows-specific config for main and preload (node context)
// Entry point is specified via CLI argument
export default defineConfig({
  format: ['esm', 'cjs'],
  dts: true,
  external: ['electron', 'zustand', 'zustand/vanilla'],
  noExternal: ['@zubridge/core', 'weald', '@wdio/logger', 'tty', 'util', 'fs', 'os', 'process'],
  outDir: 'dist',
  clean: false,
  bundle: true,
  splitting: false,
  sourcemap: false,
  treeshake: true,
  platform: 'node',
  target: 'node18',
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
      dts: format === 'cjs' ? '.d.cts' : '.d.ts',
    };
  },
});
