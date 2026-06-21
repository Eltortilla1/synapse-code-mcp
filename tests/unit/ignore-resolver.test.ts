import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadIgnore, shouldIgnore } from '../../src/core/fs/ignore-resolver.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/simple-ts-project');

describe('ignore-resolver', () => {
  it('loads without error for a project with .gitignore', () => {
    const ig = loadIgnore(FIXTURE_ROOT);
    expect(ig).toBeDefined();
  });

  it('ignores node_modules by default', () => {
    const ig = loadIgnore(FIXTURE_ROOT);
    expect(shouldIgnore(ig, FIXTURE_ROOT, path.join(FIXTURE_ROOT, 'node_modules', 'pkg', 'index.js'))).toBe(true);
  });

  it('does not ignore src files', () => {
    const ig = loadIgnore(FIXTURE_ROOT);
    expect(shouldIgnore(ig, FIXTURE_ROOT, path.join(FIXTURE_ROOT, 'src', 'main.ts'))).toBe(false);
  });

  it('applies extra patterns from config', () => {
    const ig = loadIgnore(FIXTURE_ROOT, ['*.test.ts']);
    expect(shouldIgnore(ig, FIXTURE_ROOT, path.join(FIXTURE_ROOT, 'src', 'foo.test.ts'))).toBe(true);
  });
});
