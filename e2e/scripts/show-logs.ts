#!/usr/bin/env tsx

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Cross-platform script to display E2E test logs
 * Works on Windows, macOS, and Linux
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findLogDirs(baseDir: string): string[] {
  const logDirs: string[] = [];

  if (!fs.existsSync(baseDir)) {
    return logDirs;
  }

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const dirPath = path.join(baseDir, entry.name);
      const logs = fs.readdirSync(dirPath).filter((f) => f.endsWith('.log'));

      if (logs.length > 0) {
        logDirs.push(dirPath);
      }
    }
  }

  return logDirs;
}

function showLogs(): void {
  // Check for logs in e2e directory
  const e2eLogsDir = path.resolve(__dirname, '../wdio-logs-electron');
  const appLogsDirs = path.resolve(__dirname, '../../apps');

  const allLogDirs: string[] = [];

  // Find logs in e2e/wdio-logs-electron
  allLogDirs.push(...findLogDirs(e2eLogsDir));

  // Find logs in apps/*/wdio-logs-*
  if (fs.existsSync(appLogsDirs)) {
    const apps = fs.readdirSync(appLogsDirs, { withFileTypes: true });

    for (const app of apps) {
      if (app.isDirectory()) {
        const appDir = path.join(appLogsDirs, app.name);
        const entries = fs.readdirSync(appDir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('wdio-logs-')) {
            const logDir = path.join(appDir, entry.name);
            allLogDirs.push(...findLogDirs(logDir));
          }
        }
      }
    }
  }

  if (allLogDirs.length === 0) {
    console.log('No logs found');
    process.exit(0);
  }

  // Process each log directory
  for (const logDir of allLogDirs) {
    const relativePath = path.relative(path.resolve(__dirname, '..'), logDir);

    // Get all log files in this directory
    const logs = fs
      .readdirSync(logDir)
      .filter((file) => file.endsWith('.log'))
      .sort();

    if (logs.length === 0) {
      console.log(`=== ${relativePath} (no logs) ===\n`);
      continue;
    }

    logs.forEach((logFile) => {
      const logPath = path.join(logDir, logFile);
      const displayPath = path.join(relativePath, logFile);

      console.log(`=== ${displayPath} ===`);

      try {
        const content = fs.readFileSync(logPath, 'utf8');

        if (content.trim()) {
          // Limit output to last 500 lines to avoid overwhelming the console
          const lines = content.split('\n');
          if (lines.length > 500) {
            console.log(`(showing last 500 of ${lines.length} lines)`);
            console.log(lines.slice(-500).join('\n'));
          } else {
            console.log(content);
          }
        } else {
          console.log('(empty log file)');
        }
      } catch (error) {
        console.log(
          `Error reading ${logFile}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      console.log('');
    });
  }
}

showLogs();
