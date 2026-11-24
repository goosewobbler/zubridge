const sharedConfig = {
  plugins: [],
  external: ['react', '@zubridge/utils', /^@tauri-apps\/api/, 'zustand', 'zustand/vanilla'],
};

export default [
  {
    input: './dist/index.js',
    output: {
      file: './dist/index.cjs',
      format: 'cjs',
    },
    ...sharedConfig,
  },
];
