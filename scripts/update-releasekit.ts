#!/usr/bin/env tsx

// Bump releasekit to the latest version in one shot: the @releasekit/release
// devDep in package.json AND every `goosewobbler/releasekit@vX.Y.Z` action ref
// in the workflow YAMLs.
//
// Version-sync assumption: the @releasekit/release npm package version and the
// goosewobbler/releasekit git tag are released together from the same source
// repo, so they always carry the same version string. This holds in practice
// because releasekit's own release pipeline tags + publishes atomically — but
// if the two ever drift (npm version exists, action tag missing), we'd silently
// write a workflow ref that 404s at runtime. To guard against that, we verify
// the GitHub release tag exists before writing the workflow files.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const RELEASEKIT_REPO = 'goosewobbler/releasekit';

const WORKFLOW_FILES = [
  join(ROOT, '.github/workflows/_release.reusable.yml'),
  join(ROOT, '.github/workflows/_standing-pr-update.reusable.yml'),
  join(ROOT, '.github/workflows/release-preview.yml'),
  join(ROOT, '.github/workflows/release.yml'),
];

function fetchLatestNpmVersion(): string {
  const output = execSync('npm view @releasekit/release version', { encoding: 'utf8' });
  return output.trim();
}

// Confirm `goosewobbler/releasekit@v${version}` exists as a git tag before we
// commit to writing it into the workflow YAMLs. `git ls-remote --tags` is the
// cheapest source of truth — no gh CLI auth required, works without network
// proxies, and probes the tag directly rather than the GitHub Releases API
// (which can lag the underlying tag by a few seconds after a release).
function verifyActionTagExists(version: string) {
  const tagRef = `refs/tags/v${version}`;
  const output = execSync(
    `git ls-remote --tags https://github.com/${RELEASEKIT_REPO}.git ${tagRef}`,
    { encoding: 'utf8' },
  );
  if (!output.trim()) {
    throw new Error(
      `Tag v${version} is not present on ${RELEASEKIT_REPO}. The npm package and ` +
        'action tag have drifted — investigate before updating workflow refs.',
    );
  }
}

function updatePackageJson(version: string) {
  const path = join(ROOT, 'package.json');
  const content = readFileSync(path, 'utf8');
  const updated = content.replace(
    /"@releasekit\/release":\s*"\^?[\d.]+"/,
    `"@releasekit/release": "^${version}"`,
  );

  if (content === updated) {
    throw new Error('@releasekit/release not found in root package.json devDependencies');
  }

  writeFileSync(path, updated);
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
  const version = fetchLatestNpmVersion();
  console.log(`   Latest: v${version}`);

  console.log(`\n🔍 Verifying ${RELEASEKIT_REPO}@v${version} action tag exists...`);
  verifyActionTagExists(version);
  console.log('   Tag confirmed.\n');

  console.log(`🔧 Updating releasekit to v${version}\n`);

  updatePackageJson(version);
  for (const file of WORKFLOW_FILES) {
    updateWorkflowFile(file, version);
  }

  console.log('\n📦 Running pnpm install...');
  runCommand('pnpm install', ROOT);

  console.log('\n📌 Staging changes...');
  const filesToStage = [
    'package.json',
    'pnpm-lock.yaml',
    ...WORKFLOW_FILES.map((f) => f.replace(ROOT + '/', '')),
  ];
  runCommand(`git add ${filesToStage.join(' ')}`, ROOT);

  console.log(`\n✅ Done — releasekit updated to v${version}`);
}

main();
