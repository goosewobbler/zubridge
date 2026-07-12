#!/usr/bin/env node

/**
 * Publishability guard for the workspace's public packages.
 *
 * Reproduces the two failure modes behind issue #194, neither of which the
 * package E2E harness (run-package-e2e.ts) can catch: it installs from local
 * tarballs, uses pnpm (which tolerates the `workspace:` protocol), and
 * overrides every @zubridge/* dependency to a local file.
 *
 *   1. Protocol lint — packs each publishable package with `pnpm pack` (the
 *      same workspace-protocol rewrite path `pnpm publish` uses) and fails if
 *      any dependency field in the packed manifest still carries a
 *      `workspace:`, `link:`, or `file:` protocol. A correctly published
 *      tarball has none; a `workspace:*` that survives is exactly what npm
 *      rejects with EUNSUPPORTEDPROTOCOL.
 *
 *   2. Clean-room install — installs the packed tarball into a throwaway
 *      project with the *npm* client (no workspace, no overrides), exactly as
 *      an end user would. Catches EUNSUPPORTEDPROTOCOL and unresolvable (e.g.
 *      unpublished) @zubridge/* runtime deps.
 *
 * Requires the packages to be built first (dist must exist). Wired into CI's
 * Code Quality job.
 *
 * Usage: tsx scripts/check-publishable.ts
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const PACKAGES_DIR = path.join(ROOT, 'packages');
const DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'];
const FORBIDDEN_PROTOCOL = /^(workspace|link|file):/;

// Packages exercised with a real npm install. Limited to those expected to have
// no unpublished cross-package runtime deps (electron bundles @zubridge/utils).
const INSTALL_SMOKE = ['@zubridge/electron'];

type PackedPackage = {
  name: string;
  tarball: string;
  manifest: Record<string, unknown>;
};

function run(file: string, args: string[], cwd: string): string {
  return execFileSync(file, args, { cwd, encoding: 'utf-8' }).toString();
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const stderr = (error as { stderr?: string }).stderr ?? '';
  const text = (stderr.trim() || message).trim();
  return text.split('\n')[0] ?? text;
}

function findPublishablePackages(): { name: string; dir: string }[] {
  const result: { name: string; dir: string }[] = [];
  for (const entry of fs.readdirSync(PACKAGES_DIR)) {
    const dir = path.join(PACKAGES_DIR, entry);
    const pkgJsonPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    if (pkg.name && !pkg.private) {
      result.push({ name: pkg.name, dir });
    }
  }
  return result;
}

function packPackage(dir: string, dest: string): string {
  run('pnpm', ['pack', '--pack-destination', dest], dir);
  const tarballs = fs.readdirSync(dest).filter((f) => f.endsWith('.tgz'));
  const tarball = tarballs[0];
  if (!tarball) {
    throw new Error(`pnpm pack produced no tarball for ${dir}`);
  }
  return path.join(dest, tarball);
}

function readManifestFromTarball(tarball: string): Record<string, unknown> {
  return JSON.parse(run('tar', ['-xzOf', tarball, 'package/package.json'], ROOT));
}

function lintManifest(pkg: PackedPackage): string[] {
  const violations: string[] = [];
  for (const field of DEP_FIELDS) {
    const deps = pkg.manifest[field];
    if (!deps || typeof deps !== 'object') continue;
    for (const [name, spec] of Object.entries(deps as Record<string, string>)) {
      if (typeof spec === 'string' && FORBIDDEN_PROTOCOL.test(spec)) {
        violations.push(`${pkg.name}: ${field}.${name} = "${spec}"`);
      }
    }
  }
  return violations;
}

function installSmoke(tarball: string): void {
  const smokeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zubridge-install-smoke-'));
  try {
    fs.writeFileSync(
      path.join(smokeDir, 'package.json'),
      JSON.stringify({ name: 'install-smoke', version: '0.0.0', private: true }, null, 2),
    );
    // npm is the client end users use and the one that rejects `workspace:`.
    // --omit=peer skips the heavy electron/redux peer frameworks; the
    // dependency-tree resolution where #194 failed still runs.
    run(
      'npm',
      [
        'install',
        tarball,
        '--omit=peer',
        '--omit=optional',
        '--no-audit',
        '--no-fund',
        '--no-save',
      ],
      smokeDir,
    );
  } finally {
    fs.rmSync(smokeDir, { recursive: true, force: true });
  }
}

function main(): void {
  const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zubridge-pack-'));
  const packages = findPublishablePackages();
  const packed: PackedPackage[] = [];
  const violations: string[] = [];

  console.log(`Checking publishability of ${packages.length} package(s)...\n`);

  try {
    for (const { name, dir } of packages) {
      const dest = fs.mkdtempSync(path.join(packRoot, 'pkg-'));
      try {
        const tarball = packPackage(dir, dest);
        const manifest = readManifestFromTarball(tarball);
        const pkg: PackedPackage = { name, tarball, manifest };
        packed.push(pkg);

        const found = lintManifest(pkg);
        if (found.length > 0) {
          violations.push(...found);
          console.log(`  ✗ ${name}: forbidden dependency protocol in packed manifest`);
        } else {
          console.log(`  ✓ ${name}: no forbidden dependency protocols`);
        }
      } catch (error) {
        violations.push(`${name}: failed to pack — ${firstLine(error)}`);
        console.log(`  ✗ ${name}: failed to pack`);
      }
    }

    console.log('');

    for (const pkg of packed) {
      if (!INSTALL_SMOKE.includes(pkg.name)) continue;
      try {
        installSmoke(pkg.tarball);
        console.log(`  ✓ ${pkg.name}: clean npm install succeeds`);
      } catch (error) {
        violations.push(`${pkg.name}: clean npm install failed — ${firstLine(error)}`);
        console.log(`  ✗ ${pkg.name}: clean npm install failed`);
      }
    }

    if (violations.length > 0) {
      console.error('\n❌ Publishability check failed:\n');
      for (const v of violations) {
        console.error(`  • ${v}`);
      }
      console.error(
        '\nA packed manifest must not contain workspace:/link:/file: protocols, and public\n' +
          'packages must install cleanly with npm. See issue #194.',
      );
      process.exit(1);
    }

    console.log('\n✅ All publishable packages passed.');
  } finally {
    fs.rmSync(packRoot, { recursive: true, force: true });
  }
}

main();
