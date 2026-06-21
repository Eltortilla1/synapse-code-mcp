import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveImports } from '../../src/core/analysis/generic-resolver.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/simple-ts-project');
const MAIN_TS = path.join(FIXTURE_ROOT, 'src', 'main.ts');
const UTILS_TS = path.join(FIXTURE_ROOT, 'src', 'utils.ts');

describe('generic-resolver', () => {
  it('resolves ES module import from main.ts to utils.ts', () => {
    const content = `import { add, greet } from './utils';`;
    const edges = resolveImports(MAIN_TS, content);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0]?.to).toBe(UTILS_TS);
    expect(edges[0]?.from).toBe(MAIN_TS);
  });

  it('ignores external (non-relative) imports', () => {
    const content = `
      import { z } from 'zod';
      import fs from 'node:fs';
    `;
    const edges = resolveImports(MAIN_TS, content);
    expect(edges).toHaveLength(0);
  });

  it('resolves require() syntax', () => {
    const content = `const utils = require('./utils');`;
    const edges = resolveImports(MAIN_TS, content);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0]?.to).toBe(UTILS_TS);
  });

  it('deduplicates repeated imports of the same file', () => {
    const content = `
      import { add } from './utils';
      import { greet } from './utils';
    `;
    const edges = resolveImports(MAIN_TS, content);
    expect(edges).toHaveLength(1);
  });

  it('returns empty array when no local imports exist', () => {
    const edges = resolveImports(MAIN_TS, `export const X = 1;`);
    expect(edges).toHaveLength(0);
  });

  it('skips imports that cannot be resolved on disk', () => {
    const content = `import { foo } from './does-not-exist.js';`;
    const edges = resolveImports(MAIN_TS, content);
    expect(edges).toHaveLength(0);
  });

  it('resolves parent directory imports (..)', () => {
    const deepFile = path.join(FIXTURE_ROOT, 'src', 'nested', 'deep.ts');
    const content = `import { greet } from '../utils';`;
    const edges = resolveImports(deepFile, content);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0]?.to).toBe(UTILS_TS);
  });
});
