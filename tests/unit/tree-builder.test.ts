import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { buildTree, treeToText } from '../../src/core/fs/tree-builder.js';
import { loadIgnore } from '../../src/core/fs/ignore-resolver.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/simple-ts-project');

describe('tree-builder', () => {
  it('builds tree for simple TS project', () => {
    const ig = loadIgnore(FIXTURE_ROOT);
    const result = buildTree({ root: FIXTURE_ROOT, maxDepth: 5, showHidden: false, ig });

    expect(result.stats.totalFiles).toBeGreaterThan(0);
    expect(result.tree.length).toBeGreaterThan(0);
  });

  it('finds src/main.ts and src/utils.ts', () => {
    const ig = loadIgnore(FIXTURE_ROOT);
    const result = buildTree({ root: FIXTURE_ROOT, maxDepth: 5, showHidden: false, ig });

    const allPaths = flattenPaths(result.tree);
    expect(allPaths).toContain(path.join('src', 'main.ts'));
    expect(allPaths).toContain(path.join('src', 'utils.ts'));
  });

  it('respects maxDepth', () => {
    const ig = loadIgnore(FIXTURE_ROOT);
    const result = buildTree({ root: FIXTURE_ROOT, maxDepth: 1, showHidden: false, ig });

    const srcNode = result.tree.find((n) => n.name === 'src');
    expect(srcNode?.children).toBeUndefined();
  });

  it('treeToText produces non-empty string', () => {
    const ig = loadIgnore(FIXTURE_ROOT);
    const result = buildTree({ root: FIXTURE_ROOT, maxDepth: 5, showHidden: false, ig });
    const text = treeToText(result.tree);
    expect(text).toContain('src');
  });
});

function flattenPaths(nodes: import('../../src/types/tree.js').TreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    paths.push(node.path);
    if (node.children) paths.push(...flattenPaths(node.children));
  }
  return paths;
}
