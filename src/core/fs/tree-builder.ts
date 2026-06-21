import fs from 'node:fs';
import path from 'node:path';
import { Ignore } from 'ignore';
import { TreeNode, TreeResult } from '../../types/tree.js';

interface BuildOptions {
  root: string;
  maxDepth: number;
  showHidden: boolean;
  ig: Ignore;
}

function buildNode(absPath: string, opts: BuildOptions, depth: number): TreeNode | null {
  const name = path.basename(absPath);
  const relPath = path.relative(opts.root, absPath);

  if (!opts.showHidden && name.startsWith('.') && relPath !== '') {
    return null;
  }

  if (relPath !== '' && opts.ig.ignores(relPath)) {
    return null;
  }

  const stat = fs.statSync(absPath);

  if (stat.isFile()) {
    return {
      name,
      path: relPath,
      type: 'file',
      size: stat.size,
    };
  }

  if (stat.isDirectory()) {
    if (depth >= opts.maxDepth) {
      return { name, path: relPath, type: 'dir' };
    }

    const entries = fs.readdirSync(absPath).sort();
    const children: TreeNode[] = [];

    for (const entry of entries) {
      const child = buildNode(path.join(absPath, entry), opts, depth + 1);
      if (child !== null) {
        children.push(child);
      }
    }

    return { name, path: relPath, type: 'dir', children };
  }

  return null;
}

function countStats(nodes: TreeNode[]): { totalFiles: number; totalDirs: number } {
  let totalFiles = 0;
  let totalDirs = 0;

  for (const node of nodes) {
    if (node.type === 'file') {
      totalFiles++;
    } else {
      totalDirs++;
      if (node.children) {
        const sub = countStats(node.children);
        totalFiles += sub.totalFiles;
        totalDirs += sub.totalDirs;
      }
    }
  }

  return { totalFiles, totalDirs };
}

export function buildTree(opts: BuildOptions): TreeResult {
  const entries = fs.readdirSync(opts.root).sort();
  const tree: TreeNode[] = [];

  for (const entry of entries) {
    const absPath = path.join(opts.root, entry);
    const node = buildNode(absPath, opts, 1);
    if (node !== null) {
      tree.push(node);
    }
  }

  const stats = countStats(tree);

  return { root: opts.root, tree, stats };
}

export function treeToText(nodes: TreeNode[], prefix = ''): string {
  const lines: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    lines.push(`${prefix}${connector}${node.name}${node.type === 'dir' ? '/' : ''}`);

    if (node.children && node.children.length > 0) {
      lines.push(treeToText(node.children, prefix + childPrefix));
    }
  }

  return lines.join('\n');
}
