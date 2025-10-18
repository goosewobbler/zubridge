#!/usr/bin/env tsx

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const isWindows = process.platform === 'win32';
const cacheDir = '.turbo';

if (!existsSync(cacheDir)) {
  console.log('No cache directory found, skipping clean');
  process.exit(0);
}

try {
  if (isWindows) {
    // Use Windows native rmdir which handles file locks better
    execSync(`rmdir /s /q "${cacheDir}"`, { stdio: 'inherit' });
  } else {
    // Use Unix rm
    execSync(`rm -rf "${cacheDir}"`, { stdio: 'inherit' });
  }
  console.log('Cache cleaned successfully');
} catch (error) {
  console.warn('Cache clean failed (this is usually safe to ignore):', error.message);
  // Don't fail the build if cache clean fails
  process.exit(0);
}
