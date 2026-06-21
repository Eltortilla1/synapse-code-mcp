import path from 'node:path';
import fs from 'node:fs';
import { DependencyEdge } from '../../types/context.js';

const IMPORT_PATTERNS: RegExp[] = [
  /^\s*import\s+.*?\s+from\s+['"]([^'"]+)['"]/gm,
  /^\s*(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm,
  /^\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm,
  /^\s*from\s+['"]([^'"]+)['"]\s*import/gm,
  /^\s*import\s+['"]([^'"]+)['"]/gm,
];

function isLocalImport(importPath: string): boolean {
  return importPath.startsWith('./') || importPath.startsWith('../');
}

function tryResolve(fromDir: string, importPath: string): string | null {
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  for (const ext of extensions) {
    const candidate = path.resolve(fromDir, importPath + ext);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    const candidate = path.resolve(fromDir, importPath, 'index' + ext);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveImports(filePath: string, content: string): DependencyEdge[] {
  const fromDir = path.dirname(filePath);
  const edges: DependencyEdge[] = [];
  const seen = new Set<string>();

  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const importStr = match[1];
      if (!importStr || !isLocalImport(importStr)) continue;

      const resolved = tryResolve(fromDir, importStr);
      if (!resolved || seen.has(resolved)) continue;

      seen.add(resolved);
      edges.push({
        from: filePath,
        to: resolved,
        importStatement: match[0].trim(),
      });
    }
  }

  return edges;
}