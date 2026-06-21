import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readFile } from '../../src/core/fs/file-reader.js';
import { FileTooLargeError, BinaryFileError } from '../../src/utils/errors.js';

const TMP = path.join(os.tmpdir(), 'synapse-file-reader-test');

beforeAll(() => {
  fs.mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('readFile', () => {
  it('reads a text file and returns content, size and line count', () => {
    const filePath = path.join(TMP, 'hello.ts');
    fs.writeFileSync(filePath, 'const x = 1;\nconst y = 2;\n');

    const result = readFile(filePath, 512 * 1024);
    expect(result.content).toBe('const x = 1;\nconst y = 2;\n');
    expect(result.lines).toBe(3);
    expect(result.size).toBeGreaterThan(0);
  });

  it('counts lines correctly for single-line file', () => {
    const filePath = path.join(TMP, 'single.ts');
    fs.writeFileSync(filePath, 'export const X = 42;');

    const result = readFile(filePath, 512 * 1024);
    expect(result.lines).toBe(1);
  });

  it('throws FileTooLargeError when file exceeds maxSize', () => {
    const filePath = path.join(TMP, 'large.txt');
    fs.writeFileSync(filePath, 'x'.repeat(100));

    expect(() => readFile(filePath, 50)).toThrow(FileTooLargeError);
  });

  it('throws BinaryFileError for file containing null bytes', () => {
    const filePath = path.join(TMP, 'binary.bin');
    const buf = Buffer.alloc(16);
    buf[4] = 0x00;
    fs.writeFileSync(filePath, buf);

    expect(() => readFile(filePath, 512 * 1024)).toThrow(BinaryFileError);
  });

  it('reads empty file without error', () => {
    const filePath = path.join(TMP, 'empty.ts');
    fs.writeFileSync(filePath, '');

    const result = readFile(filePath, 512 * 1024);
    expect(result.content).toBe('');
    expect(result.size).toBe(0);
    expect(result.lines).toBe(1);
  });
});
