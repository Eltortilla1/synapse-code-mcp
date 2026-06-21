import path from 'node:path';
import fs from 'node:fs';
import { PathEscapeError, FileNotFoundError } from './errors.js';

export function resolveAndValidate(root: string, userPath: string): string {
  if (userPath.includes('\0')) {
    throw new PathEscapeError(userPath, root);
  }

  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, userPath);

  if (!abs.startsWith(absRoot + path.sep) && abs !== absRoot) {
    throw new PathEscapeError(userPath, root);
  }

  // Resolve symlinks to prevent escape via a link pointing outside root.
  // realpathSync requires the path to exist; ENOENT means the path is new
  // and cannot be a symlink — let the caller's assertExists() handle it.
  try {
    const real = fs.realpathSync(abs);
    if (!real.startsWith(absRoot + path.sep) && real !== absRoot) {
      throw new PathEscapeError(userPath, root);
    }
    return real;
  } catch (err: unknown) {
    if (err instanceof PathEscapeError) throw err;
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return abs;
    throw err;
  }
}

export function toRelative(root: string, absPath: string): string {
  return path.relative(path.resolve(root), absPath);
}

export function assertExists(absPath: string): void {
  if (!fs.existsSync(absPath)) {
    throw new FileNotFoundError(absPath);
  }
}

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.cs': 'csharp',
    '.cpp': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.hpp': 'cpp',
    '.php': 'php',
    '.swift': 'swift',
    '.md': 'markdown',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sql': 'sql',
  };
  return map[ext] ?? 'text';
}
