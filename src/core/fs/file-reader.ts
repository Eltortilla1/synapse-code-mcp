import fs from 'node:fs';
import { FileTooLargeError, BinaryFileError } from '../../utils/errors.js';

const BINARY_CHECK_BYTES = 8000;

function isBinary(buffer: Buffer): boolean {
  const bytesToCheck = Math.min(buffer.length, BINARY_CHECK_BYTES);
  for (let i = 0; i < bytesToCheck; i++) {
    const byte = buffer[i];
    if (byte === undefined) break;
    if (byte === 0) return true;
  }
  return false;
}

export interface ReadResult {
  content: string;
  size: number;
  lines: number;
}

export function readFile(absPath: string, maxSize: number): ReadResult {
  const stat = fs.statSync(absPath);
  const size = stat.size;

  if (size > maxSize) {
    throw new FileTooLargeError(absPath, size, maxSize);
  }

  const buffer = fs.readFileSync(absPath);

  if (isBinary(buffer)) {
    throw new BinaryFileError(absPath);
  }

  const content = buffer.toString('utf-8');
  const lines = content.split('\n').length;

  return { content, size, lines };
}
