import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/electron.ts', 'src/tauri.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  external: [
    'react',
    'react-dom',
    '@zubridge/electron',
    '@zubridge/tauri',
    '@zubridge/core',
    '@tauri-apps/api/webviewWindow',
  ],
  noExternal: ['clsx'],
  clean: true,
  outExtensions({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
      dts: format === 'cjs' ? '.d.cts' : '.d.ts',
    };
  },
});
