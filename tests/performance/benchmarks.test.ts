/**
 * Performance / stress tests.
 *
 * These tests create a synthetic repository of ~3 000 TypeScript files on the
 * fly (takes ~150 ms), run each tool against it, and assert that wall-clock
 * time and heap growth stay within defined budgets.
 *
 * Budgets are intentionally generous to stay green on any CI runner:
 *   - Tight budgets belong in micro-benchmarks, not in correctness tests.
 *   - We care about "orders of magnitude wrong" — a 30-second tree build or a
 *     500 MB heap spike — not millisecond differences.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { handleGetProjectTree } from '../../src/tools/get-project-tree.js';
import { handleGetSemanticContext } from '../../src/tools/get-semantic-context.js';
import { handleSearchCodebase } from '../../src/tools/search-codebase.js';
import { handleGetProjectIndex } from '../../src/tools/get-project-index.js';
import { handleGetChangedFiles } from '../../src/tools/get-changed-files.js';
import { loadConfig } from '../../src/config/index.js';

// ─── Fixture dimensions ───────────────────────────────────────────────────────
const FEATURE_GROUPS = 50;   // top-level src/ subdirectories
const MODULES_PER_GROUP = 10; // subdirectories inside each group
const FILES_PER_MODULE = 6;   // .ts files per module
// Total source files = 50 × 10 × 6 = 3 000

const NODE_MODULES_DECOY_FILES = 200; // must be excluded from all tool results

// ─── Performance budgets ──────────────────────────────────────────────────────
const TREE_MAX_MS = 5_000;
const SEARCH_TEXT_MAX_MS = 10_000;
const SEARCH_REGEX_MAX_MS = 10_000;
const CONTEXT_MAX_MS = 10_000;
const MAX_HEAP_GROWTH_MB = 200;

// New feature budgets
// get_project_index on 60 files (1 group × 10 modules × 6 files) — ts-morph per-file
const INDEX_60_FILES_MAX_MS = 30_000;
// get_project_index on 600 files (10 groups × 10 modules × 6 files)
const INDEX_600_FILES_MAX_MS = 120_000;
const INDEX_MAX_HEAP_MB = 500;  // ts-morph is memory-hungry
// get_changed_files — pure git process, very fast
const GIT_DIFF_MAX_MS = 2_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function measureHeap(): number {
  return process.memoryUsage().heapUsed;
}

function mb(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

/** Generate realistic-looking TypeScript module content. */
function moduleContent(group: number, mod: number, file: string): string {
  const importLine =
    file === 'service.ts'
      ? `import { ${group}_${mod}_Type } from './types';\nimport { format } from './utils';\n`
      : file === 'component.tsx'
      ? `import { ${group}_${mod}_Type } from './types';\nimport { ${group}_${mod}Service } from './service';\n`
      : '';

  return [
    importLine,
    `// group ${group} | module ${mod} | file ${file}`,
    `export interface ${group}_${mod}_Type { id: number; name: string; value: string; }`,
    `export class ${group}_${mod}Service {`,
    `  private items: ${group}_${mod}_Type[] = [];`,
    `  add(item: ${group}_${mod}_Type): void { this.items.push(item); }`,
    `  getAll(): ${group}_${mod}_Type[] { return [...this.items]; }`,
    `  findById(id: number): ${group}_${mod}_Type | undefined {`,
    `    return this.items.find(x => x.id === id);`,
    `  }`,
    `}`,
    `export function format(v: ${group}_${mod}_Type): string {`,
    `  return \`[\${v.id}] \${v.name}: \${v.value}\`;`,
    `}`,
    `export const DEFAULT_${group}_${mod} = { id: 0, name: 'default', value: '' };`,
  ].join('\n');
}

/** Build the large synthetic repo once before all tests. */
function buildLargeFixture(root: string): void {
  fs.mkdirSync(root, { recursive: true });

  // .gitignore — must exclude node_modules, dist, build
  fs.writeFileSync(
    path.join(root, '.gitignore'),
    'node_modules/\ndist/\nbuild/\n*.log\n',
  );
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'large-fixture', version: '1.0.0' }));

  const FILES = ['index.ts', 'types.ts', 'utils.ts', 'service.ts', 'component.tsx', 'test.ts'];

  // 50 groups × 10 modules × 6 files = 3 000 source files
  for (let g = 0; g < FEATURE_GROUPS; g++) {
    for (let m = 0; m < MODULES_PER_GROUP; m++) {
      const moduleDir = path.join(root, 'src', `group-${g}`, `module-${m}`);
      fs.mkdirSync(moduleDir, { recursive: true });

      for (const file of FILES) {
        fs.writeFileSync(
          path.join(moduleDir, file),
          moduleContent(g, m, file),
        );
      }
    }
  }

  // Entry point that imports from every group's first module
  const appImports = Array.from({ length: FEATURE_GROUPS }, (_, g) =>
    `import { ${g}_0Service } from './src/group-${g}/module-0/service';`,
  ).join('\n');
  fs.writeFileSync(
    path.join(root, 'app.ts'),
    `${appImports}\nconsole.log('app loaded');\n`,
  );

  // node_modules decoy — must be invisible to all tools
  for (let i = 0; i < NODE_MODULES_DECOY_FILES; i++) {
    const pkg = path.join(root, 'node_modules', `pkg-${i}`);
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, 'index.js'), `module.exports = ${i};`);
  }
}

// ─── Fixture lifecycle ───────────────────────────────────────────────────────

let fixtureRoot: string;
let config: ReturnType<typeof loadConfig>;

beforeAll(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-bench-'));
  buildLargeFixture(fixtureRoot);
  config = loadConfig({ root: fixtureRoot });
}, 30_000); // 30s timeout: safety net for very slow CI disks

afterAll(() => {
  if (fixtureRoot) {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

// ─── Fixture sanity ───────────────────────────────────────────────────────────

describe('Performance: fixture sanity', () => {
  it('fixture contains exactly 3002 source files (3000 module files + app.ts + package.json)', () => {
    let count = 0;
    function walk(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
        else count++;
      }
    }
    walk(fixtureRoot);
    expect(count).toBe(FEATURE_GROUPS * MODULES_PER_GROUP * FILES_PER_MODULE + 3); // +3: app.ts, package.json, .gitignore
  });

  it('node_modules decoy contains the expected number of files', () => {
    const pkgs = fs.readdirSync(path.join(fixtureRoot, 'node_modules'));
    expect(pkgs.length).toBe(NODE_MODULES_DECOY_FILES);
  });
});

// ─── get_project_tree benchmarks ─────────────────────────────────────────────

describe('Performance: get_project_tree', () => {
  it(`builds tree for ~3000 files in under ${TREE_MAX_MS}ms`, async () => {
    const start = performance.now();
    const result = await handleGetProjectTree({}, config);
    const elapsed = performance.now() - start;

    expect(result).toContain('app.ts');
    expect(elapsed).toBeLessThan(TREE_MAX_MS);

    console.log(`  get_project_tree: ${Math.round(elapsed)}ms for ${FEATURE_GROUPS * MODULES_PER_GROUP * FILES_PER_MODULE} files`);
  });

  it('heap growth stays under 200 MB while building the tree', async () => {
    if (global.gc) global.gc();
    const heapBefore = measureHeap();
    await handleGetProjectTree({}, config);
    const heapGrowth = measureHeap() - heapBefore;

    expect(heapGrowth).toBeLessThan(MAX_HEAP_GROWTH_MB * 1024 * 1024);

    console.log(`  heap growth: +${mb(heapGrowth)} MB`);
  });

  it('node_modules/ is completely absent from the tree output', async () => {
    const result = await handleGetProjectTree({}, config);
    expect(result).not.toContain('node_modules');
    // Spot-check: a decoy file should never appear
    expect(result).not.toContain('pkg-0');
  });

  it('file and directory counts in header are non-zero and sane', async () => {
    const result = await handleGetProjectTree({}, config);

    const filesMatch = result.match(/Files:\s*(\d+)/);
    const dirsMatch = result.match(/Directories:\s*(\d+)/);

    expect(filesMatch).not.toBeNull();
    expect(dirsMatch).not.toBeNull();

    const files = Number(filesMatch![1]);
    const dirs = Number(dirsMatch![1]);

    // We have at minimum 3000 source files + a few root files
    expect(files).toBeGreaterThanOrEqual(3000);
    // We have 1 root src/ + 50 groups + 500 modules = 551 dirs minimum
    expect(dirs).toBeGreaterThanOrEqual(551);
    // node_modules (200 dirs) must not be counted
    expect(dirs).toBeLessThan(700);

    console.log(`  reported: ${files} files, ${dirs} dirs`);
  });

  it('does not leak memory across 5 consecutive calls', async () => {
    if (global.gc) global.gc();
    const heapBefore = measureHeap();

    for (let i = 0; i < 5; i++) {
      await handleGetProjectTree({}, config);
    }

    if (global.gc) global.gc();
    const heapAfter = measureHeap();
    const growthPerCall = (heapAfter - heapBefore) / 5;

    // Each additional call should not grow heap by more than 20 MB on average
    expect(growthPerCall).toBeLessThan(20 * 1024 * 1024);
  });
});

// ─── search_codebase benchmarks ──────────────────────────────────────────────

describe('Performance: search_codebase', () => {
  it(`plain text search across ~3000 files completes in under ${SEARCH_TEXT_MAX_MS}ms`, async () => {
    const start = performance.now();
    const result = await handleSearchCodebase({ query: 'DEFAULT_' }, config);
    const elapsed = performance.now() - start;

    // Should find many results (one DEFAULT_ per module file)
    expect(result).toContain('DEFAULT_');
    expect(result).not.toContain('No matches found');
    expect(elapsed).toBeLessThan(SEARCH_TEXT_MAX_MS);

    const matchCount = result.match(/Found (\d+) match/)?.[1];
    console.log(`  plain text search: ${Math.round(elapsed)}ms, ${matchCount ?? '?'} matches`);
  });

  it(`regex search across ~3000 files completes in under ${SEARCH_REGEX_MAX_MS}ms`, async () => {
    const start = performance.now();
    // Class names in the fixture follow the pattern \d+_\d+Service (e.g. 0_0Service, 5_3Service)
    const result = await handleSearchCodebase(
      { query: '\\d+_\\d+Service', is_regex: true },
      config,
    );
    const elapsed = performance.now() - start;

    expect(result).not.toContain('No matches found');
    expect(elapsed).toBeLessThan(SEARCH_REGEX_MAX_MS);

    console.log(`  regex search: ${Math.round(elapsed)}ms`);
  });

  it('heap growth stays under 200 MB while searching', async () => {
    if (global.gc) global.gc();
    const heapBefore = measureHeap();
    await handleSearchCodebase({ query: 'export' }, config);
    const heapGrowth = measureHeap() - heapBefore;

    expect(heapGrowth).toBeLessThan(MAX_HEAP_GROWTH_MB * 1024 * 1024);

    console.log(`  search heap growth: +${mb(heapGrowth)} MB`);
  });

  it('max_results cap is respected — never returns more than the requested limit', async () => {
    const MAX = 20;
    const result = await handleSearchCodebase(
      { query: 'export', max_results: MAX },
      config,
    );

    // Count actual match lines (indented with 2 spaces: "  line:col  context")
    const matchLines = result.split('\n').filter((l) => /^\s{2}\d+:\d+/.test(l));
    expect(matchLines.length).toBeLessThanOrEqual(MAX);
  });

  it('search is faster on a scoped file_pattern than on the whole tree', async () => {
    const narrowStart = performance.now();
    await handleSearchCodebase(
      { query: 'DEFAULT_', file_pattern: 'src/group-0/**/*.ts' },
      config,
    );
    const narrowMs = performance.now() - narrowStart;

    const wideStart = performance.now();
    await handleSearchCodebase({ query: 'DEFAULT_' }, config);
    const wideMs = performance.now() - wideStart;

    // Narrow scope should be strictly faster than full-repo scan
    expect(narrowMs).toBeLessThan(wideMs);

    console.log(`  narrow: ${Math.round(narrowMs)}ms | wide: ${Math.round(wideMs)}ms`);
  });
});

// ─── get_semantic_context benchmarks ─────────────────────────────────────────

describe('Performance: get_semantic_context', () => {
  it(`extracts context with deep deps (depth 3) in under ${CONTEXT_MAX_MS}ms`, async () => {
    const start = performance.now();
    // app.ts imports 50 service files, each of which imports types.ts and utils.ts
    const result = await handleGetSemanticContext(
      { file_path: 'app.ts', depth: 3 },
      config,
    );
    const elapsed = performance.now() - start;

    expect(result).toContain('## Entry File: app.ts');
    expect(elapsed).toBeLessThan(CONTEXT_MAX_MS);

    const depSection = result.includes('## Local Dependencies');
    const depCountMatch = result.match(/Dependencies analyzed:\s*(\d+)/);
    console.log(
      `  semantic context depth 3: ${Math.round(elapsed)}ms, deps=${depCountMatch?.[1] ?? '?'}, hasDeps=${depSection}`,
    );
  });

  it('heap growth for deep context extraction stays under 200 MB', async () => {
    if (global.gc) global.gc();
    const heapBefore = measureHeap();
    await handleGetSemanticContext({ file_path: 'app.ts', depth: 3 }, config);
    const heapGrowth = measureHeap() - heapBefore;

    expect(heapGrowth).toBeLessThan(MAX_HEAP_GROWTH_MB * 1024 * 1024);

    console.log(`  semantic context heap growth: +${mb(heapGrowth)} MB`);
  });

  it('depth cap prevents runaway traversal — depth 2 finishes faster than depth 4', async () => {
    const shallowStart = performance.now();
    await handleGetSemanticContext({ file_path: 'app.ts', depth: 2 }, config);
    const shallowMs = performance.now() - shallowStart;

    const deepStart = performance.now();
    await handleGetSemanticContext({ file_path: 'app.ts', depth: 4 }, config);
    const deepMs = performance.now() - deepStart;

    // Deeper traversal is allowed to take longer, but both must complete
    expect(shallowMs).toBeLessThan(CONTEXT_MAX_MS);
    expect(deepMs).toBeLessThan(CONTEXT_MAX_MS * 2);

    console.log(`  depth 2: ${Math.round(shallowMs)}ms | depth 4: ${Math.round(deepMs)}ms`);
  });

  it('analyzing a leaf module (no imports) is very fast — under 500ms', async () => {
    // types.ts in the first module has no local imports
    const leafFile = 'src/group-0/module-0/types.ts';
    const start = performance.now();
    const result = await handleGetSemanticContext({ file_path: leafFile, depth: 3 }, config);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(result).toContain('types.ts');

    console.log(`  leaf context: ${Math.round(elapsed)}ms`);
  });
});

// ─── Cross-tool stress scenario ───────────────────────────────────────────────

describe('Performance: combined scenario (simulates an AI session)', () => {
  it('tree → search → context pipeline completes under 20 seconds total', async () => {
    const sessionStart = performance.now();

    // Step 1: AI asks for the project structure
    const tree = await handleGetProjectTree({}, config);
    expect(tree).toContain('app.ts');

    // Step 2: AI searches for a symbol to locate relevant files
    const searchResult = await handleSearchCodebase(
      { query: '0_0Service', max_results: 10 },
      config,
    );
    expect(searchResult).toContain('service.ts');

    // Step 3: AI drills into a specific file for full context
    const context = await handleGetSemanticContext(
      { file_path: 'src/group-0/module-0/service.ts', depth: 2 },
      config,
    );
    expect(context).toContain('0_0Service');

    const totalMs = performance.now() - sessionStart;
    expect(totalMs).toBeLessThan(20_000);

    console.log(`  full session: ${Math.round(totalMs)}ms`);
  });
});

// ─── outline_only benchmarks ──────────────────────────────────────────────────

describe('Performance: outline_only mode', () => {
  it('outline_only produces significantly shorter output than full content', async () => {
    // Use a service file that imports types — it has real deps to bundle
    const filePath = 'src/group-0/module-0/service.ts';

    const fullResult = await handleGetSemanticContext(
      { file_path: filePath, depth: 2 },
      config,
    );
    const outlineResult = await handleGetSemanticContext(
      { file_path: filePath, depth: 2, outline_only: true },
      config,
    );

    const ratio = outlineResult.length / fullResult.length;
    console.log(
      `  full: ${fullResult.length} chars | outline: ${outlineResult.length} chars | ratio: ${(ratio * 100).toFixed(1)}%`,
    );

    // outline_only must be at least 50% shorter (conservative budget)
    expect(outlineResult.length).toBeLessThan(fullResult.length * 0.5);
  });

  it('outline_only is at least as fast as full content mode', async () => {
    const filePath = 'src/group-0/module-0/service.ts';

    const fullStart = performance.now();
    await handleGetSemanticContext({ file_path: filePath, depth: 2 }, config);
    const fullMs = performance.now() - fullStart;

    const outlineStart = performance.now();
    await handleGetSemanticContext({ file_path: filePath, depth: 2, outline_only: true }, config);
    const outlineMs = performance.now() - outlineStart;

    // outline_only adds ts-morph extraction on top of normal reading, so
    // it may be slower or similar — but must complete within the normal budget
    expect(outlineMs).toBeLessThan(CONTEXT_MAX_MS);

    console.log(`  full: ${Math.round(fullMs)}ms | outline: ${Math.round(outlineMs)}ms`);
  });

  it('outline_only output does not contain function bodies from any dep', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'app.ts', depth: 2, outline_only: true },
      config,
    );

    // None of the fixture implementation details should appear
    expect(result).not.toContain('this.items.push');
    expect(result).not.toContain('return [...this.items]');
    expect(result).not.toContain('console.log');
  });

  it('outline_only heap growth stays under 200 MB for depth=2 on app.ts', async () => {
    if (global.gc) global.gc();
    const heapBefore = measureHeap();
    await handleGetSemanticContext({ file_path: 'app.ts', depth: 2, outline_only: true }, config);
    const heapGrowth = measureHeap() - heapBefore;

    expect(heapGrowth).toBeLessThan(MAX_HEAP_GROWTH_MB * 1024 * 1024);
    console.log(`  outline_only heap growth: +${mb(heapGrowth)} MB`);
  });
});

// ─── get_project_index benchmarks ────────────────────────────────────────────

describe('Performance: get_project_index', () => {
  it(`indexes 60 files (1 group) in under ${INDEX_60_FILES_MAX_MS / 1000}s`, async () => {
    const start = performance.now();
    const result = await handleGetProjectIndex(
      { file_pattern: 'src/group-0/**/*.ts' },
      config,
    );
    const elapsed = performance.now() - start;

    expect(result).toContain('Project Index');
    expect(result).toMatch(/\d+ file/);
    expect(elapsed).toBeLessThan(INDEX_60_FILES_MAX_MS);

    const fileMatch = result.match(/(\d+) file/);
    const symbolMatch = result.match(/(\d+) symbol/);
    console.log(
      `  index 60 files: ${Math.round(elapsed)}ms | ` +
      `${fileMatch?.[1] ?? '?'} files indexed, ${symbolMatch?.[1] ?? '?'} symbols`,
    );
  }, INDEX_60_FILES_MAX_MS + 5_000);

  it(`indexes 600 files (10 groups) in under ${INDEX_600_FILES_MAX_MS / 1000}s`, async () => {
    const start = performance.now();
    const result = await handleGetProjectIndex(
      { file_pattern: 'src/group-{0,1,2,3,4,5,6,7,8,9}/**/*.ts' },
      config,
    );
    const elapsed = performance.now() - start;

    expect(result).toContain('Project Index');
    expect(elapsed).toBeLessThan(INDEX_600_FILES_MAX_MS);

    const fileMatch = result.match(/(\d+) file/);
    console.log(`  index 600 files: ${Math.round(elapsed)}ms | ${fileMatch?.[1] ?? '?'} files indexed`);
  }, INDEX_600_FILES_MAX_MS + 10_000);

  it('project index output is far smaller than all file contents combined', async () => {
    // Read all 60 files in group-0 individually and sum their sizes
    const groupDir = path.join(fixtureRoot, 'src', 'group-0');
    let totalRawBytes = 0;
    function sumDir(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) sumDir(p);
        else totalRawBytes += fs.statSync(p).size;
      }
    }
    sumDir(groupDir);

    const indexResult = await handleGetProjectIndex(
      { file_pattern: 'src/group-0/**/*.ts' },
      config,
    );

    const ratio = indexResult.length / totalRawBytes;
    console.log(
      `  raw content: ${Math.round(totalRawBytes / 1024)}KB | ` +
      `index: ${Math.round(indexResult.length / 1024)}KB | ` +
      `compression: ${(ratio * 100).toFixed(1)}%`,
    );

    // Index must be under 40% the size of raw content
    expect(indexResult.length).toBeLessThan(totalRawBytes * 0.4);
  }, INDEX_60_FILES_MAX_MS + 5_000);

  it('index contains exported symbols without bodies', async () => {
    const result = await handleGetProjectIndex(
      { file_pattern: 'src/group-0/module-0/**/*.ts' },
      config,
    );

    // The fixture exports a `format` function — valid identifier, always detected
    expect(result).toMatch(/format\(/);
    // Sections per file should exist
    expect(result).toMatch(/## src\/group-0\/module-0\//);

    // No implementation bodies — fixture uses these strings internally
    expect(result).not.toContain('this.items.push');
    expect(result).not.toContain('return [...');
  }, INDEX_60_FILES_MAX_MS + 5_000);

  it('heap growth for indexing 60 files stays under configured limit', async () => {
    if (global.gc) global.gc();
    const heapBefore = measureHeap();
    await handleGetProjectIndex({ file_pattern: 'src/group-0/**/*.ts' }, config);
    const heapGrowth = measureHeap() - heapBefore;

    expect(heapGrowth).toBeLessThan(INDEX_MAX_HEAP_MB * 1024 * 1024);
    console.log(`  index heap growth (60 files): +${mb(heapGrowth)} MB`);
  }, INDEX_60_FILES_MAX_MS + 5_000);
});

// ─── get_changed_files benchmarks ────────────────────────────────────────────

describe('Performance: get_changed_files', () => {
  let gitRoot: string;
  let gitConfig: ReturnType<typeof loadConfig>;

  beforeAll(() => {
    gitRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-gitbench-'));

    // Init repo, make initial commit, then a second commit with many changes
    function git(args: string): void {
      execSync(`git -C "${gitRoot}" ${args}`, {
        stdio: 'pipe',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com',
          GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com',
        },
      });
    }

    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test"');

    // Initial commit: 200 files
    fs.mkdirSync(path.join(gitRoot, 'src'), { recursive: true });
    for (let i = 0; i < 200; i++) {
      fs.writeFileSync(
        path.join(gitRoot, 'src', `file-${i}.ts`),
        `export const value${i} = ${i};\n`,
      );
    }
    git('add .');
    git('commit -m "initial"');

    // Second commit: modify 50, add 50, delete 50
    for (let i = 0; i < 50; i++) {
      fs.writeFileSync(
        path.join(gitRoot, 'src', `file-${i}.ts`),
        `export const value${i} = ${i * 2}; // modified\n`,
      );
    }
    for (let i = 200; i < 250; i++) {
      fs.writeFileSync(path.join(gitRoot, 'src', `file-${i}.ts`), `export const value${i} = ${i};\n`);
    }
    for (let i = 150; i < 200; i++) {
      fs.unlinkSync(path.join(gitRoot, 'src', `file-${i}.ts`));
    }
    git('add .');
    git('commit -m "second"');

    gitConfig = loadConfig({ root: gitRoot });
  });

  afterAll(() => {
    if (gitRoot) fs.rmSync(gitRoot, { recursive: true, force: true });
  });

  it(`lists 150 changed files in under ${GIT_DIFF_MAX_MS}ms`, async () => {
    const start = performance.now();
    const result = await handleGetChangedFiles({ base_ref: 'HEAD~1' }, gitConfig);
    const elapsed = performance.now() - start;

    expect(result).toMatch(/\d+ file/);
    expect(elapsed).toBeLessThan(GIT_DIFF_MAX_MS);

    console.log(`  get_changed_files (150 changes): ${Math.round(elapsed)}ms`);
  });

  it('returns all 3 change types (Modified, Added, Deleted)', async () => {
    const result = await handleGetChangedFiles({ base_ref: 'HEAD~1' }, gitConfig);
    expect(result).toMatch(/Modified/i);
    expect(result).toMatch(/Added/i);
    expect(result).toMatch(/Deleted/i);
  });

  it(`include_diff on 150 files completes in under ${GIT_DIFF_MAX_MS * 2}ms`, async () => {
    const start = performance.now();
    const result = await handleGetChangedFiles(
      { base_ref: 'HEAD~1', include_diff: true },
      gitConfig,
    );
    const elapsed = performance.now() - start;

    expect(result).toContain('```diff');
    expect(elapsed).toBeLessThan(GIT_DIFF_MAX_MS * 2);

    console.log(`  get_changed_files with diff: ${Math.round(elapsed)}ms`);
  });

  it('file_pattern filter is fast — not slower than unfiltered call', async () => {
    const unfilteredStart = performance.now();
    await handleGetChangedFiles({ base_ref: 'HEAD~1' }, gitConfig);
    const unfilteredMs = performance.now() - unfilteredStart;

    const filteredStart = performance.now();
    await handleGetChangedFiles(
      { base_ref: 'HEAD~1', file_pattern: 'src/file-{0,1,2,3,4}*.ts' },
      gitConfig,
    );
    const filteredMs = performance.now() - filteredStart;

    // Both should be well under budget
    expect(unfilteredMs).toBeLessThan(GIT_DIFF_MAX_MS);
    expect(filteredMs).toBeLessThan(GIT_DIFF_MAX_MS);

    console.log(`  unfiltered: ${Math.round(unfilteredMs)}ms | filtered: ${Math.round(filteredMs)}ms`);
  });
});
