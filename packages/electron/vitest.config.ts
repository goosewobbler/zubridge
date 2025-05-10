import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts{,x}'],
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      enabled: true,
      include: ['src/**/*'],
      exclude: ['src/types.ts'],
      thresholds: {
        lines: 50,
        functions: 70,
        branches: 70,
        statements: 50,
      },
    },
  },
  resolve: {
    alias: {
      '@zubridge/types': resolve(__dirname, '../types/dist/index.js'),
    },
  },
});
