#!/usr/bin/env tsx
/**
 * Real-world performance benchmark for get_project_index.
 * Usage: tsx scripts/bench-real.ts <repo-path>
 *
 * Calls buildProjectIndex directly (bypasses MCP protocol overhead)
 * to measure raw indexing cost on a real TypeScript repository.
 */
import { buildProjectIndex } from '../src/core/analysis/project-indexer.js';
import { loadConfig } from '../src/config/index.js';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import fs from 'node:fs';

const root = process.argv[2];
if (!root) {
  console.error('Usage: tsx scripts/bench-real.ts <repo-path>');
  process.exit(1);
}

const absRoot = path.resolve(root);
if (!fs.existsSync(absRoot)) {
  console.error(`Directory not found: ${absRoot}`);
  process.exit(1);
}

console.log(`\nBenchmarking: ${absRoot}`);
console.log('─'.repeat(50));

const config = loadConfig({ root: absRoot });

const heapBefore = process.memoryUsage().heapUsed;
const t0 = performance.now();

const index = await buildProjectIndex(absRoot, config);

const elapsed = performance.now() - t0;
const heapDelta = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;

const msPerFile = index.totalFiles > 0 ? elapsed / index.totalFiles : 0;

console.log(`Files indexed : ${index.totalFiles}`);
console.log(`Symbols found : ${index.totalSymbols}`);
console.log(`Time          : ${Math.round(elapsed)} ms`);
console.log(`Heap growth   : ${heapDelta.toFixed(1)} MB`);
console.log(`ms / file     : ${msPerFile.toFixed(1)}`);
console.log('');

// Comparison against synthetic budget thresholds
const BUDGET_60  = 30_000;
const BUDGET_600 = 120_000;
if (index.totalFiles <= 60) {
  const pct = ((elapsed / BUDGET_60) * 100).toFixed(0);
  console.log(`vs synthetic budget (60 files → 30 s): ${pct}% used`);
} else if (index.totalFiles <= 600) {
  const pct = ((elapsed / BUDGET_600) * 100).toFixed(0);
  console.log(`vs synthetic budget (600 files → 120 s): ${pct}% used`);
} else {
  const extrapolated = msPerFile * 600;
  const pct = ((extrapolated / BUDGET_600) * 100).toFixed(0);
  console.log(`Extrapolated to 600 files: ~${Math.round(extrapolated)} ms (${pct}% of 120 s budget)`);
}
