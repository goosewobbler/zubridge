#!/usr/bin/env node
import { spawn } from 'node:child_process';

function runTsdown(args = []) {
  return new Promise((resolve, reject) => {
    const tsdown = spawn('tsdown', args, {
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });

    tsdown.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tsdown exited with code ${code}`));
      }
    });

    tsdown.on('error', reject);
  });
}

async function build() {
  if (process.platform === 'win32') {
    // On Windows, build each entry point separately to avoid heap corruption
    console.log('Building on Windows - using sequential builds per entry');
    try {
      // Build renderer (browser context)
      console.log('Building renderer...');
      await runTsdown(['--config', 'tsdown.win32.renderer.config.ts']);

      // Build main (node context)
      console.log('Building main...');
      await runTsdown(['--config', 'tsdown.win32.node.config.ts', '--entry.main', 'src/main.ts']);

      // Build preload (sandboxed context, needs polyfills)
      console.log('Building preload...');
      await runTsdown(['--config', 'tsdown.win32.preload.config.ts']);

      console.log('Windows build completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Build failed:', error);
      process.exit(1);
    }
  } else {
    // On Unix systems, use the default config with parallel builds
    try {
      await runTsdown();
      process.exit(0);
    } catch (error) {
      console.error('Build failed:', error);
      process.exit(1);
    }
  }
}

build();
