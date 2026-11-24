import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/electron.ts', 'src/tauri.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  deps: {
    neverBundle: [
      'react',
      'react-dom',
      '@zubridge/electron',
      '@zubridge/tauri',
      '@zubridge/utils',
      '@tauri-apps/api/webviewWindow',
    ],
    alwaysBundle: ['clsx'],
    onlyBundle: false,
  },
  clean: true,
  outExtensions({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
      dts: format === 'cjs' ? '.d.cts' : '.d.ts',
    };
  },
});
