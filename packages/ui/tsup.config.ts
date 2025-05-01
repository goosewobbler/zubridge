import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  external: ['react', 'react-dom', '@zubridge/electron', '@zubridge/tauri', '@tauri-apps/api/webviewWindow'],
  noExternal: ['clsx'],
  clean: true,
});
