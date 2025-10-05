import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/electron.ts', 'src/tauri.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  external: [
    'react',
    'react-dom',
    '@zubridge/electron',
    '@zubridge/tauri',
    '@zubridge/utils',
    '@tauri-apps/api/webviewWindow',
  ],
  noExternal: ['clsx'],
  clean: true,
});
