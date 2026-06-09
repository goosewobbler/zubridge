// Combine per-mode bench results (`benches/raw/<mode>.json` from each WDIO
// run) into a single `benches/baseline.json` committed as the v3.0 baseline.
//
// Run by `pnpm bench:electron` after each mode-specific run completes; safe
// to invoke standalone after a partial run as well.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import type { ModeBenchResult } from '../e2e/utils/bench.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(REPO_ROOT, 'benches', 'raw');
const BASELINE_PATH = path.join(REPO_ROOT, 'benches', 'baseline.json');

interface Baseline {
  capturedAt: string;
  platform: string;
  node: string;
  electron?: string;
  zubridgeElectron?: string;
  modes: Record<string, Omit<ModeBenchResult, 'mode'>>;
}

function readJsonOrNull<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function loadElectronVersion(): string | undefined {
  const file = path.join(REPO_ROOT, 'apps', 'electron', 'e2e', 'package.json');
  const pkg = readJsonOrNull<{ devDependencies?: Record<string, string> }>(file);
  return pkg?.devDependencies?.electron;
}

function loadZubridgeElectronVersion(): string | undefined {
  const file = path.join(REPO_ROOT, 'packages', 'electron', 'package.json');
  const pkg = readJsonOrNull<{ version?: string }>(file);
  return pkg?.version;
}

function main(): void {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`No raw results found at ${RAW_DIR}. Run a bench script first.`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(RAW_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(RAW_DIR, name));

  if (files.length === 0) {
    console.error(`No JSON results in ${RAW_DIR}.`);
    process.exit(1);
  }

  const modes: Baseline['modes'] = {};
  for (const file of files) {
    const result = readJsonOrNull<ModeBenchResult>(file);
    if (!result || !result.mode) {
      console.warn(`Skipping ${file}: not a valid ModeBenchResult`);
      continue;
    }
    const { mode, ...rest } = result;
    modes[mode] = rest;
  }

  const baseline: Baseline = {
    capturedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    electron: loadElectronVersion(),
    zubridgeElectron: loadZubridgeElectronVersion(),
    modes,
  };

  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`Wrote baseline to ${BASELINE_PATH}`);
  console.log(`Modes: ${Object.keys(modes).join(', ')}`);
}

main();
