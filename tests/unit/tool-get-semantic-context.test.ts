import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { handleGetSemanticContext } from '../../src/tools/get-semantic-context.js';
import { loadConfig } from '../../src/config/index.js';
import { PathEscapeError, FileNotFoundError } from '../../src/utils/errors.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/simple-ts-project');
const config = loadConfig({ root: FIXTURE_ROOT });

describe('handleGetSemanticContext', () => {
  it('returns markdown output with entry file section', async () => {
    const result = await handleGetSemanticContext({ file_path: 'src/main.ts' }, config);
    expect(result).toContain('# Semantic Context for:');
    expect(result).toContain('main.ts');
  });

  it('includes entry file content in a code block', async () => {
    const result = await handleGetSemanticContext({ file_path: 'src/main.ts' }, config);
    expect(result).toContain('```typescript');
    expect(result).toContain('greet');
  });

  it('includes local dependencies section when imports exist', async () => {
    const result = await handleGetSemanticContext({ file_path: 'src/main.ts' }, config);
    expect(result).toContain('## Local Dependencies');
    expect(result).toContain('utils.ts');
  });

  it('outputs language and line stats', async () => {
    const result = await handleGetSemanticContext({ file_path: 'src/main.ts' }, config);
    expect(result).toContain('typescript');
    expect(result).toMatch(/Lines:\s*\d+/);
  });

  it('depth 0 returns only entry file with no dependencies section', async () => {
    const result = await handleGetSemanticContext({ file_path: 'src/main.ts', depth: 0 }, config);
    expect(result).not.toContain('## Local Dependencies');
  });

  it('throws FileNotFoundError for non-existent file', async () => {
    await expect(
      handleGetSemanticContext({ file_path: 'src/nonexistent.ts' }, config),
    ).rejects.toThrow(FileNotFoundError);
  });

  it('throws PathEscapeError for path traversal attempt', async () => {
    await expect(
      handleGetSemanticContext({ file_path: '../../etc/passwd' }, config),
    ).rejects.toThrow(PathEscapeError);
  });
});
