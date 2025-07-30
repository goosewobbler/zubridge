import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const sharedConfig = {
  plugins: [
    nodeResolve({
      preferBuiltins: true,
    }),
    commonjs({
      // Handle modules that use 'this' in UMD pattern
      transformMixedEsModules: true,
    }),
  ],
  external: ['electron', 'zustand', 'zustand/vanilla'],
  // Handle 'this' context issues
  context: 'globalThis',
};

export default [
  // CJS builds
  {
    input: './dist/main.js',
    output: {
      file: './dist/main.cjs',
      format: 'cjs',
    },
    ...sharedConfig,
  },
  {
    input: './dist/preload.js',
    output: {
      file: './dist/preload.cjs',
      format: 'cjs',
    },
    ...sharedConfig,
  },
  {
    input: './dist/index.js',
    output: {
      file: './dist/index.cjs',
      format: 'cjs',
    },
    ...sharedConfig,
  },
  // ESM builds with bundled dependencies
  {
    input: './dist/main.js',
    output: {
      file: './dist/main.js',
      format: 'es',
    },
    ...sharedConfig,
  },
  {
    input: './dist/preload.js',
    output: {
      file: './dist/preload.js',
      format: 'es',
    },
    ...sharedConfig,
  },
  {
    input: './dist/index.js',
    output: {
      file: './dist/index.js',
      format: 'es',
    },
    ...sharedConfig,
  },
];
