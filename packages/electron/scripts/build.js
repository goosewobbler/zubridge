#!/usr/bin/env node
import { spawn } from 'node:child_process';

// Set TSUP_WORKERS=1 on Windows to avoid heap corruption
if (process.platform === 'win32') {
  process.env.TSUP_WORKERS = '1';
}

// Run tsup
const tsup = spawn('tsup', [], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

tsup.on('exit', (code) => {
  process.exit(code ?? 1);
});
