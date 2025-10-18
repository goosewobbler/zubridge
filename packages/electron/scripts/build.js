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
    // On Windows, build each entry point separately to avoid heap corruption
    console.log('Building on Windows - using sequential builds per entry');
    try {
      // Build renderer (browser context)
      console.log('Building renderer...');
      await runTsup(['--config', 'tsup.win32.renderer.config.ts']);

      // Build main (node context)
      console.log('Building main...');
      await runTsup(['--config', 'tsup.win32.node.config.ts', '--entry.main', 'src/main.ts']);

      // Build preload (node context)
      console.log('Building preload...');
      await runTsup(['--config', 'tsup.win32.node.config.ts', '--entry.preload', 'src/preload.ts']);

      console.log('Windows build completed successfully');
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
