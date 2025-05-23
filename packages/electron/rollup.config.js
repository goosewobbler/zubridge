import nodeResolve from '@rollup/plugin-node-resolve';

const sharedConfig = {
  plugins: [
    nodeResolve({
      preferBuiltins: true,
    }),
  ],
  external: ['electron', 'zustand', 'zustand/vanilla', '@wdio/logger'],
};

export default [
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
];
