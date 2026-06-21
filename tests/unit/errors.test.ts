import { describe, it, expect } from 'vitest';
import {
  SynapseError,
  PathEscapeError,
  FileTooLargeError,
  BinaryFileError,
  FileNotFoundError,
  ConfigError,
} from '../../src/utils/errors.js';

describe('SynapseError', () => {
  it('sets name, message and code', () => {
    const err = new SynapseError('something went wrong', 'MY_CODE');
    expect(err.name).toBe('SynapseError');
    expect(err.message).toBe('something went wrong');
    expect(err.code).toBe('MY_CODE');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('PathEscapeError', () => {
  it('has correct code and name', () => {
    const err = new PathEscapeError('../etc/passwd', '/project');
    expect(err.name).toBe('PathEscapeError');
    expect(err.code).toBe('PATH_ESCAPE');
    expect(err.message).toContain('../etc/passwd');
    expect(err.message).toContain('/project');
    expect(err).toBeInstanceOf(SynapseError);
  });
});

describe('FileTooLargeError', () => {
  it('includes file path, actual size and max size in message', () => {
    const err = new FileTooLargeError('/some/file.ts', 1024 * 1024, 512 * 1024);
    expect(err.name).toBe('FileTooLargeError');
    expect(err.code).toBe('FILE_TOO_LARGE');
    expect(err.message).toContain('/some/file.ts');
    expect(err.message).toContain('1048576');
    expect(err.message).toContain('524288');
  });
});

describe('BinaryFileError', () => {
  it('has correct code and includes path', () => {
    const err = new BinaryFileError('/some/image.png');
    expect(err.name).toBe('BinaryFileError');
    expect(err.code).toBe('BINARY_FILE');
    expect(err.message).toContain('/some/image.png');
  });
});

describe('FileNotFoundError', () => {
  it('has correct code and includes path', () => {
    const err = new FileNotFoundError('/missing/file.ts');
    expect(err.name).toBe('FileNotFoundError');
    expect(err.code).toBe('FILE_NOT_FOUND');
    expect(err.message).toContain('/missing/file.ts');
  });
});

describe('ConfigError', () => {
  it('has correct code', () => {
    const err = new ConfigError('bad value for maxDepth');
    expect(err.name).toBe('ConfigError');
    expect(err.code).toBe('CONFIG_ERROR');
    expect(err.message).toBe('bad value for maxDepth');
  });
});
