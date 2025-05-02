const sharedConfig = {
  plugins: [],
  external: ['electron', 'zustand', 'zustand/vanilla', 'uuid'],
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
      exports: 'auto',
      globals: {
        uuid: 'uuid',
      },
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
