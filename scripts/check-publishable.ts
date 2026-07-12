#!/usr/bin/env node

/**
 * Fails the build if a public package would not install cleanly from npm for an
 * end user. The package E2E harness can't catch this: it installs local tarballs
 * with pnpm behind `pnpm.overrides`, so neither registry resolution nor the npm
 * client is ever exercised — which is how issue #194 shipped (a `workspace:`
 * spec that npm rejects with EUNSUPPORTEDPROTOCOL but pnpm tolerates).
 *
 * Packages must be built first (dist must exist).
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
    // npm (not pnpm) is what rejects `workspace:`, so it must be the client here.
    // --omit=peer skips the heavy electron/redux peer frameworks; the dependency
    // resolution that fails on a bad spec still runs.
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
