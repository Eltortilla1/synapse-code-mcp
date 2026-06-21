import path from 'node:path';
import fs from 'node:fs';

export function findTsConfig(root: string): string | null {
  let dir = root;

  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(candidate)) return candidate;

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}
