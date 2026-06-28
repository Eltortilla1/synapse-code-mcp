import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { handleGetProjectIndex } from '../../src/tools/get-project-index.js';
import { loadConfig } from '../../src/config/index.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/integration-project');
const config = loadConfig({ root: FIXTURE_ROOT });

describe('Integration: get_project_index', () => {
  it('returns a markdown header with project name and counts', async () => {
    const result = await handleGetProjectIndex({}, config);
    expect(result).toMatch(/^# Project Index:/m);
    expect(result).toMatch(/\d+ file/);
    expect(result).toMatch(/\d+ symbol/);
  });

  it('lists user-service.ts as a section', async () => {
    const result = await handleGetProjectIndex({}, config);
    expect(result).toContain('user-service.ts');
  });

  it('shows UserService class entry', async () => {
    const result = await handleGetProjectIndex({}, config);
    expect(result).toContain('UserService (class)');
  });

  it('shows UserService methods without bodies', async () => {
    const result = await handleGetProjectIndex({}, config);
    // Signatures present
    expect(result).toMatch(/add\(/);
    expect(result).toMatch(/getAll\(/);
    // No implementation
    expect(result).not.toContain('this.users.push');
    expect(result).not.toContain('return [...');
  });

  it('shows User interface entry in models/user.ts', async () => {
    const result = await handleGetProjectIndex({}, config);
    expect(result).toContain('User (interface)');
  });

  it('shows createUser exported function', async () => {
    const result = await handleGetProjectIndex({}, config);
    expect(result).toMatch(/createUser\(/);
  });

  it('file_pattern restricts output to matched files only', async () => {
    const result = await handleGetProjectIndex(
      { file_pattern: 'src/models/**/*.ts' },
      config,
    );
    expect(result).toContain('user.ts');
    expect(result).not.toContain('user-service.ts');
  });

  it('includes a hint to call get_semantic_context', async () => {
    const result = await handleGetProjectIndex({}, config);
    expect(result).toContain('get_semantic_context');
  });

  it('returns valid JSON when output_format is "json"', async () => {
    const result = await handleGetProjectIndex({ output_format: 'json' }, config);
    const parsed = JSON.parse(result) as { totalFiles: number; totalSymbols: number; files: unknown[] };
    expect(parsed).toHaveProperty('totalFiles');
    expect(parsed).toHaveProperty('totalSymbols');
    expect(parsed).toHaveProperty('files');
    expect(Array.isArray(parsed.files)).toBe(true);
    expect(parsed.totalFiles).toBeGreaterThan(0);
  });

  it('returns markdown by default when output_format is omitted', async () => {
    const result = await handleGetProjectIndex({}, config);
    expect(result).toMatch(/^# Project Index:/m);
    expect(() => { JSON.parse(result); }).toThrow();
  });

  it('returns "No indexable source files" for an empty directory', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-empty-'));
    try {
      const emptyConfig = loadConfig({ root: emptyDir });
      const result = await handleGetProjectIndex({}, emptyConfig);
      expect(result).toMatch(/no indexable/i);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
