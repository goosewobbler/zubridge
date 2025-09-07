import type { Configuration } from 'electron-builder';

const config: Configuration = {
  appId: 'com.zubridge.basic-minimal',
  productName: 'Zubridge Basic Minimal',
  directories: {
    output: 'dist',
  },
  files: ['out/**/*', 'node_modules/**/*', 'package.json'],
  mac: {
    icon: 'resources/electron-logo.png',
  },
  win: {
    icon: 'resources/electron-logo.png',
  },
  linux: {
    icon: 'resources/electron-logo.png',
  },
};

export default config;
