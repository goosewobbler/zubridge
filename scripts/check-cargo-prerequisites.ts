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
 *   tsx scripts/check-cargo-prerequisites.ts --all                      (untargeted release: everything releases)
 *   tsx scripts/check-cargo-prerequisites.ts --json <file>              (`releasekit version --json` output)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { parse as parseToml } from 'smol-toml';

const ROOT = process.cwd();
const MANIFEST_MARKER = '<!-- releasekit-manifest -->';
const DEP_TABLES = ['dependencies', 'build-dependencies', 'dev-dependencies'] as const;

type Update = { packageName: string; newVersion: string };
type TomlTable = Record<string, unknown>;
type Crate = { name: string; toml: TomlTable };
type WorkspaceDep = { name: string; requirement?: string; kind: (typeof DEP_TABLES)[number] };
type GhComment = { login: string; type: string; body: string };

type Release = {
  /** Package name → the version it releases at, if known. */
  packages: Map<string, string | undefined>;
  /**
   * The checked-out manifests already have the new versions. True for a merged standing PR;
   * false for a targeted release, which only bumps inside releasekit after this check runs.
   */
  bumped: boolean;
};

function parseArgs(): { pr?: string; json?: string; targets?: string; all: boolean } {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  return {
    pr: value('--pr'),
    json: value('--json'),
    targets: value('--targets'),
    all: args.includes('--all'),
  };
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf-8' });
}

// Mirrors releasekit's findTrustedComment: the first bot comment that starts with the marker,
// refused unless that bot also opened the PR.
function readManifest(pr: string): unknown {
  const opener = gh(['api', `repos/{owner}/{repo}/pulls/${pr}`, '--jq', '.user.login']).trim();
  const manifest = gh([
    'api',
    '--paginate',
    `repos/{owner}/{repo}/issues/${pr}/comments`,
    '--jq',
    '.[] | {login: .user.login, type: .user.type, body: .body} | @json',
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GhComment)
    .find(
      (comment) =>
        comment.body.startsWith(MANIFEST_MARKER) &&
        (comment.type === 'Bot' || comment.login.endsWith('[bot]')),
    );
  if (!manifest) {
    throw new Error(`No releasekit manifest comment on #${pr}`);
  }
  if (manifest.login !== opener) {
    throw new Error(`The manifest on #${pr} was posted by ${manifest.login}, not by ${opener}`);
  }
  const encoded = manifest.body.match(/<!-- base64 (\S+) -->/)?.[1];
  if (!encoded) {
    throw new Error(`Malformed releasekit manifest comment on #${pr}`);
  }
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
}

function fromUpdates(input: unknown): Map<string, string | undefined> {
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
  return new Map(
    updates
      .filter((update) => !deselected.has(update.packageName))
      .map((update) => [update.packageName, update.newVersion]),
  );
}

function readRelease(crates: Map<string, Crate>): Release {
  const { pr, json, targets, all } = parseArgs();
  if (pr) {
    return { packages: fromUpdates(readManifest(pr)), bumped: true };
  }
  if (json) {
    return { packages: fromUpdates(JSON.parse(fs.readFileSync(json, 'utf-8'))), bumped: false };
  }
  if (all) {
    return {
      packages: new Map([...crates.keys()].map((name) => [name, undefined])),
      bumped: false,
    };
  }
  const names = (targets ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) {
    throw new Error('Pass --pr <number>, --targets <a,b,c>, --all or --json <file>');
  }
  return { packages: new Map(names.map((name) => [name, undefined])), bumped: false };
}

function readToml(file: string): TomlTable {
  return parseToml(fs.readFileSync(file, 'utf-8')) as TomlTable;
}

function asTable(value: unknown): TomlTable {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as TomlTable)
    : {};
}

const GLOB = /[*?[]/;

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

// Manifest paths of the workspace members. Cargo errors on an explicit member without a
// Cargo.toml, so this does too rather than silently dropping the crate from the check.
function memberManifests(members: string[], exclude: string[]): string[] {
  const excluded = exclude.map((entry) => path.join(ROOT, entry));
  const isExcluded = (dir: string) =>
    excluded.some((entry) => dir === entry || dir.startsWith(`${entry}${path.sep}`));
  const manifests: string[] = [];
  for (const member of members) {
    const globbed = member.endsWith('/*');
    if (GLOB.test(globbed ? member.slice(0, -2) : member)) {
      throw new Error(
        `Unsupported workspace member "${member}": only plain paths and a trailing /* are handled`,
      );
    }
    if (!globbed) {
      const manifest = path.join(ROOT, member, 'Cargo.toml');
      if (!fs.existsSync(manifest)) {
        throw new Error(`Workspace member "${member}" has no Cargo.toml`);
      }
      manifests.push(manifest);
      continue;
    }
    const parent = path.join(ROOT, member.slice(0, -2));
    for (const entry of fs.existsSync(parent) ? fs.readdirSync(parent) : []) {
      const dir = path.join(parent, entry);
      const manifest = path.join(dir, 'Cargo.toml');
      if (!isExcluded(dir) && fs.existsSync(manifest)) {
        manifests.push(manifest);
      }
    }
  }
  return manifests;
}

function readWorkspace(): { crates: Map<string, Crate>; inherited: TomlTable } {
  const workspace = asTable(readToml(path.join(ROOT, 'Cargo.toml')).workspace);
  const manifests = memberManifests(stringList(workspace.members), stringList(workspace.exclude));
  const crates = new Map<string, Crate>();
  for (const manifestPath of manifests) {
    const toml = readToml(manifestPath);
    const name = asTable(toml.package).name;
    if (typeof name === 'string') {
      crates.set(name, { name, toml });
    }
  }
  return { crates, inherited: asTable(workspace.dependencies) };
}

// Every path dependency on another workspace crate, across plain, build, dev and
// `[target.'cfg(..)']` tables, with `workspace = true` entries resolved against the root.
function workspaceDeps(
  crate: Crate,
  crates: Map<string, Crate>,
  inherited: TomlTable,
): WorkspaceDep[] {
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

// Cargo treats a bare requirement as caret and separates comparators with commas. Wildcard
// parts (`1.2.*`) mean the same in both, and a caret in front would widen them.
function toNpmRange(requirement: string): string {
  return requirement
    .split(',')
    .map((part) => part.trim())
    .map((part) => (/^[\^~=<>]/.test(part) || /(^|\.)[*xX](\.|$)/.test(part) ? part : `^${part}`))
    .join(' ');
}

function satisfies(version: string, requirement: string): boolean {
  return semver.satisfies(version, toNpmRange(requirement));
}

// https://doc.rust-lang.org/cargo/reference/registry-index.html#index-files
function indexPath(crate: string): string {
  const name = crate.toLowerCase();
  if (name.length <= 2) {
    return `${name.length}/${name}`;
  }
  if (name.length === 3) {
    return `3/${name[0]}/${name}`;
  }
  return `${name.slice(0, 2)}/${name.slice(2, 4)}/${name}`;
}

async function hasMatchingRelease(crate: string, requirement: string): Promise<boolean> {
  const response = await fetch(`https://index.crates.io/${indexPath(crate)}`);
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(`crates.io index returned ${response.status} for ${crate}`);
  }
  return (await response.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { vers: string; yanked: boolean })
    .some((entry) => !entry.yanked && satisfies(entry.vers, requirement));
}

async function checkDep(
  crate: Crate,
  dep: WorkspaceDep & { requirement: string },
  release: Release,
): Promise<string | undefined> {
  if (release.packages.has(dep.name)) {
    const version = release.packages.get(dep.name);
    // Before the version step the old requirement is still on disk and releasekit raises it
    // later, so only a bumped checkout can confirm the requirement accepts the new version.
    if (release.bumped && version !== undefined && !satisfies(version, dep.requirement)) {
      return (
        `${crate.name} requires ${dep.name} ${dep.requirement}, but this release publishes ` +
        `${dep.name} ${version}. The requirement wasn't raised; update it before publishing.`
      );
    }
    const label = version === undefined ? dep.name : `${dep.name} ${version}`;
    console.log(`  ✓ ${crate.name} → ${label} (released in this run)`);
    return undefined;
  }
  if (await hasMatchingRelease(dep.name, dep.requirement)) {
    console.log(`  ✓ ${crate.name} → ${dep.name} ${dep.requirement} (on crates.io)`);
    return undefined;
  }
  return (
    `${crate.name} requires ${dep.name} ${dep.requirement}, which no published crates.io ` +
    `release satisfies and which is not in this release. Release ${dep.name} first, or hold ` +
    `${crate.name} back.`
  );
}

async function main(): Promise<void> {
  const { crates, inherited } = readWorkspace();
  const release = readRelease(crates);
  const violations: string[] = [];

  for (const crate of crates.values()) {
    if (!release.packages.has(crate.name)) {
      continue;
    }
    for (const dep of workspaceDeps(crate, crates, inherited)) {
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
      const violation = await checkDep(crate, { ...dep, requirement: dep.requirement }, release);
      if (violation) {
        violations.push(violation);
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
