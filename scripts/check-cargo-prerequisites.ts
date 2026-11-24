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
 *   tsx scripts/check-cargo-prerequisites.ts --pr <standing PR number>   (reads the manifest; needs gh)
 *   tsx scripts/check-cargo-prerequisites.ts --json <file>               (`releasekit version --json` output)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PACKAGES_DIR = path.join(ROOT, 'packages');
const MANIFEST_MARKER = '<!-- releasekit-manifest -->';

type Update = { packageName: string; newVersion: string };
type ReleaseSet = Map<string, string>;
type WorkspaceDep = { name: string; version: string };

function parseArgs(): { pr?: string; json?: string } {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  return { pr: value('--pr'), json: value('--json') };
}

function readManifest(pr: string): unknown {
  const bodies = execFileSync(
    'gh',
    ['api', '--paginate', `repos/{owner}/{repo}/issues/${pr}/comments`, '--jq', '.[].body'],
    { encoding: 'utf-8' },
  );
  const start = bodies.lastIndexOf(MANIFEST_MARKER);
  if (start === -1) {
    throw new Error(`No releasekit manifest comment on #${pr}`);
  }
  const encoded = bodies.slice(start).match(/<!-- base64 (\S+) -->/)?.[1];
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
  return new Map(
    updates
      .filter((update) => !deselected.has(update.packageName))
      .map((update) => [update.packageName, update.newVersion]),
  );
}

function tomlSection(toml: string, header: string): string {
  const start = toml.search(new RegExp(`^\\[${header}\\]\\s*$`, 'm'));
  if (start === -1) {
    return '';
  }
  const body = toml.slice(toml.indexOf('\n', start) + 1);
  const end = body.search(/^\[/m);
  return end === -1 ? body : body.slice(0, end);
}

function readCrates(): Map<string, WorkspaceDep[]> {
  const crates = new Map<string, WorkspaceDep[]>();
  for (const entry of fs.readdirSync(PACKAGES_DIR)) {
    const manifestPath = path.join(PACKAGES_DIR, entry, 'Cargo.toml');
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    const toml = fs.readFileSync(manifestPath, 'utf-8');
    const name = tomlSection(toml, 'package').match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const deps = tomlSection(toml, 'dependencies');
    if (!name) {
      continue;
    }
    const workspaceDeps: WorkspaceDep[] = [];
    for (const [, depName, table] of deps.matchAll(/^([\w-]+)\s*=\s*\{([^}]*)\}/gm)) {
      const version = table.match(/\bversion\s*=\s*"([^"]+)"/)?.[1];
      if (version && /\bpath\s*=/.test(table)) {
        workspaceDeps.push({ name: depName, version });
      }
    }
    crates.set(name, workspaceDeps);
  }
  return crates;
}

async function isPublished(crate: string, version: string): Promise<boolean> {
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
  return (await response.text())
    .split('\n')
    .filter(Boolean)
    .some((line) => {
      const entry = JSON.parse(line) as { vers: string; yanked: boolean };
      return entry.vers === version && !entry.yanked;
    });
}

async function main(): Promise<void> {
  const { pr, json } = parseArgs();
  if (!pr && !json) {
    throw new Error('Pass --pr <number> or --json <file>');
  }
  const releasing = toReleaseSet(
    pr ? readManifest(pr) : JSON.parse(fs.readFileSync(json as string, 'utf-8')),
  );
  const crates = readCrates();
  const violations: string[] = [];

  for (const [crate, deps] of crates) {
    if (!releasing.has(crate)) {
      continue;
    }
    for (const dep of deps) {
      // A releasing dependency publishes first, and releasekit raises the requirement to match.
      if (releasing.has(dep.name)) {
        console.log(`  ✓ ${crate} → ${dep.name}@${releasing.get(dep.name)} (released in this run)`);
      } else if (await isPublished(dep.name, dep.version)) {
        console.log(`  ✓ ${crate} → ${dep.name}@${dep.version} (on crates.io)`);
      } else {
        violations.push(
          `${crate}@${releasing.get(crate)} requires ${dep.name}@${dep.version}, which is not on ` +
            `crates.io and is not in this release. Release ${dep.name} too, or hold ${crate} back.`,
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
