#!/usr/bin/env node

/**
 * Fails a release before anything is published if a crate in it depends on a workspace crate
 * version that isn't on crates.io and isn't being released alongside it. crates.io rejects such
 * a crate (`--no-verify` doesn't skip that server-side check), and by then releasekit has already
 * published the npm packages, leaving a half-done release.
 *
 * releasekit only warns about a held-back prerequisite for targeted releases, and not at all on
 * the standing PR: https://github.com/goosewobbler/releasekit/issues/1100
 *
 * Usage:
 *   tsx scripts/check-cargo-prerequisites.ts --pr <standing PR number>  (reads the manifest; needs gh)
 *   tsx scripts/check-cargo-prerequisites.ts --targets <a,b,c>          (targeted release: every target releases)
 *   tsx scripts/check-cargo-prerequisites.ts --json <file>              (`releasekit version --json` output)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { parse as parseToml } from 'smol-toml';

const ROOT = process.cwd();
const PACKAGES_DIR = path.join(ROOT, 'packages');
const MANIFEST_MARKER = '<!-- releasekit-manifest -->';
const DEP_TABLES = ['dependencies', 'build-dependencies', 'dev-dependencies'] as const;

type Update = { packageName: string; newVersion: string };
type ReleaseSet = Set<string>;
type TomlTable = Record<string, unknown>;
type Crate = { name: string; manifestPath: string; toml: TomlTable };
type WorkspaceDep = { name: string; requirement?: string; kind: (typeof DEP_TABLES)[number] };

function parseArgs(): { pr?: string; json?: string; targets?: string } {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  return { pr: value('--pr'), json: value('--json'), targets: value('--targets') };
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf-8' });
}

// Mirrors releasekit's own trust rule: only a bot comment by the account that opened the PR.
function readManifest(pr: string): unknown {
  const opener = gh(['api', `repos/{owner}/{repo}/pulls/${pr}`, '--jq', '.user.login']).trim();
  const comments = gh([
    'api',
    '--paginate',
    `repos/{owner}/{repo}/issues/${pr}/comments`,
    '--jq',
    '.[] | {login: .user.login, type: .user.type, body: .body} | @json',
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { login: string; type: string; body: string });
  const manifest = comments
    .filter((comment) => comment.type === 'Bot' && comment.login === opener)
    .findLast((comment) => comment.body.includes(MANIFEST_MARKER));
  if (!manifest) {
    throw new Error(`No releasekit manifest comment from ${opener} on #${pr}`);
  }
  const encoded = manifest.body.match(/<!-- base64 (\S+) -->/)?.[1];
  if (!encoded) {
    throw new Error(`Malformed releasekit manifest comment on #${pr}`);
  }
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
}

function toReleaseSet(input: unknown): ReleaseSet {
  const doc = input as {
    data?: { updates?: Update[] };
    versionOutput?: { updates?: Update[] };
    deselected?: string[];
  };
  const updates = doc.versionOutput?.updates ?? doc.data?.updates;
  if (!updates) {
    throw new Error('Input has no `updates` list');
  }
  const deselected = new Set(doc.deselected ?? []);
  return new Set(
    updates.map((update) => update.packageName).filter((name) => !deselected.has(name)),
  );
}

function readReleaseSet(): ReleaseSet {
  const { pr, json, targets } = parseArgs();
  if (pr) {
    return toReleaseSet(readManifest(pr));
  }
  if (json) {
    return toReleaseSet(JSON.parse(fs.readFileSync(json, 'utf-8')));
  }
  const names = (targets ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) {
    throw new Error('Pass --pr <number>, --targets <a,b,c> or --json <file>');
  }
  return new Set(names);
}

function readToml(file: string): TomlTable {
  return parseToml(fs.readFileSync(file, 'utf-8')) as TomlTable;
}

function asTable(value: unknown): TomlTable {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as TomlTable)
    : {};
}

function readCrates(): Map<string, Crate> {
  const crates = new Map<string, Crate>();
  for (const entry of fs.readdirSync(PACKAGES_DIR)) {
    const manifestPath = path.join(PACKAGES_DIR, entry, 'Cargo.toml');
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    const toml = readToml(manifestPath);
    const name = asTable(toml.package).name;
    if (typeof name === 'string') {
      crates.set(name, { name, manifestPath, toml });
    }
  }
  return crates;
}

// Every path dependency on another workspace crate, across plain, build, dev and
// `[target.'cfg(..)']` tables, with `workspace = true` entries resolved against the root.
function workspaceDeps(crate: Crate, crates: Map<string, Crate>): WorkspaceDep[] {
  const rootManifest = path.join(ROOT, 'Cargo.toml');
  const inherited = fs.existsSync(rootManifest)
    ? asTable(asTable(readToml(rootManifest).workspace).dependencies)
    : {};
  const scopes = [crate.toml, ...Object.values(asTable(crate.toml.target)).map(asTable)];
  const deps: WorkspaceDep[] = [];
  for (const scope of scopes) {
    for (const kind of DEP_TABLES) {
      for (const [key, raw] of Object.entries(asTable(scope[kind]))) {
        let spec = asTable(raw);
        if (spec.workspace === true) {
          spec = { ...asTable(inherited[key]), ...spec };
        }
        const name = typeof spec.package === 'string' ? spec.package : key;
        if (typeof spec.path !== 'string' || !crates.has(name)) {
          continue;
        }
        const requirement = typeof spec.version === 'string' ? spec.version : undefined;
        deps.push({ name, requirement, kind });
      }
    }
  }
  return deps;
}

// Cargo treats a bare requirement as caret and separates comparators with commas.
function toNpmRange(requirement: string): string {
  return requirement
    .split(',')
    .map((part) => part.trim())
    .map((part) => (/^[\^~=<>*]/.test(part) ? part : `^${part}`))
    .join(' ');
}

async function hasMatchingRelease(crate: string, requirement: string): Promise<boolean> {
  const lower = crate.toLowerCase();
  const indexPath =
    lower.length <= 2
      ? `${lower.length}/${lower}`
      : lower.length === 3
        ? `3/${lower[0]}/${lower}`
        : `${lower.slice(0, 2)}/${lower.slice(2, 4)}/${lower}`;
  const response = await fetch(`https://index.crates.io/${indexPath}`);
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(`crates.io index returned ${response.status} for ${crate}`);
  }
  const range = toNpmRange(requirement);
  return (await response.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { vers: string; yanked: boolean })
    .some((entry) => !entry.yanked && semver.satisfies(entry.vers, range));
}

async function main(): Promise<void> {
  const releasing = readReleaseSet();
  const crates = readCrates();
  const violations: string[] = [];

  for (const crate of crates.values()) {
    if (!releasing.has(crate.name)) {
      continue;
    }
    for (const dep of workspaceDeps(crate, crates)) {
      if (dep.requirement === undefined) {
        // cargo publish strips version-less path dev-dependencies but rejects any other kind.
        if (dep.kind !== 'dev-dependencies') {
          violations.push(
            `${crate.name} has a path dependency on ${dep.name} with no version, which cargo ` +
              'publish rejects. Add a version requirement.',
          );
        }
        continue;
      }
      // A releasing dependency publishes first, and releasekit raises the requirement to match.
      if (releasing.has(dep.name)) {
        console.log(`  ✓ ${crate.name} → ${dep.name} (released in this run)`);
      } else if (await hasMatchingRelease(dep.name, dep.requirement)) {
        console.log(`  ✓ ${crate.name} → ${dep.name} ${dep.requirement} (on crates.io)`);
      } else {
        violations.push(
          `${crate.name} requires ${dep.name} ${dep.requirement}, which no published crates.io ` +
            `release satisfies and which is not in this release. Release ${dep.name} first, or ` +
            `hold ${crate.name} back.`,
        );
      }
    }
  }

  if (violations.length > 0) {
    console.error('\n❌ Cargo prerequisite check failed:\n');
    for (const violation of violations) {
      console.error(`  • ${violation}`);
    }
    process.exit(1);
  }
  console.log('\n✅ Every releasing crate can resolve its workspace dependencies on crates.io');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
