#!/usr/bin/env tsx

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const WORKFLOW_FILES = [
  join(ROOT, '.github/workflows/_release.reusable.yml'),
  join(ROOT, '.github/workflows/_standing-pr-update.reusable.yml'),
  join(ROOT, '.github/workflows/release-preview.yml'),
  join(ROOT, '.github/workflows/release.yml'),
];

function fetchLatestVersion(): string {
  const output = execSync('npm view @releasekit/release version', { encoding: 'utf8' });
  return output.trim();
}

function updatePackageJson(version: string) {
  const path = join(ROOT, 'package.json');
  const content = readFileSync(path, 'utf8');
  const pkg = JSON.parse(content) as { devDependencies?: Record<string, string> };

  if (!pkg.devDependencies?.['@releasekit/release']) {
    throw new Error('@releasekit/release not found in root package.json devDependencies');
  }

  pkg.devDependencies['@releasekit/release'] = `^${version}`;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`  ✓ package.json: @releasekit/release → ^${version}`);
}

function updateWorkflowFile(path: string, version: string) {
  const content = readFileSync(path, 'utf8');
  const updated = content.replace(
    /goosewobbler\/releasekit@v[\d.]+/g,
    `goosewobbler/releasekit@v${version}`,
  );

  if (content === updated) {
    console.log(`  - ${path.replace(ROOT + '/', '')}: no occurrences found`);
    return;
  }

  writeFileSync(path, updated);
  const count = (updated.match(/goosewobbler\/releasekit@v[\d.]+/g) ?? []).length;
  console.log(`  ✓ ${path.replace(ROOT + '/', '')}: ${count} occurrence(s) → v${version}`);
}

function runCommand(command: string, cwd: string) {
  execSync(command, { cwd, stdio: 'inherit' });
}

function main() {
  console.log('\n📡 Fetching latest @releasekit/release version from npm...');
  const version = fetchLatestVersion();
  console.log(`   Latest: v${version}\n`);

  console.log(`🔧 Updating releasekit to v${version}\n`);

  updatePackageJson(version);
  for (const file of WORKFLOW_FILES) {
    updateWorkflowFile(file, version);
  }

  console.log('\n📦 Running pnpm install...');
  runCommand('pnpm install', ROOT);

  console.log('\n📌 Staging changes...');
  runCommand('git add .', ROOT);

  console.log(`\n✅ Done — releasekit updated to v${version}`);
}

main();
