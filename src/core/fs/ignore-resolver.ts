import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import type { Ignore } from 'ignore';
import { DEFAULT_IGNORE_PATTERNS } from '../../config/defaults.js';

const require = createRequire(import.meta.url);
const ignoreFactory = require('ignore') as () => Ignore;

export function loadIgnore(root: string, extraPatterns: string[] = []): Ignore {
  const ig = ignoreFactory();

  ig.add(DEFAULT_IGNORE_PATTERNS);

  if (extraPatterns.length > 0) {
    ig.add(extraPatterns);
  }

  const gitignorePath = path.join(root, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    ig.add(content);
  }

  return ig;
}

export function shouldIgnore(ig: Ignore, root: string, absPath: string): boolean {
  const rel = path.relative(root, absPath);
  if (rel === '' || rel.startsWith('..')) return false;
  return ig.ignores(rel);
}
