#!/usr/bin/env node
import { spawn } from 'node:child_process';

function runTsup(args = []) {
  return new Promise((resolve, reject) => {
    const tsup = spawn('tsup', args, {
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });

    tsup.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tsup exited with code ${code}`));
      }
    });

    tsup.on('error', reject);
  });
}

async function build() {
  if (process.platform === 'win32') {
    // On Windows, use tsup.win32.config.ts which builds sequentially
    console.log('Building on Windows - using sequential config');
    try {
      await runTsup(['--config', 'tsup.win32.config.ts']);
      process.exit(0);
    } catch (error) {
      console.error('Build failed:', error);
      process.exit(1);
    }
  } else {
    // On Unix systems, use the default config with parallel builds
    try {
      await runTsup();
      process.exit(0);
    } catch (error) {
      console.error('Build failed:', error);
      process.exit(1);
    }
  }
}

build();
