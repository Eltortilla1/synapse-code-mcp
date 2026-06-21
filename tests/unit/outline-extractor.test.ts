import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { extractOutline } from '../../src/core/analysis/outline-extractor.js';

// ── TypeScript fixture written to a temp dir ────────────────────────────────

let tmpDir: string;
let tsFile: string;
let nonTsFile: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-outline-'));

  // TypeScript fixture
  tsFile = path.join(tmpDir, 'sample.ts');
  fs.writeFileSync(
    tsFile,
    `
export interface User {
  id: number;
  name: string;
  email?: string;
}

export type UserId = number;

export enum Role {
  Admin,
  Guest,
}

export function greet(name: string): string {
  return 'Hello ' + name;
}

async function internalHelper(): Promise<void> {
  // not exported
}

export class UserService {
  private users: Map<number, User>;

  constructor(initialCapacity: number) {
    this.users = new Map();
  }

  add(id: number, name: string): void {
    this.users.set(id, { id, name });
  }

  static create(): UserService {
    return new UserService(16);
  }
}
`.trim(),
  );

  // Generic JS fixture
  nonTsFile = path.join(tmpDir, 'helpers.js');
  fs.writeFileSync(
    nonTsFile,
    `
export function formatDate(d) {
  return d.toISOString();
}

export class Formatter {
  format(s) { return s.trim(); }
}

function internalUtil() {}
`.trim(),
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── TypeScript extraction ────────────────────────────────────────────────────

describe('extractOutline — TypeScript', () => {
  it('extracts exported function with signature', () => {
    const outline = extractOutline(tsFile, tmpDir);
    const greet = outline.symbols.find((s) => s.name === 'greet');
    expect(greet).toBeDefined();
    expect(greet?.kind).toBe('function');
    expect(greet?.exported).toBe(true);
    expect(greet?.signature).toContain('greet(');
    expect(greet?.signature).toContain('string');
  });

  it('marks non-exported function as not exported', () => {
    const outline = extractOutline(tsFile, tmpDir);
    const helper = outline.symbols.find((s) => s.name === 'internalHelper');
    expect(helper).toBeDefined();
    expect(helper?.exported).toBe(false);
  });

  it('extracts exported interface with properties', () => {
    const outline = extractOutline(tsFile, tmpDir);
    const iface = outline.symbols.find((s) => s.name === 'User' && s.kind === 'interface');
    expect(iface).toBeDefined();
    expect(iface?.exported).toBe(true);

    const props = outline.symbols.filter((s) => s.kind === 'variable');
    expect(props.some((p) => p.signature.includes('id'))).toBe(true);
    expect(props.some((p) => p.signature.includes('name'))).toBe(true);
  });

  it('marks optional interface property with ?', () => {
    const outline = extractOutline(tsFile, tmpDir);
    const emailProp = outline.symbols.find(
      (s) => s.kind === 'variable' && s.name === 'email',
    );
    expect(emailProp?.signature).toContain('?');
  });

  it('extracts type alias', () => {
    const outline = extractOutline(tsFile, tmpDir);
    const type = outline.symbols.find((s) => s.name === 'UserId' && s.kind === 'type');
    expect(type).toBeDefined();
    expect(type?.exported).toBe(true);
  });

  it('extracts enum with members', () => {
    const outline = extractOutline(tsFile, tmpDir);
    const en = outline.symbols.find((s) => s.name === 'Role' && s.kind === 'enum');
    expect(en).toBeDefined();
    expect(en?.signature).toContain('Admin');
    expect(en?.signature).toContain('Guest');
  });

  it('extracts class and its constructor + methods', () => {
    const outline = extractOutline(tsFile, tmpDir);
    const cls = outline.symbols.find((s) => s.name === 'UserService' && s.kind === 'class');
    expect(cls).toBeDefined();
    expect(cls?.exported).toBe(true);

    const ctor = outline.symbols.find((s) => s.kind === 'method' && s.name === 'constructor');
    expect(ctor).toBeDefined();
    expect(ctor?.signature).toContain('constructor(');

    const add = outline.symbols.find((s) => s.kind === 'method' && s.name === 'add');
    expect(add).toBeDefined();
    expect(add?.signature).toContain('add(');

    const staticCreate = outline.symbols.find((s) => s.kind === 'method' && s.name === 'create');
    expect(staticCreate?.signature).toContain('static');
  });

  it('returns typescript as language', () => {
    const outline = extractOutline(tsFile, tmpDir);
    expect(outline.language).toBe('typescript');
  });

  it('does NOT include function bodies in signature', () => {
    const outline = extractOutline(tsFile, tmpDir);
    const greet = outline.symbols.find((s) => s.name === 'greet');
    expect(greet?.signature).not.toContain('Hello');
    expect(greet?.signature).not.toContain('return');
  });
});

// ── Generic (JS/non-TS) extraction ──────────────────────────────────────────

describe('extractOutline — generic (JS)', () => {
  it('extracts exported function via regex', () => {
    const outline = extractOutline(nonTsFile, tmpDir);
    const fn = outline.symbols.find((s) => s.name === 'formatDate');
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe('function');
    expect(fn?.exported).toBe(true);
  });

  it('extracts exported class via regex', () => {
    const outline = extractOutline(nonTsFile, tmpDir);
    const cls = outline.symbols.find((s) => s.name === 'Formatter');
    expect(cls).toBeDefined();
    expect(cls?.kind).toBe('class');
  });

  it('marks non-exported function correctly', () => {
    const outline = extractOutline(nonTsFile, tmpDir);
    const util = outline.symbols.find((s) => s.name === 'internalUtil');
    expect(util?.exported).toBe(false);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('extractOutline — edge cases', () => {
  it('returns empty symbols array for empty file', () => {
    const emptyFile = path.join(tmpDir, 'empty.ts');
    fs.writeFileSync(emptyFile, '');
    const outline = extractOutline(emptyFile, tmpDir);
    expect(outline.symbols).toHaveLength(0);
  });

  it('returns empty symbols and does not throw for a non-existent generic file', () => {
    const missing = path.join(tmpDir, 'missing.py');
    const outline = extractOutline(missing, tmpDir);
    expect(outline.symbols).toHaveLength(0);
  });

  it('returns correct relativePath', () => {
    const outline = extractOutline(tsFile, tmpDir);
    expect(outline.relativePath).toBe('sample.ts');
  });
});
