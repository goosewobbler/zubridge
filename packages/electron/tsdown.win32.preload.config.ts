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
// Windows-specific config for preload (sandboxed context, needs polyfills)
export default defineConfig({
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
});
